require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;

// CORS voor frontend
app.use(cors({
  origin: 'http://localhost:4000',
  credentials: true
}));

// Serve static frontend bestanden uit '/public'
app.use(express.static('public'));

// Helpers voor TMDB
const tmdb = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  headers: {
    Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
    'Content-Type': 'application/json;charset=utf-8'
  }
});

// Helpers voor screenings opslag
function loadScreenings() {
  const data = fs.readFileSync(path.join(__dirname, 'screenings.json'));
  return JSON.parse(data);
}
function saveScreenings(screenings) {
  fs.writeFileSync(
    path.join(__dirname, 'screenings.json'),
    JSON.stringify(screenings, null, 2)
  );
}

// Helpers voor users opslag
function loadUsers() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json')));
}
function saveUsers(users) {
  fs.writeFileSync(
    path.join(__dirname, 'users.json'),
    JSON.stringify(users, null, 2)
  );
}

// JWT configuratie
const JWT_SECRET = process.env.JWT_SECRET || 'eenSuperGeheim';
const JWT_EXPIRES = '1h';

// Middleware: JWT authenticatie
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Geen token meegegeven' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Token ongeldig' });
    req.user = payload;
    next();
  });
}

// Middleware: rol autorisatie
function authorizeRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Niet geautoriseerd' });
    }
    next();
  };
}

// Auth routes
app.post('/register', express.json(), async (req, res) => {
  const { username, password, role } = req.body;
  const users = loadUsers();
  if (users.some(u => u.username === username)) {
    return res.status(400).json({ error: 'Gebruikersnaam bestaat al' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = {
    id: users.length ? users[users.length - 1].id + 1 : 1,
    username,
    passwordHash,
    role: role === 'manager' ? 'manager' : 'user'
  };
  users.push(newUser);
  saveUsers(users);
  res.status(201).json({ message: 'Registratie geslaagd' });
});

app.post('/login', express.json(), async (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Onbekende gebruiker' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Ongeldig wachtwoord' });

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
  res.json({ token });
});

app.get('/me', authenticateJWT, (req, res) => {
  res.json(req.user);
});

// Public TMDB endpoint
app.get('/movies', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const response = await tmdb.get('/movie/popular', { params: { page } });
    const movies = response.data.results.map(movie => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      poster_path: movie.poster_path
    }));
    res.json({ page, movies });
  } catch (err) {
    console.error('Error fetching movies:', err.message);
    res.status(500).json({ error: 'Kon films niet ophalen' });
  }
});

// Public screenings GET
app.get('/screenings', async (req, res) => {
  const screenings = loadScreenings();

  // Verrijk elke screening met filmgegevens van TMDB
  const enrichedScreenings = await Promise.all(
    screenings.map(async screening => {
      try {
        const response = await tmdb.get(`/movie/${screening.movieId}`);
        const movie = response.data;

        return {
          ...screening,
          title: movie.title,
          poster_path: movie.poster_path,
          release_date: movie.release_date
        };
      } catch (err) {
        console.error(`Kon filmdata niet ophalen voor ID ${screening.movieId}`, err.message);
        return screening; // fallback als er iets foutgaat
      }
    })
  );

  res.json(enrichedScreenings);
});


// Manager-only CRUD voor screenings
app.post('/screenings',
  authenticateJWT,
  authorizeRole('manager'),
  express.json(),
  (req, res) => {
    const screenings = loadScreenings();
    const { movieId, startTime, totalSeats } = req.body;
    const newScreening = {
      id: screenings.length ? screenings[screenings.length - 1].id + 1 : 1,
      movieId,
      startTime,
      totalSeats,
      availableSeats: totalSeats
    };
    screenings.push(newScreening);
    saveScreenings(screenings);
    res.status(201).json(newScreening);
  }
);

app.put('/screenings/:id',
  authenticateJWT,
  authorizeRole('manager'),
  express.json(),
  (req, res) => {
    const screenings = loadScreenings();
    const id = parseInt(req.params.id, 10);
    const idx = screenings.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });

    const updated = { ...screenings[idx], ...req.body };
    screenings[idx] = updated;
    saveScreenings(screenings);
    res.json(updated);
  }
);

app.delete('/screenings/:id',
  authenticateJWT,
  authorizeRole('manager'),
  (req, res) => {
    let screenings = loadScreenings();
    const id = parseInt(req.params.id, 10);
    if (!screenings.some(s => s.id === id)) {
      return res.status(404).json({ error: 'Niet gevonden' });
    }
    screenings = screenings.filter(s => s.id !== id);
    saveScreenings(screenings);
    res.status(204).send();
  }
);

// Server starten
app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});

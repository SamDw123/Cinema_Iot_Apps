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

// Static files in 'public'
app.use(express.static('public'));

// Body parser voor JSON payloads
app.use(express.json());

// TMDB client setup
const tmdb = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  headers: {
    Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
    'Content-Type': 'application/json;charset=utf-8'
  }
});

// Storage helpers
function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, filename)));
}
function saveJson(filename, data) {
  fs.writeFileSync(
    path.join(__dirname, filename),
    JSON.stringify(data, null, 2)
  );
}

// JWT config
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = '1h';

// Auth middleware
function authenticateJWT(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Geen token meegegeven' });
  const token = header.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Ongeldig token' });
    req.user = payload;
    next();
  });
}
function authorizeRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Niet geautoriseerd' });
    }
    next();
  };
}

// ---- Auth routes ----
app.post('/register', (req, res) => {
  const { username, password, role } = req.body;
  const users = loadJson('users.json');
  if (users.some(u => u.username === username)) {
    return res.status(400).json({ error: 'Gebruikersnaam bestaat al' });
  }
  bcrypt.hash(password, 10).then(hash => {
    const newUser = {
      id: users.length ? users[users.length - 1].id + 1 : 1,
      username,
      passwordHash: hash,
      role: role === 'manager' ? 'manager' : 'user'
    };
    users.push(newUser);
    saveJson('users.json', users);
    res.status(201).json({ message: 'Registratie geslaagd' });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadJson('users.json');
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Onbekende gebruiker' });
  bcrypt.compare(password, user.passwordHash).then(valid => {
    if (!valid) return res.status(401).json({ error: 'Ongeldig wachtwoord' });
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ token });
  });
});

app.get('/me', authenticateJWT, (req, res) => {
  res.json(req.user);
});

// ---- Movies endpoint ----
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
    console.error(err);
    res.status(500).json({ error: 'Kon films niet ophalen' });
  }
});

// ---- Screenings CRUD ----
app.get('/screenings', (req, res) => {
  const screenings = loadJson('screenings.json');
  res.json(screenings);
});
app.post(
  '/screenings',
  authenticateJWT,
  authorizeRole('manager'),
  (req, res) => {
    const screenings = loadJson('screenings.json');
    const { movieId, startTime, totalSeats } = req.body;
    const newScreening = {
      id: screenings.length ? screenings[screenings.length - 1].id + 1 : 1,
      movieId,
      startTime,
      totalSeats,
      availableSeats: totalSeats
    };
    screenings.push(newScreening);
    saveJson('screenings.json', screenings);
    res.status(201).json(newScreening);
  }
);
app.put(
  '/screenings/:id',
  authenticateJWT,
  authorizeRole('manager'),
  (req, res) => {
    const screenings = loadJson('screenings.json');
    const id = parseInt(req.params.id, 10);
    const idx = screenings.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });
    const updated = { ...screenings[idx], ...req.body };
    screenings[idx] = updated;
    saveJson('screenings.json', screenings);
    res.json(updated);
  }
);
app.delete(
  '/screenings/:id',
  authenticateJWT,
  authorizeRole('manager'),
  (req, res) => {
    let screenings = loadJson('screenings.json');
    const id = parseInt(req.params.id, 10);
    screenings = screenings.filter(s => s.id !== id);
    saveJson('screenings.json', screenings);
    res.status(204).send();
  }
);

// ---- Ticket reservation ----
app.post(
  '/reserve',
  authenticateJWT,
  (req, res) => {
    // alleen role user toegestaan
    if (req.user.role !== 'user') {
      return res.status(403).json({ error: 'Alleen gewone gebruikers mogen reserveren' });
    }
    const { screeningId } = req.body;
    const screenings = loadJson('screenings.json');
    const tickets = loadJson('tickets.json');
    const scr = screenings.find(s => s.id === screeningId);
    if (!scr) return res.status(404).json({ error: 'Voorstelling niet gevonden' });
    if (scr.availableSeats < 1) {
      return res.status(400).json({ error: 'Geen plaatsen meer beschikbaar' });
    }
    // controleer of user al een ticket heeft voor deze screening
    if (tickets.some(t => t.screeningId === screeningId && t.userId === req.user.userId)) {
      return res.status(400).json({ error: 'Je hebt al een ticket voor deze voorstelling' });
    }
    // verlaag beschikbaarheid
    scr.availableSeats--;
    saveJson('screenings.json', screenings);
    // maak nieuw ticket
    const newTicket = {
      id: tickets.length ? tickets[tickets.length - 1].id + 1 : 1,
      screeningId,
      userId: req.user.userId
    };
    tickets.push(newTicket);
    saveJson('tickets.json', tickets);
    res.status(201).json(newTicket);
  }
);

// ---- Availability endpoint for real-time updates ----
app.get('/screenings/:id/tickets', (req, res) => {
  const screeningId = parseInt(req.params.id, 10);
  const screenings = loadJson('screenings.json');
  const scr = screenings.find(s => s.id === screeningId);
  if (!scr) return res.status(404).json({ error: 'Voorstelling niet gevonden' });
  res.json({ availableSeats: scr.availableSeats });
});

// Start server
app.listen(PORT, () => console.log(`Server draait op http://localhost:${PORT}`));
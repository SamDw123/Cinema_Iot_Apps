require('dotenv').config();
const express = require('express');
const http = require('http');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
// const WebSocket = require('ws');
const mqtt = require('mqtt');

const app = express();
const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: 'cinema_server_' + Math.random().toString(16).substr(2, 8),
  clean: true
});
const MQTT_TOPIC = 'cinema_sam123/seats/updates';

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

// Email configuratie
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

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
  const { username, password, email, role } = req.body;
  const users = loadJson('users.json');
  if (users.some(u => u.username === username)) {
    return res.status(400).json({ error: 'Gebruikersnaam bestaat al' });
  }
  if (users.some(u => u.email === email)) {
    return res.status(400).json({ error: 'Email bestaat al' });
  }
  bcrypt.hash(password, 10).then(hash => {
    const newUser = {
      id: users.length ? users[users.length - 1].id + 1 : 1,
      username,
      email,
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
app.get('/screenings', async (req, res) => {
  const screenings = loadJson('screenings.json');
  
  // Fetch movie details for screenings missing title/poster
  const updatedScreenings = [];
  for (const screening of screenings) {
    if (!screening.title || !screening.poster_path) {
      try {
        // Fetch movie details from TMDB
        const movieData = await tmdb.get(`/movie/${screening.movieId}`);
        screening.title = movieData.data.title;
        screening.poster_path = movieData.data.poster_path;
      } catch (err) {
        console.error(`Failed to fetch details for movie ID ${screening.movieId}:`, err.message);
        // Continue with missing data
      }
    }
    updatedScreenings.push(screening);
  }
  
  // Optionally save the updated screenings back to the file
  saveJson('screenings.json', updatedScreenings);
  
  res.json(updatedScreenings);
});
app.post(
  '/screenings',
  authenticateJWT,
  authorizeRole('manager'),
  async (req, res) => {
    const screenings = loadJson('screenings.json');
    const { movieId, startTime, totalSeats } = req.body;
    
    // Create new screening
    const newScreening = {
      id: screenings.length ? screenings[screenings.length - 1].id + 1 : 1,
      movieId,
      startTime,
      totalSeats,
      availableSeats: totalSeats
    };
    
    // Fetch movie details from TMDB
    try {
      const movieData = await tmdb.get(`/movie/${movieId}`);
      newScreening.title = movieData.data.title;
      newScreening.poster_path = movieData.data.poster_path;
    } catch (err) {
      console.error(`Failed to fetch details for movie ID ${movieId}:`, err.message);
      // Continue without movie details
    }
    
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
  async (req, res) => {
    if (req.user.role !== 'user') {
      return res.status(403).json({ error: 'Alleen gewone gebruikers mogen reserveren' });
    }

    const { screeningId, quantity = 1 } = req.body;
    const screenings = loadJson('screenings.json');
    const tickets = loadJson('tickets.json');
    const users = loadJson('users.json');
    const scr = screenings.find(s => s.id === screeningId);
    const user = users.find(u => u.id === req.user.userId);
    
    // Validate screening exists
    if (!scr) return res.status(404).json({ error: 'Voorstelling niet gevonden' });
    
    // Check if enough seats are available
    if (scr.availableSeats < quantity) {
      return res.status(400).json({ error: `Niet genoeg plaatsen beschikbaar (${scr.availableSeats} beschikbaar)` });
    }
    
    // Create tickets
    const newTickets = [];
    let lastId = tickets.length ? tickets[tickets.length - 1].id : 0;
    
    for (let i = 0; i < quantity; i++) {
      lastId++;
      const newTicket = {
        id: lastId,
        screeningId,
        userId: req.user.userId
      };
      tickets.push(newTicket);
      newTickets.push(newTicket);
    }
    
    // Update available seats
    scr.availableSeats -= quantity;
    
    // Save changes
    saveJson('screenings.json', screenings);
    saveJson('tickets.json', tickets);
    
    // Broadcast update via WebSocket
    publishSeatUpdate({
      type: 'updateSeats',
      screeningId,
      availableSeats: scr.availableSeats
    });

    // Stuur bevestigingsmail
    try {
      await transporter.sendMail({
        from: 'samdewispelaere@gmail.com',
        to: user.email,
        subject: 'Ticket Reservering Bevestiging',
        html: `
          <h1>Je reservering is bevestigd!</h1>
          <p>Beste ${user.username},</p>
          <p>Je hebt succesvol ${quantity} ticket(s) gereserveerd voor:</p>
          <ul>
            <li>Film: ${scr.title}</li>
            <li>Datum: ${new Date(scr.startTime).toLocaleString()}</li>
            <li>Ticket ID(s): ${newTickets.map(t => t.id).join(', ')}</li>
          </ul>
          <p>Tot ziens in de bioscoop!</p>
        `
      });
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      // We laten de reservering doorgaan zelfs als de mail faalt
    }
    
    res.status(201).json({
      tickets: newTickets,
      quantity: quantity
    });
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

// ---- User tickets endpoint ----
app.get('/my-tickets', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tickets = loadJson('tickets.json').filter(t => t.userId === userId);
    const screenings = loadJson('screenings.json');
    
    // Enrich tickets with screening and movie information
    const enrichedTickets = [];
    
    for (const ticket of tickets) {
      const screening = screenings.find(s => s.id === ticket.screeningId);
      if (!screening) continue;
      
      // Clone to avoid modifying the original object
      const enrichedTicket = {
        ...ticket,
        screening: {
          id: screening.id,
          startTime: screening.startTime,
          title: screening.title || `Film ID: ${screening.movieId}`,
          poster_path: screening.poster_path || null
        }
      };
      
      enrichedTickets.push(enrichedTicket);
    }
    
    res.json(enrichedTickets);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'Kon tickets niet ophalen' });
  }
});

// Zet Express om in HTTP-server en koppel WebSocket
//const server = http.createServer(app);
//const wss = new WebSocket.Server({ server });


// Broadcast helper via websocket
/*function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
} */


// MQTT instead of WebSocket for seat updates
function publishSeatUpdate(data) {
  client.publish(MQTT_TOPIC, JSON.stringify(data));
}

/*
wss.on('connection', ws => {
  console.log('Nieuwe WebSocket-verbinding');
});
*/

const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');

// laad je aparte YAML-file
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
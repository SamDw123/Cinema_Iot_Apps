require('dotenv').config();
const express = require('express');
const http = require('http');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

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

// Email transporter setup
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Email helper function
async function sendTicketEmail(userEmail, userName, tickets, screening) {
  const ticketIds = tickets.map(t => t.id).join(', ');
  const qrCodes = tickets.filter(t => t.qrCode).map(t => ({
    filename: `ticket-${t.id}.png`,
    content: t.qrCode.split(',')[1], // Remove data:image/png;base64, prefix
    encoding: 'base64',
    cid: `qr-${t.id}`
  }));

  const qrCodesHTML = tickets.map(t => 
    t.qrCode ? 
    `<div style="margin: 10px; text-align: center;">
      <p><strong>Ticket ID: ${t.id}</strong></p>
      <img src="cid:qr-${t.id}" alt="QR Code voor ticket ${t.id}" style="max-width: 200px; border: 1px solid #ccc;"/>
    </div>` : 
    `<p>Ticket ID: ${t.id} (QR code niet beschikbaar)</p>`
  ).join('');

  const mailOptions = {
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: userEmail,
    subject: `Ticket bevestiging - ${screening.title}`,
    html: `
      <h2>Ticket Bevestiging</h2>
      <p>Beste ${userName},</p>
      <p>Bedankt voor je reservering! Hier zijn je ticket details:</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3>Film: ${screening.title}</h3>
        <p><strong>Datum:</strong> ${new Date(screening.startTime).toLocaleDateString('nl-NL')}</p>
        <p><strong>Tijd:</strong> ${new Date(screening.startTime).toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'})}</p>
        <p><strong>Ticket ID's:</strong> ${ticketIds}</p>
        <p><strong>Aantal tickets:</strong> ${tickets.length}</p>
      </div>
      
      <h3>QR Codes:</h3>
      <p>Toon deze QR codes bij de ingang van de bioscoop:</p>
      ${qrCodesHTML}
      
      <p>Bewaar deze email goed en kom 15 minuten voor aanvang naar de bioscoop.</p>
      <p>Tot ziens bij de voorstelling!</p>
      
      <hr>
      <p><small>Cinema App - Automatisch gegenereerde email</small></p>
    `,
    attachments: qrCodes
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`Email verzonden naar ${userEmail} voor tickets: ${ticketIds}`);
    return true;
  } catch (error) {
    console.error('Email verzenden mislukt:', error);
    return false;
  }
}

// ---- Auth routes ----
app.post('/register', (req, res) => {
  const { username, password, role, email } = req.body;
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
    // Check user role
    if (req.user.role !== 'user') {
      return res.status(403).json({ error: 'Alleen gewone gebruikers mogen reserveren' });
    }
    
    const { screeningId, quantity = 1 } = req.body;
    const screenings = loadJson('screenings.json');
    const tickets = loadJson('tickets.json');
    const users = loadJson('users.json');
    const scr = screenings.find(s => s.id === screeningId);
    
    // Validate screening exists
    if (!scr) return res.status(404).json({ error: 'Voorstelling niet gevonden' });
    
    // Check if enough seats are available
    if (scr.availableSeats < quantity) {
      return res.status(400).json({ error: `Niet genoeg plaatsen beschikbaar (${scr.availableSeats} beschikbaar)` });
    }
    
    // QR Code generator helper
    async function generateQRCode(ticketData) {
      try {
        const qrData = JSON.stringify({
          ticketId: ticketData.id,
          screeningId: ticketData.screeningId,
          userId: ticketData.userId,
          timestamp: new Date().toISOString()
        });
        return await QRCode.toDataURL(qrData);
      } catch (err) {
        console.error('QR code generation failed:', err);
        return null;
      }
    }
    
    // Create tickets with QR codes
    const newTickets = [];
    let lastId = tickets.length ? tickets[tickets.length - 1].id : 0;
    
    for (let i = 0; i < quantity; i++) {
      lastId++;
      const newTicket = {
        id: lastId,
        screeningId,
        userId: req.user.userId
      };
      
      // Generate QR code for this ticket
      const qrCode = await generateQRCode(newTicket);
      if (qrCode) {
        newTicket.qrCode = qrCode;
      }
      
      tickets.push(newTicket);
      newTickets.push(newTicket);
    }
    
    // Update available seats
    scr.availableSeats -= quantity;
    
    // Save changes
    saveJson('screenings.json', screenings);
    saveJson('tickets.json', tickets);
    
    // Broadcast update
    broadcast({
      type: 'updateSeats',
      screeningId,
      availableSeats: scr.availableSeats
    });
    
    // Find the user by ID
    const user = users.find(u => u.id === req.user.userId);
    
    // Send confirmation email
    let emailSent = false;
    if (user && user.email) {
      emailSent = await sendTicketEmail(user.email, user.username, newTickets, scr);
    }
    
    res.status(201).json({
      tickets: newTickets,
      quantity: quantity,
      message: `${quantity} ticket(s) gereserveerd!`,
      emailSent: emailSent,
      emailMessage: emailSent ? 
        `Bevestigingsmail verzonden naar ${user.email}` : 
        'Email kon niet verzonden worden'
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
    
    const enrichedTickets = [];
    
    for (const ticket of tickets) {
      const screening = screenings.find(s => s.id === ticket.screeningId);
      if (!screening) continue;
      
      // Generate QR code if it doesn't exist
      let qrCode = ticket.qrCode;
      if (!qrCode) {
        qrCode = await generateQRCode(ticket);
        // Optionally save the generated QR code back to the ticket
        if (qrCode) {
          ticket.qrCode = qrCode;
          saveJson('tickets.json', loadJson('tickets.json')); // Reload and save to avoid conflicts
        }
      }
      
      const enrichedTicket = {
        ...ticket,
        qrCode: qrCode,
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
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Broadcast helper
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', ws => {
  console.log('Nieuwe WebSocket-verbinding');
});

const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');

// laad je aparte YAML-file
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
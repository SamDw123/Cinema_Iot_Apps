require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// CORS instellen voor verzoeken vanuit je frontend
app.use(cors({
  origin: 'http://localhost:4000',  // frontend komt straks ook vanaf poort 4000
  credentials: true
}));

// Static files serveren uit de 'public' map
// Hierdoor kun je in de browser gewoon naar http://localhost:4000/ gaan
app.use(express.static('public'));

// Pre-geconfigureerde TMDB-client met je Bearer token
const tmdb = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  headers: {
    Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
    'Content-Type': 'application/json;charset=utf-8'
  }
});

/**
 * GET /movies
 * Haalt populaire films op van TMDB en retourneert een geschoonde JSON.
 */
app.get('/movies', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const response = await tmdb.get('/movie/popular', {
      params: { page }
    });

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


// Helper om de JSON file te lezen
function loadScreenings() {
  const data = fs.readFileSync(path.join(__dirname, 'screenings.json'));
  return JSON.parse(data);
}

// Helper om de JSON file te schrijven
function saveScreenings(screenings) {
  fs.writeFileSync(
    path.join(__dirname, 'screenings.json'),
    JSON.stringify(screenings, null, 2)
  );
}

// 1) GET /screenings — lijst alle voorstellingen
app.get('/screenings', (req, res) => {
  const screenings = loadScreenings();
  res.json(screenings);
});

// 2) POST /screenings — nieuwe voorstelling aanmaken (Manager-only)
app.post('/screenings', express.json(), (req, res) => {
  // TODO: hier komt straks JWT-authenticatie check
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
});

// 3) PUT /screenings/:id — voorstelling bijwerken (Manager-only)
app.put('/screenings/:id', express.json(), (req, res) => {
  // TODO: auth-check
  const screenings = loadScreenings();
  const id = parseInt(req.params.id, 10);
  const idx = screenings.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });

  // Update alleen velden die meegestuurd worden
  const updated = { ...screenings[idx], ...req.body };
  screenings[idx] = updated;
  saveScreenings(screenings);

  res.json(updated);
});

// 4) DELETE /screenings/:id — voorstelling verwijderen (Manager-only)
app.delete('/screenings/:id', (req, res) => {
  // TODO: auth-check
  let screenings = loadScreenings();
  const id = parseInt(req.params.id, 10);
  if (!screenings.some(s => s.id === id)) {
    return res.status(404).json({ error: 'Niet gevonden' });
  }
  screenings = screenings.filter(s => s.id !== id);
  saveScreenings(screenings);

  res.status(204).send();
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});

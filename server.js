require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

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

// Server starten
app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});

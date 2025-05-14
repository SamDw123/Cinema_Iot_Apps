require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

// CORS instellen zodat je frontend (localhost:3000) kan fetchen
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

/**
 * GET /movies
 * Haalt populaire films op van TMDB en retourneert een geschoonde JSON.
 */
app.get('/movies', async (req, res) => {
  try {
    // Optioneel paginering: ?page=2
    const page = req.query.page || 1;

    // Request naar TMDB popular movies
    const response = await tmdb.get('/movie/popular', {
      params: { page }
    });

    // Map alleen de velden die je frontend nodig heeft
    const movies = response.data.results.map(movie => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      poster_path: movie.poster_path
    }));

    // Stuur de data terug
    res.json({ page, movies });
  } catch (err) {
    console.error('Error fetching movies:', err.message);
    res.status(500).json({ error: 'Kon films niet ophalen' });
  }
});

// Pre-geconfigureerde TMDB-client
const tmdb = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  headers: {
    Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
    'Content-Type': 'application/json;charset=utf-8'
  }
});

app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
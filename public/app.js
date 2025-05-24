const container = document.getElementById('movies-container');

async function fetchMovies(page = 1) {
  try {
    const res = await fetch(`http://localhost:4000/movies?page=${page}`);
    const { movies } = await res.json();
    return movies;
  } catch (err) {
    console.error('Fout bij ophalen films:', err);
    return [];
  }
}

function renderMovies(movies) {
  container.innerHTML = movies.map(movie => `
    <div class="movie-card">
      <img src="https://image.tmdb.org/t/p/w200${movie.poster_path}" alt="${movie.title}">
      <h2>${movie.title}</h2>
      <p>${movie.release_date}</p>
    </div>
  `).join('');
}

async function fetchScreenings() {
  try {
    const res = await fetch('http://localhost:4000/screenings');
    
    // Add auth error handling for endpoints that might require authentication
    if (res.headers.get('content-type')?.includes('application/json')) {
      if (handleAuthError(res)) return [];
    }
    
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Fout bij ophalen voorstellingen:', err);
    return [];
  }
}

function renderScreenings(screenings, movies) {
  const container = document.getElementById('screenings-list');
  if (!screenings.length) {
    container.innerHTML = '<div class="no-screenings">Geen voorstellingen beschikbaar.</div>';
    return;
  }

  // Match manager dashboard styling
  container.className = 'screenings-grid';
  
  container.innerHTML = screenings.map(s => `
    <div class="card">
      ${s.poster_path 
        ? `<img src="https://image.tmdb.org/t/p/w200${s.poster_path}" alt="${s.title || 'Film'}">`
        : '<div class="no-poster" style="height:100px;background:#eee;display:flex;justify-content:center;align-items:center">Geen poster</div>'}
      <h3>${s.title || `Film ID: ${s.movieId}`}</h3>
      <div class="info">
        <div><strong>Start:</strong> ${new Date(s.startTime).toLocaleString()}</div>
        <div><strong>Stoelen:</strong> ${s.availableSeats}/${s.totalSeats}</div>
      </div>
    </div>
  `).join('');
}


// Bij laden van de pagina
window.addEventListener('DOMContentLoaded', async () => {
  const movies = await fetchMovies();
  renderMovies(movies);

  const screenings = await fetchScreenings();
  renderScreenings(screenings, movies);
});


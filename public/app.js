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
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Fout bij ophalen voorstellingen:', err);
    return [];
  }
}

function renderScreenings(screenings) {
  const list = document.getElementById('screenings-list');
  if (!screenings.length) {
    list.innerHTML = '<li>Geen voorstellingen beschikbaar.</li>';
    return;
  }
  list.innerHTML = screenings.map(s => `
    <li>
      🎬 Film ID ${s.movieId} — ${new Date(s.startTime).toLocaleString()} 
      (${s.availableSeats}/${s.totalSeats} plekken vrij)
    </li>
  `).join('');
}


// Bij laden van de pagina
window.addEventListener('DOMContentLoaded', async () => {
  const movies = await fetchMovies();
  renderMovies(movies);

  const screenings = await fetchScreenings();
  renderScreenings(screenings);
});


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

// Bij laden van de pagina
window.addEventListener('DOMContentLoaded', async () => {
  const movies = await fetchMovies();
  renderMovies(movies);
});

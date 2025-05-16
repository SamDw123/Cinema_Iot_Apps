// manager.js
const addForm      = document.getElementById('add-form');
const addError     = document.getElementById('add-error');
const listEl       = document.getElementById('manager-list');
const loadError    = document.getElementById('load-error');
const movieSelect  = document.getElementById('movie-select');
const token        = localStorage.getItem('token');

// Zorg dat alleen ingelogde manager hier komt
if (!token || localStorage.getItem('role') !== 'manager') {
  alert('Je moet ingelogd zijn als manager');
  window.location.href = '/login.html';
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + token
};

/**
 * Populeer de film-select dropdown met titels uit /movies
 */
async function populateMovieSelect() {
  try {
    const res = await fetch('http://localhost:4000/movies', { headers });
    if (!res.ok) throw new Error('Kon films niet laden');
    const { movies } = await res.json();

    // Clear eventuele placeholder-opties
    movieSelect.innerHTML = '<option value="">-- Kies een film --</option>';

    movies.forEach(movie => {
      const opt = document.createElement('option');
      opt.value = movie.id;
      opt.textContent = movie.title;
      movieSelect.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    loadError.textContent = err.message;
    loadError.style.display = 'block';
  }
}

/**
 * Ophalen van alle voorstellingen
 */
async function loadScreenings() {
  try {
    const res = await fetch('http://localhost:4000/screenings', { headers });
    if (!res.ok) throw new Error('Kon voorstellingen niet laden');
    return await res.json();
  } catch (err) {
    loadError.textContent = err.message;
    loadError.style.display = 'block';
    return [];
  }
}

/**
 * Render de manager‐lijst met bewerk- en verwijderknoppen
 */
async function renderManagerList() {
  const screenings = await loadScreenings();
  listEl.innerHTML = screenings.map(s => `
    <li data-id="${s.id}">
      <img src="https://image.tmdb.org/t/p/w45${s.poster_path}" alt="" />
      <strong>${s.title}</strong> —
      ${new Date(s.startTime).toLocaleString()} —
      ${s.availableSeats}/${s.totalSeats} vrij
      <button class="edit-btn">✏️</button>
      <button class="delete-btn">🗑️</button>
    </li>
  `).join('');

  // Voeg eventlisteners toe
  document.querySelectorAll('.edit-btn').forEach(btn =>
    btn.addEventListener('click', onEdit)
  );
  document.querySelectorAll('.delete-btn').forEach(btn =>
    btn.addEventListener('click', onDelete)
  );
}

/**
 * Handler voor “Nieuwe voorstelling toevoegen”
 */
addForm.addEventListener('submit', async e => {
  e.preventDefault();
  addError.style.display = 'none';

  const fd = new FormData(addForm);
  const payload = {
    movieId: Number(fd.get('movieId')),   // komt nu uit <select>
    startTime: fd.get('startTime'),
    totalSeats: Number(fd.get('totalSeats'))
  };

  try {
    const res = await fetch('http://localhost:4000/screenings', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Kon niet toevoegen');
    }
    addForm.reset();
    await renderManagerList();
  } catch (err) {
    addError.textContent = err.message;
    addError.style.display = 'block';
  }
});

/**
 * Handler voor “Bewerken”
 */
async function onEdit(e) {
  const li     = e.target.closest('li');
  const id     = li.dataset.id;
  const old    = {
    startTime:  new Date(li.childNodes[2].textContent).toISOString().slice(0,16),
    totalSeats: li.childNodes[4].textContent.split('/')[1].split(' ')[0]
  };

  const newStart = prompt('Nieuwe starttijd (YYYY-MM-DDTHH:MM):', old.startTime);
  if (!newStart) return;
  const newSeats = prompt('Nieuw totaal stoelen:', old.totalSeats);
  if (!newSeats) return;

  try {
    const res = await fetch(`http://localhost:4000/screenings/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        startTime: newStart,
        totalSeats: Number(newSeats)
      })
    });
    if (!res.ok) throw new Error('Kon niet bijwerken');
    await renderManagerList();
  } catch (err) {
    alert(err.message);
  }
}

/**
 * Handler voor “Verwijderen”
 */
async function onDelete(e) {
  const li = e.target.closest('li');
  const id = li.dataset.id;
  if (!confirm('Weet je het zeker?')) return;
  try {
    const res = await fetch(`http://localhost:4000/screenings/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) throw new Error('Kon niet verwijderen');
    await renderManagerList();
  } catch (err) {
    alert(err.message);
  }
}

/**
 * Initialisatie: eerst films inladen, dan lijst renderen
 */
(async function init() {
  await populateMovieSelect();
  await renderManagerList();
})();

const movieSelect = document.getElementById('movie-select');
const addForm = document.getElementById('add-form');
const addError = document.getElementById('add-error');
const grid = document.getElementById('screenings-grid');
const loadError = document.getElementById('load-error');
const token = localStorage.getItem('token');

if (!token || localStorage.getItem('role') !== 'manager') {
    alert('Je moet ingelogd zijn als manager');
    window.location.href = '/login.html';
}

const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
};

async function populateMovieSelect() {
    try {
        const res = await fetch('http://localhost:4000/movies', { headers });
        if (handleAuthError(res)) return;
        const { movies } = await res.json();
        movies.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.title;
            movieSelect.appendChild(opt);
        });
    } catch (e) {
        loadError.textContent = e.message;
        loadError.style.display = 'block';
    }
}

async function loadScreenings() {
    try {
        const res = await fetch('http://localhost:4000/screenings', { headers });
        if (handleAuthError(res)) return [];
        return await res.json();
    } catch (e) {
        loadError.textContent = e.message;
        loadError.style.display = 'block';
        return [];
    }
}

function formatDateTime(dt) {
    return new Date(dt).toLocaleString();
}

function renderScreenings(screenings) {
    grid.innerHTML = '';
    screenings.forEach(s => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.id = s.id;
        card.innerHTML = `
        <img src="https://image.tmdb.org/t/p/w200${s.poster_path}" alt="${s.title}">
        <h3>${s.title}</h3>
        <div class="info">
          <div><strong>Start:</strong> <span class="start-text" data-raw-date="${s.startTime}">${formatDateTime(s.startTime)}</span></div>
          <div><strong>Stoelen:</strong> <span class="seats-text">${s.availableSeats}/${s.totalSeats}</span></div>
        </div>
        <div class="controls">
          <button class="edit-btn">Bewerk</button>
          <button class="delete-btn cancel">Verwijder</button>
        </div>
      `;
        grid.appendChild(card);
    });
}

async function refresh() {
    const data = await loadScreenings();
    renderScreenings(data);
}

addForm.addEventListener('submit', async e => {
    e.preventDefault();
    addError.style.display = 'none';
    const fd = new FormData(addForm);
    const payload = {
        movieId: Number(fd.get('movieId')),
        startTime: fd.get('startTime'),
        totalSeats: Number(fd.get('totalSeats'))
    };
    try {
        const res = await fetch('http://localhost:4000/screenings', {
            method: 'POST',
            headers, body: JSON.stringify(payload)
        });
        if (handleAuthError(res)) return;
        if (!res.ok) throw new Error((await res.json()).error || 'Kon niet toevoegen');
        addForm.reset();
        await refresh();
    } catch (err) {
        addError.textContent = err.message;
        addError.style.display = 'block';
    }
});

// Event delegation op de grid
grid.addEventListener('click', async e => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;

    // Verwijderen
    if (e.target.matches('.delete-btn')) {
        if (!confirm('Weet je het zeker?')) return;
        try {
            const res = await fetch(`http://localhost:4000/screenings/${id}`, {
                method: 'DELETE', headers
            });
            if (handleAuthError(res)) return;
            if (!res.ok) throw new Error('Kon niet verwijderen');
            await refresh();
        } catch (err) {
            alert(err.message);
        }
    }

    // Bewerken / Opslaan
    if (e.target.matches('.edit-btn')) {
    const btn = e.target;
    const startSpan = card.querySelector('.start-text');
    const seatsSpan = card.querySelector('.seats-text');

    if (btn.textContent === 'Bewerk') {
        // Zet om naar inputs
        const rawDate = startSpan.dataset.rawDate;
        // Converteer naar lokaal datetime-local formaat (YYYY-MM-DDThh:mm)
        const dateValue = rawDate ? rawDate.substring(0, 16) : '';
        
        const [avail, total] = seatsSpan.textContent.split('/').map(n => Number(n));
        startSpan.innerHTML = `<input type="datetime-local" class="edit-input" value="${dateValue}">`;
        seatsSpan.innerHTML = `<input type="number" min="1" class="edit-input" value="${total}">`;
        btn.textContent = 'Opslaan';
        btn.classList.add('cancel'); // optioneel styling
    } else {
            // Opslaan
            const newStart = card.querySelector('input[type="datetime-local"]').value;
            const newTotal = Number(card.querySelector('input[type="number"]').value);
            try {
                const res = await fetch(`http://localhost:4000/screenings/${id}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ startTime: newStart, totalSeats: newTotal })
                });
                if (handleAuthError(res)) return;
                if (!res.ok) throw new Error('Kon niet bijwerken');
                await refresh();
            } catch (err) {
                alert(err.message);
            }
        }
    }
});

// Init
(async () => {
    await populateMovieSelect();
    await refresh();
})();
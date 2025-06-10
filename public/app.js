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

// Update the renderMovies function to use the new styling
function renderMovies(movies) {
  container.innerHTML = movies.map(movie => `
    <div class="card">
      ${movie.poster_path 
        ? `<img src="https://image.tmdb.org/t/p/w500${movie.poster_path}" alt="${movie.title}" class="card-img">` 
        : `<div class="no-poster">Geen afbeelding beschikbaar</div>`}
      <div class="card-body">
        <h3 class="card-title">${movie.title}</h3>
        <p class="text-muted">${new Date(movie.release_date).toLocaleDateString()}</p>
      </div>
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

// Update the renderScreenings function to use the new styling
function renderScreenings(screenings, movies) {
  const container = document.getElementById('screenings-list');
  if (!screenings.length) {
    container.innerHTML = '<div class="alert alert-info">Geen voorstellingen beschikbaar.</div>';
    return;
  }

  // Match manager dashboard styling
  container.className = 'screenings-grid';
  
  // Get user role to conditionally show reserve button
  const userLoggedIn = localStorage.getItem('token') ? true : false;
  const userRole = localStorage.getItem('role');
  
  container.innerHTML = screenings.map(s => `
    <div class="card" data-screening-id="${s.id}">
      ${s.poster_path 
        ? `<img src="https://image.tmdb.org/t/p/w500${s.poster_path}" alt="${s.title || 'Film'}" class="card-img">` 
        : '<div class="no-poster">Geen poster beschikbaar</div>'}
      <div class="card-body">
        <h3 class="card-title">${s.title || `Film ID: ${s.movieId}`}</h3>
        <div class="info">
          <div><strong>Start:</strong> ${new Date(s.startTime).toLocaleString()}</div>
          <div><strong>Stoelen:</strong> <span class="seats-count">${s.availableSeats}/${s.totalSeats}</span></div>
        </div>
        ${userLoggedIn && userRole === 'user' && s.availableSeats > 0 ? 
          `<div class="reservation-form">
            <div class="form-group">
              <label class="form-label">Aantal tickets:</label>
              <select class="form-select quantity-select">
                ${Array.from({length: Math.min(s.availableSeats, 10)}, (_, i) => i + 1)
                  .map(num => `<option value="${num}">${num}</option>`)
                  .join('')}
              </select>
            </div>
            <button class="btn btn-success reserve-btn" data-id="${s.id}">Reserveer</button>
          </div>` : 
          userRole === 'user' && s.availableSeats === 0 ? 
            '<p class="sold-out">Uitverkocht</p>' : 
            (!userLoggedIn ? '<p class="login-note">Log in om te reserveren</p>' : '')
        }
        <div class="reservation-message" data-id="${s.id}" style="display:none;"></div>
      </div>
    </div>
  `).join('');
  
  // Add event listeners for reservation buttons
  if (userLoggedIn && userRole === 'user') {
    document.querySelectorAll('.reserve-btn').forEach(btn => {
      btn.addEventListener('click', handleReservation);
    });
  }
}

// Handle ticket reservation
async function handleReservation(e) {
  const btn = e.target;
  const screeningId = parseInt(btn.dataset.id);
  const card = btn.closest('.card');
  const quantitySelect = card.querySelector('.quantity-select');
  const quantity = parseInt(quantitySelect.value);
  const messageDiv = card.querySelector('.reservation-message');
  
  btn.disabled = true;
  btn.textContent = 'Reserveren...';
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:4000/reserve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ screeningId, quantity })
    });
    
    if (handleAuthError(res)) return;
    
    const data = await res.json();
    
    if (res.ok) {
      messageDiv.innerHTML = `
        <div class="alert alert-success">
          <strong>Gelukt!</strong> ${data.message}
          ${data.emailSent ? `<br><small>${data.emailMessage}</small>` : ''}
        </div>
      `;
      messageDiv.style.display = 'block';
      
      // Refresh screenings to show updated seat count
      loadScreenings();
    } else {
      throw new Error(data.error || 'Reservering mislukt');
    }
  } catch (err) {
    messageDiv.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    messageDiv.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reserveer';
  }
}

// WebSocket connection for real-time updates
let socket;
let mqttClient = null;
let communicationMethod = 'websocket';

function connectWebSocket() {
  socket = new WebSocket('ws://localhost:4000');
  
  socket.onopen = () => {
    console.log('WebSocket verbonden');
  };
  
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleRealtimeUpdate(data);
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  };
  
  socket.onclose = () => {
    console.log('WebSocket verbinding gesloten');
    // Probeer opnieuw te verbinden na 3 seconden
    setTimeout(connectWebSocket, 3000);
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function handleRealtimeUpdate(data) {
  if (data.type === 'seatUpdate') {
    const card = document.querySelector(`[data-screening-id="${data.screeningId}"]`);
    if (card) {
      const seatsEl = card.querySelector('.seats-count');
      if (seatsEl) {
        seatsEl.textContent = `${data.availableSeats}/${data.totalSeats}`;
      }

      // Update or remove reservation form
      const formEl = card.querySelector('.reservation-form');
      const soldOut = data.availableSeats === 0;
      
      if (soldOut && formEl) {
        formEl.remove();
        if (!card.querySelector('.sold-out')) {
          const soldOutEl = document.createElement('p');
          soldOutEl.className = 'sold-out';
          soldOutEl.textContent = 'Uitverkocht';
          card.appendChild(soldOutEl);
        }
      } else if (data.availableSeats > 0 && formEl) {
        // Update quantity selector
        const quantitySelect = formEl.querySelector('.quantity-select');
        if (quantitySelect) {
          const currentValue = parseInt(quantitySelect.value, 10);
          quantitySelect.innerHTML = Array.from(
            {length: Math.min(data.availableSeats, 10)}, 
            (_, i) => i + 1
          ).map(num => 
            `<option value="${num}" ${num === currentValue ? 'selected' : ''}>${num}</option>`
          ).join('');
        }
      }
    }
  }
}

// MQTT functions (for testing)
async function initMQTT() {
  try {
    // Check if MQTT is available and enabled
    const response = await fetch('http://localhost:4000/mqtt-status');
    const status = await response.json();
    
    if (!status.enabled || !status.connected) {
      console.log('MQTT not available, using WebSocket');
      connectWebSocket();
      return;
    }

    // For browser MQTT, we need a WebSocket-enabled broker
    if (typeof mqtt !== 'undefined') {
      mqttClient = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');
      
      mqttClient.on('connect', () => {
        console.log('Connected to MQTT broker');
        mqttClient.subscribe('cinema/screenings/updates');
        communicationMethod = 'mqtt';
      });

      mqttClient.on('message', (topic, message) => {
        try {
          const data = JSON.parse(message.toString());
          handleRealtimeUpdate(data);
        } catch (err) {
          console.error('Error parsing MQTT message:', err);
        }
      });

      mqttClient.on('error', (err) => {
        console.error('MQTT error, falling back to WebSocket:', err);
        connectWebSocket();
      });
    } else {
      console.log('MQTT client not available, using WebSocket');
      connectWebSocket();
    }
  } catch (err) {
    console.log('Could not initialize MQTT, using WebSocket:', err);
    connectWebSocket();
  }
}

// Load functions
async function loadMovies() {
  const movies = await fetchMovies();
  renderMovies(movies);
}

async function loadScreenings() {
  const screenings = await fetchScreenings();
  renderScreenings(screenings);
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
  loadMovies();
  loadScreenings();
  checkAuthStatus();
  
  // Try MQTT first, fallback to WebSocket
  initMQTT();
});


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
    <div class="card" data-id="${s.id}">
      ${s.poster_path 
        ? `<img src="https://image.tmdb.org/t/p/w500${s.poster_path}" alt="${s.title || 'Film'}" class="card-img">` 
        : '<div class="no-poster">Geen poster beschikbaar</div>'}
      <div class="card-body">
        <h3 class="card-title">${s.title || `Film ID: ${s.movieId}`}</h3>
        <div class="info">
          <div><strong>Start:</strong> ${new Date(s.startTime).toLocaleString()}</div>
          <div><strong>Stoelen:</strong> <span class="seats-count" data-id="${s.id}">${s.availableSeats}/${s.totalSeats}</span></div>
        </div>
        ${userLoggedIn && userRole === 'user' && s.availableSeats > 0 ? 
          `<div class="reservation-form">
            <div class="quantity-selector">
              <label for="quantity-${s.id}">Aantal tickets:</label>
              <select id="quantity-${s.id}" class="quantity-select">
                ${Array.from({length: Math.min(s.availableSeats, 10)}, (_, i) => i + 1)
                  .map(num => `<option value="${num}">${num}</option>`).join('')}
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
  const screeningId = parseInt(btn.dataset.id, 10);
  const quantitySelect = document.getElementById(`quantity-${screeningId}`);
  const quantity = parseInt(quantitySelect.value, 10);
  const token = localStorage.getItem('token');
  const messageEl = document.querySelector(`.reservation-message[data-id="${screeningId}"]`);
  
  btn.disabled = true;
  btn.textContent = 'Bezig...';
  
  try {
    const res = await fetch('http://localhost:4000/reserve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ screeningId, quantity })
    });
    
    if (handleAuthError(res)) return;
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Reservering mislukt');
    }
    
    const response = await res.json();
    
    // Show success message
    messageEl.textContent = `${quantity} ticket(s) succesvol gereserveerd!`;
    messageEl.style.display = 'block';
    messageEl.className = 'reservation-message success';
    
    // REMOVE THIS SECTION - Let WebSocket handle the update
    // const seatsEl = document.querySelector(`.seats-count[data-id="${screeningId}"]`);
    // if (seatsEl) {
    //   const [available, total] = seatsEl.textContent.split('/').map(n => parseInt(n, 10));
    //   seatsEl.textContent = `${available - quantity}/${total}`;
    // }
    
    // Remove the reservation form
    const formEl = btn.closest('.reservation-form');
    formEl.style.display = 'none';
    
  } catch (err) {
    // Show error message
    messageEl.textContent = err.message;
    messageEl.style.display = 'block';
    messageEl.className = 'reservation-message error';
    
    // Re-enable the button
    btn.disabled = false;
    btn.textContent = 'Reserveer Ticket(s)';
  }
}

// WebSocket connection for real-time updates

// For websocket
/*let socket;
function connectWebSocket() {
  socket = new WebSocket('ws://localhost:4000');
  
  socket.addEventListener('open', () => {
    console.log('WebSocket connected');
  });
  
  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'updateSeats') {
        // Update UI when seat availability changes
        const seatsEl = document.querySelector(`.seats-count[data-id="${data.screeningId}"]`);
        if (seatsEl) {
          const [_, total] = seatsEl.textContent.split('/').map(n => parseInt(n, 10));
          seatsEl.textContent = `${data.availableSeats}/${total}`;
          
          // Update the reservation button/form if needed
          const card = document.querySelector(`.card[data-id="${data.screeningId}"]`);
          if (card) {
            const formEl = card.querySelector('.reservation-form');
            const soldOut = card.querySelector('.sold-out');
            
            if (data.availableSeats <= 0 && formEl) {
              // Replace form with sold out message
              formEl.remove();
              if (!soldOut) {
                const soldOutEl = document.createElement('p');
                soldOutEl.className = 'sold-out';
                soldOutEl.textContent = 'Uitverkocht';
                card.appendChild(soldOutEl);
              }
            } else if (data.availableSeats > 0 && formEl) {
              // Update the quantity selector to reflect available seats
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
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });
  
  socket.addEventListener('close', () => {
    console.log('WebSocket disconnected, reconnecting...');
    setTimeout(connectWebSocket, 3000);
  });
  
  socket.addEventListener('error', (err) => {
    console.error('WebSocket error:', err);
    socket.close();
  });
}
*/
let mqttClient;

function connectMQTT() {
  const options = {
    clientId: 'cinema_client_' + Math.random().toString(16).substr(2, 8),
    clean: true,
    connectTimeout: 4000,
    debug: true,
    reconnectPeriod: 1000
  };

  console.log('Attempting MQTT connection...');
  mqttClient = mqtt.connect('ws://localhost:9001', options);

  mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe('cinema_sam123/seats/#', (err) => {
      if (!err) {
        console.log('Subscribed to seat updates');
      }
    });
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT Error:', err);
  });

  mqttClient.on('close', () => {
    console.log('MQTT connection closed');
  });

  mqttClient.on('reconnect', () => {
    console.log('Attempting to reconnect to MQTT broker...');
  });

  mqttClient.on('message', (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('MQTT message received:', data);
      if (data.type === 'updateSeats') {
        const seatsEl = document.querySelector(`.seats-count[data-id="${data.screeningId}"]`);
        if (seatsEl) {
          const [_, total] = seatsEl.textContent.split('/');
          seatsEl.textContent = `${data.availableSeats}/${total}`;
        }
      }
    } catch (err) {
      console.error('MQTT message error:', err);
    }
  });
}

// Initialize WebSocket when page loads
window.addEventListener('DOMContentLoaded', async () => {
  const movies = await fetchMovies();
  renderMovies(movies);

  const screenings = await fetchScreenings();
  renderScreenings(screenings, movies);
  
  // Connect to WebSocket for real-time updates
  //connectWebSocket();  // for websocket
  connectMQTT();
});


document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  await loadUserTickets();
});

function generateQRCode(ticketData) {
  const qr = qrcode(0, 'L');
  qr.addData(JSON.stringify(ticketData));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2 });
}

async function loadUserTickets() {
  const ticketsGrid = document.getElementById('tickets-grid');
  const token = localStorage.getItem('token');
  
  try {
    const res = await fetch('http://localhost:4000/my-tickets', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (handleAuthError(res)) return;
    
    if (!res.ok) {
      throw new Error('Kon tickets niet ophalen');
    }
    
    const tickets = await res.json();
    
    if (tickets.length === 0) {
      ticketsGrid.innerHTML = `
        <div class="no-tickets">
          <p>Je hebt nog geen tickets gereserveerd.</p>
          <p><a href="/">Ga naar de homepage</a> om voorstellingen te bekijken en tickets te reserveren.</p>
        </div>
      `;
      return;
    }
    
    // Group tickets by screening
    const screeningTickets = {};
    
    tickets.forEach(ticket => {
      if (!screeningTickets[ticket.screeningId]) {
        screeningTickets[ticket.screeningId] = {
          screening: ticket.screening,
          count: 0,
          tickets: []
        };
      }
      screeningTickets[ticket.screeningId].count++;
      screeningTickets[ticket.screeningId].tickets.push(ticket);
    });
    
    // Render tickets
    ticketsGrid.innerHTML = Object.values(screeningTickets).map(st => `
      <div class="ticket-card">
        <div class="ticket-header">
          ${st.count} ticket${st.count > 1 ? 's' : ''}
        </div>
        <div class="ticket-body">
          ${st.screening.poster_path ? 
            `<img src="https://image.tmdb.org/t/p/w200${st.screening.poster_path}" alt="${st.screening.title}" class="ticket-poster">` : 
            '<div class="no-poster ticket-poster">Geen poster beschikbaar</div>'}
          <h3>${st.screening.title}</h3>
          <p><strong>Datum:</strong> ${new Date(st.screening.startTime).toLocaleDateString()}</p>
          <p><strong>Tijd:</strong> ${new Date(st.screening.startTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
        </div>
        <div class="ticket-qr">
          <p>Ticket ID${st.count > 1 ? 's' : ''}: ${st.tickets.map(t => t.id).join(', ')}</p>
          ${st.tickets.map(ticket => `
            <div class="qr-code">
              ${generateQRCode({
                id: ticket.id,
                screeningId: ticket.screeningId,
                userId: ticket.userId
              })}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading tickets:', error);
    ticketsGrid.innerHTML = `
      <div class="error-message">
        <p>Er ging iets mis bij het ophalen van je tickets: ${error.message}</p>
      </div>
    `;
  }
}
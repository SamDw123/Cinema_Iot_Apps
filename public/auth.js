const authBtn = document.getElementById('auth-btn');
const registerBtn = document.getElementById('register-btn');
const ticketsBtn = document.getElementById('tickets-btn');
const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

// Set active navigation link
function setActiveNavLink() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-menu a');
  
  navLinks.forEach(link => {
    const linkPath = link.getAttribute('href').split('#')[0];
    if (linkPath === currentPath || 
        (currentPath === '/' && linkPath === '/') || 
        (link.getAttribute('href').includes('#') && currentPath === '/')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

function handleAuthError(res) {
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
    return true;
  }
  return false;
}

if (token) {
  // --- LOGGED IN ---
  // Update login button to "Logout"
  authBtn.textContent = 'Uitloggen';
  authBtn.classList.remove('btn-primary');
  authBtn.classList.add('btn-outline');
  authBtn.onclick = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.reload();
  };

  // Hide register button
  if (registerBtn) {
    registerBtn.style.display = 'none';
  }

  // Show tickets button for users
  if (role === 'user' && ticketsBtn) {
    ticketsBtn.style.display = 'inline-flex';
    ticketsBtn.onclick = () => {
      window.location.href = '/tickets.html';
    };
  }

  // Add manager nav link if manager
  if (role === 'manager') {
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu && !document.querySelector('.nav-item a[href="/manager.html"]')) {
      const managerItem = document.createElement('li');
      managerItem.className = 'nav-item';
      const managerLink = document.createElement('a');
      managerLink.href = '/manager.html';
      managerLink.textContent = 'Manager Dashboard';
      if (window.location.pathname === '/manager.html') {
        managerLink.classList.add('active');
      }
      managerItem.appendChild(managerLink);
      navMenu.appendChild(managerItem);
    }
  }

} else {
  // --- NOT LOGGED IN ---
  // Set login button
  authBtn.textContent = 'Inloggen';
  authBtn.classList.add('btn-primary');
  authBtn.onclick = () => window.location.href = '/login.html';

  // Show register button
  if (registerBtn) {
    registerBtn.style.display = 'inline-block';
    registerBtn.onclick = () => window.location.href = '/register.html';
  }

  // Hide tickets button
  if (ticketsBtn) {
    ticketsBtn.style.display = 'none';
  }
}

// Set active nav link when DOM is loaded
document.addEventListener('DOMContentLoaded', setActiveNavLink);

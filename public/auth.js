const authBtn     = document.getElementById('auth-btn');
const registerBtn = document.getElementById('register-btn');
const token       = localStorage.getItem('token');
const role        = localStorage.getItem('role');

if (token) {
  // --- INGLOGD ---
  // Login knop wordt nu "Logout"
  authBtn.textContent = 'Logout';
  authBtn.onclick = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.reload();
  };

  // Verberg de Registreren‑knop
  registerBtn.style.display = 'none';

  // Toon manager‑controls
  if (role === 'manager') {
    const btn = document.createElement('button');
    btn.textContent = '+ Nieuwe voorstelling';
    btn.onclick = () => {
      window.location.href = '/new-screening.html'; 
      // of open modal
    };
    authBtn.insertAdjacentElement('afterend', btn);
  }

} else {
  // --- NIET INGLOGD ---
  // Login‑knop 
  authBtn.textContent = 'Login';
  authBtn.onclick = () => window.location.href = '/login.html';

  // Registreren‑knop zichtbaar maken
  registerBtn.style.display = 'inline-block';
  registerBtn.onclick = () => window.location.href = '/register.html';
}

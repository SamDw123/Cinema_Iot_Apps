const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');

function handleAuthError(res) {
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
    return true;
  }
  return false;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorEl.style.display = 'none';

  const formData = new FormData(form);
  const payload = {
    username: formData.get('username'),
    password: formData.get('password')
  };

  try {
    const res = await fetch('http://localhost:4000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login mislukt');
    }

    const { token } = await res.json();
    // Token opslaan
    localStorage.setItem('token', token);

    // profiel ophalen
    const meRes = await fetch('http://localhost:4000/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (handleAuthError(meRes)) return;
    const user = await meRes.json();

    // Rol in localStorage
    localStorage.setItem('role', user.role);

    // Doorsturen naar homepage
    window.location.href = '/';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});
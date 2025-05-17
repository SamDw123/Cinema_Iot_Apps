const form = document.getElementById('register-form');
const errorEl = document.getElementById('register-error');

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorEl.style.display = 'none';

  const fd = new FormData(form);
  const payload = {
    username: fd.get('username'),
    password: fd.get('password'),
    role: fd.get('role')
  };

  try {
    const res = await fetch('http://localhost:4000/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registratie mislukt');
    }

    // Succes: doorsturen naar login
    window.location.href = '/login.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

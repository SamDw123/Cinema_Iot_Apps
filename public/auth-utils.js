/**
 * Handles authentication errors by redirecting to login page if needed
 * @param {Response} res - Fetch response object
 * @param {string} message - Optional message to display on login page
 * @returns {boolean} - True if auth error was detected and handled
 */
function handleAuthError(res) {
  if (res.status === 401 || res.status === 403) {
    // Store error message to show on login page
    localStorage.setItem('auth_error', 'Je sessie is verlopen. Log opnieuw in.');
    
    // Clear authentication data
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    
    // Redirect to login
    window.location.href = '/login.html';
    return true;
  }
  return false;
}
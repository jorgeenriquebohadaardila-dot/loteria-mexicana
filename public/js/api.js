// Wrapper de fetch con autenticación JWT
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/login.html';
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function getToken()  { return localStorage.getItem('token'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } }
function saveAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user',  JSON.stringify(user));
}
function logout() {
  localStorage.clear();
  window.location.href = '/login.html';
}
function requireAuth() {
  if (!getToken()) { window.location.href = '/login.html'; return false; }
  return true;
}

// Toast notifications
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

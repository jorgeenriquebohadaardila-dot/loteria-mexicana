document.addEventListener('DOMContentLoaded', () => {
  // Si ya hay sesión, ir al lobby
  if (getToken()) { window.location.href = '/lobby.html'; return; }

  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true;

      try {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email:    loginForm.email.value,
            password: loginForm.password.value
          })
        });
        saveAuth(data.token, data.user);
        window.location.href = '/lobby.html';
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector('button[type=submit]');

      if (registerForm.password.value !== registerForm.confirm.value) {
        showToast('Las contraseñas no coinciden', 'error'); return;
      }

      btn.disabled = true;
      try {
        const data = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username: registerForm.username.value,
            email:    registerForm.email.value,
            password: registerForm.password.value
          })
        });
        saveAuth(data.token, data.user);
        window.location.href = '/lobby.html';
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }
});

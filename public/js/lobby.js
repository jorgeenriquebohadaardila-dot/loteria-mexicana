let refreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const user = getUser();
  document.getElementById('nav-username').textContent = user?.username || 'Jugador';

  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Crear sala
  document.getElementById('btn-open-modal').addEventListener('click', () => {
    document.getElementById('modal-create').classList.remove('hidden');
  });
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('modal-create').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('form-create-room').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn  = e.target.querySelector('button[type=submit]');
    btn.disabled = true;

    const name       = document.getElementById('room-name-input').value.trim();
    const drawSecs   = parseInt(document.getElementById('room-draw-speed').value) || 5;
    const maxPlayers = parseInt(document.getElementById('room-max-players').value) || 10;

    try {
      const { roomId } = await apiFetch('/api/rooms', {
        method: 'POST',
        body:   JSON.stringify({ name, drawIntervalMs: drawSecs * 1000, maxPlayers })
      });
      window.location.href = `/game.html?room=${roomId}`;
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });

  loadRooms();
  refreshTimer = setInterval(loadRooms, 5000);
});

function closeModal() {
  document.getElementById('modal-create').classList.add('hidden');
}

async function loadRooms() {
  try {
    const rooms = await apiFetch('/api/rooms');
    renderRooms(rooms);
  } catch {
    // silencioso en actualización automática
  }
}

function renderRooms(rooms) {
  const grid = document.getElementById('rooms-grid');
  if (!rooms || rooms.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="emoji">🎴</span>
        No hay salas disponibles.<br>¡Crea una para comenzar!
      </div>`;
    return;
  }

  grid.innerHTML = rooms.map(r => `
    <div class="room-card">
      <div class="room-name">${esc(r.name)}</div>
      <div class="room-meta">
        <span>👤 ${r.player_count}/${r.max_players}</span>
        <span>🎩 ${esc(r.host_name)}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="badge badge-${r.state}">${r.state === 'waiting' ? 'Esperando' : 'Iniciando...'}</span>
        <button class="btn btn-gold btn-sm" onclick="joinRoom('${r.id}')">Unirse</button>
      </div>
    </div>
  `).join('');
}

function joinRoom(roomId) {
  window.location.href = `/game.html?room=${roomId}`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

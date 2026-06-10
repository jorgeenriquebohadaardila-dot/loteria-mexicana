// ── Estado global ─────────────────────────────────────────────
let ws           = null;
let pingInterval = null;      // guardamos el ID para limpiar en reconexión
let myBoard      = [];        // [{ id, name, emoji }, ...]
let markedCards  = new Set(); // IDs marcados localmente
let drawnCardIds = new Set(); // IDs cantados
let roomState    = 'waiting';
let isHost       = false;
let roomId       = null;

// ── Inicialización ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const params = new URLSearchParams(window.location.search);
  roomId = params.get('room');
  if (!roomId) { window.location.href = '/lobby.html'; return; }

  document.getElementById('btn-claim').addEventListener('click', claimWin);
  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-back').addEventListener('click', () => {
    window.location.href = '/lobby.html';
  });

  connectWS();
});

// ── WebSocket ─────────────────────────────────────────────────
function connectWS() {
  // Limpiar ping anterior antes de reconectar (evita acumulación de timers)
  clearInterval(pingInterval);

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join_room', token: getToken(), roomId }));

    // Un único intervalo de ping por conexión activa
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'ping', token: getToken() }));
    }, 25000);
  };

  ws.onmessage = (e) => {
    try { handle(JSON.parse(e.data)); } catch {}
  };

  ws.onclose = () => {
    clearInterval(pingInterval);
    if (roomState === 'finished') return;
    setTimeout(connectWS, 3000);
  };

  ws.onerror = () => ws.close();
}

function wsSend(data) {
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ ...data, token: getToken() }));
}

// ── Manejador de mensajes ─────────────────────────────────────
function handle(msg) {
  switch (msg.type) {
    case 'room_joined':       onRoomJoined(msg);       break;
    case 'player_joined':     onPlayersUpdate(msg);    break;
    case 'player_left':       onPlayersUpdate(msg);    break;
    case 'player_reconnected':onPlayersUpdate(msg);    break;
    case 'countdown_started': onCountdownStarted(msg); break;
    case 'countdown_tick':    onCountdownTick(msg);    break;
    case 'game_started':      onGameStarted(msg);      break;
    case 'card_drawn':        onCardDrawn(msg);        break;
    case 'card_marked':       /* confirmación */       break;
    case 'win_claimed':       onWinClaimed(msg);       break;
    case 'invalid_win':       showToast(msg.message, 'error'); break;
    case 'game_over':         onGameOver(msg);         break;
    case 'error':             showToast(msg.message, 'error'); break;
  }
}

// ── Handlers ──────────────────────────────────────────────────
function onRoomJoined(msg) {
  roomState = msg.state;
  isHost    = msg.isHost;

  document.getElementById('room-title').textContent  = msg.roomName;
  document.getElementById('btn-start').classList.toggle('hidden', !isHost || roomState !== 'waiting');

  renderPlayers(msg.players);
  setStatusUI(roomState);

  if (msg.board && msg.board.length) {
    myBoard = msg.board;
    renderBoard();
  }

  // Restaurar cartas marcadas (reconexión)
  if (msg.markedCards?.length) {
    msg.markedCards.forEach(id => markedCards.add(id));
  }

  // Restaurar historial de cartas cantadas
  if (msg.drawnCards?.length) {
    msg.drawnCards.forEach(c => {
      drawnCardIds.add(c.id);
      addToHistory(c);
    });
    const last = msg.drawnCards[msg.drawnCards.length - 1];
    if (last) setCurrentCard(last);
  }

  updateBoardHighlights();
  updateMarksOnBoard();

  if (roomState === 'active') {
    document.getElementById('btn-claim').classList.remove('hidden');
    document.getElementById('btn-start').classList.add('hidden');
  }
}

function onPlayersUpdate(msg) {
  if (msg.players) renderPlayers(msg.players);
}

function onCountdownStarted(msg) {
  roomState = 'starting';
  setStatusUI('starting');
  document.getElementById('btn-start').classList.add('hidden');
  document.getElementById('countdown-display').textContent = msg.secondsLeft + 's';
  showToast(`¡La partida comienza en ${msg.secondsLeft} segundos!`, 'success');
}

function onCountdownTick(msg) {
  document.getElementById('countdown-display').textContent = msg.secondsLeft + 's';
}

function onGameStarted(msg) {
  roomState = 'active';
  setStatusUI('active');
  document.getElementById('countdown-display').textContent = '';

  myBoard = msg.board;
  markedCards.clear();
  drawnCardIds.clear();
  document.getElementById('history-grid').innerHTML = '';

  renderBoard();
  document.getElementById('btn-claim').classList.remove('hidden');
  document.getElementById('btn-start').classList.add('hidden');
  showToast('¡La partida ha comenzado!', 'success');
}

function onCardDrawn(msg) {
  drawnCardIds.add(msg.card.id);
  setCurrentCard(msg.card);
  addToHistory(msg.card);
  highlightBoardCard(msg.card.id);

  const rem = document.getElementById('remaining-count');
  if (rem) rem.textContent = `Quedan ${msg.remaining} de 54 cartas`;
}

function onWinClaimed(msg) {
  if (msg.valid) {
    showToast(`🏆 ${msg.username} ganó con: ${msg.pattern}`, 'success');
  }
}

function onGameOver(msg) {
  roomState = 'finished';
  setStatusUI('finished');
  document.getElementById('btn-claim').classList.add('hidden');

  const overlay = document.getElementById('win-overlay');
  const box     = overlay.querySelector('.win-box');

  if (msg.winner) {
    box.innerHTML = `
      <span class="win-emoji">🏆</span>
      <h2>¡LOTERÍA!</h2>
      <p class="win-pattern">${msg.winPattern || ''}</p>
      <p><strong>${esc(msg.winner.username)}</strong> ganó la partida</p>
      <button class="btn btn-gold btn-lg mt-2" onclick="window.location.href='/lobby.html'">Volver al lobby</button>
    `;
  } else {
    box.innerHTML = `
      <span class="win-emoji">🃏</span>
      <h2>Partida terminada</h2>
      <p>Se agotaron todas las cartas sin ganador</p>
      <button class="btn btn-gold btn-lg mt-2" onclick="window.location.href='/lobby.html'">Volver al lobby</button>
    `;
  }

  overlay.classList.remove('hidden');
}

// ── Renderizado ───────────────────────────────────────────────
function renderBoard() {
  const grid = document.getElementById('board-grid');
  grid.innerHTML = myBoard.map(c => `
    <div class="board-cell" data-id="${c.id}" onclick="toggleMark(${c.id})">
      <span class="b-emoji">${c.emoji}</span>
      <span class="b-name">${esc(c.name)}</span>
      <div class="mark-layer">🫘</div>
    </div>
  `).join('');
}

function toggleMark(cardId) {
  if (roomState !== 'active') return;

  const cell = document.querySelector(`.board-cell[data-id="${cardId}"]`);
  if (!cell) return;

  if (markedCards.has(cardId)) {
    markedCards.delete(cardId);
    cell.classList.remove('marked');
  } else {
    if (!drawnCardIds.has(cardId)) {
      showToast('Esa carta aún no ha sido cantada', 'error');
      return;
    }
    markedCards.add(cardId);
    cell.classList.add('marked');
  }

  wsSend({ type: 'mark_card', cardId });
}

function setCurrentCard(card) {
  const el = document.getElementById('current-card');
  el.innerHTML = `
    <span class="c-num">${card.id}</span>
    <span class="c-emoji">${card.emoji}</span>
    <span class="c-name">${esc(card.name)}</span>
  `;
  el.classList.remove('card-draw-anim');
  void el.offsetWidth; // reflow para reiniciar animación
  el.classList.add('card-draw-anim');
}

function addToHistory(card) {
  const grid = document.getElementById('history-grid');
  const div  = document.createElement('div');
  div.className = 'hist-card';
  div.innerHTML = `<span class="h-emoji">${card.emoji}</span><span class="h-name">${esc(card.name)}</span>`;
  grid.prepend(div);
}

function highlightBoardCard(cardId) {
  const cell = document.querySelector(`.board-cell[data-id="${cardId}"]`);
  if (!cell) return;
  cell.classList.add('just-drawn');
  setTimeout(() => cell.classList.remove('just-drawn'), 1500);
}

function updateBoardHighlights() {
  drawnCardIds.forEach(id => {
    const cell = document.querySelector(`.board-cell[data-id="${id}"]`);
    // No añadimos highlight permanente; el usuario elige marcar
  });
}

function updateMarksOnBoard() {
  markedCards.forEach(id => {
    const cell = document.querySelector(`.board-cell[data-id="${id}"]`);
    if (cell) cell.classList.add('marked');
  });
}

function renderPlayers(players) {
  const container = document.getElementById('players-list');
  container.innerHTML = players.map(p => `
    <div class="player-item">
      <span class="player-dot ${p.isConnected ? 'connected' : 'disconnected'}"></span>
      <span class="player-name">${esc(p.username)}</span>
      ${p.userId == getUser()?.id ? '<span class="player-host-badge">tú</span>' : ''}
    </div>
  `).join('');
}

function setStatusUI(state) {
  const statusEl  = document.getElementById('game-status');
  const labels = {
    waiting:  'Esperando jugadores...',
    starting: 'Iniciando...',
    active:   'En juego',
    finished: 'Partida terminada'
  };
  statusEl.className = `game-status status-${state}`;
  statusEl.innerHTML = `<span class="status-dot"></span> ${labels[state] || state}`;
}

// ── Acciones del jugador ──────────────────────────────────────
function startGame() {
  wsSend({ type: 'start_game' });
}

function claimWin() {
  if (markedCards.size === 0) {
    showToast('Marca al menos una carta antes de cantar', 'error'); return;
  }
  wsSend({ type: 'claim_win', markedCards: [...markedCards] });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

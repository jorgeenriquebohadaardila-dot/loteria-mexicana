const db           = require('./db');
const { generateBoard, shuffleDeck, validateWin, PATTERN_NAMES_ES } = require('./gameLogic');
const { CARD_MAP }  = require('./cards');

// Estado en memoria: roomId → room
const rooms = new Map();

// ── Helpers WS ───────────────────────────────────────────────
function send(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcast(room, data, excludeId = null) {
  for (const [uid, p] of room.players) {
    if (uid !== excludeId) send(p.ws, data);
  }
}

function broadcastAll(room, data) {
  broadcast(room, data, null);
}

// ── Crear sala ───────────────────────────────────────────────
async function createRoom(name, hostId, opts = {}) {
  const drawMs     = opts.drawIntervalMs || +process.env.DRAW_INTERVAL_MS || 5000;
  const maxPlayers = opts.maxPlayers     || +process.env.MAX_PLAYERS_PER_ROOM || 10;

  const { rows } = await db.query(
    `INSERT INTO rooms (name, host_id, draw_interval_ms, max_players)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, hostId, drawMs, maxPlayers]
  );
  const roomId = rows[0].id;

  rooms.set(roomId, {
    id: roomId, name, hostId,
    state: 'waiting',
    players: new Map(),
    deck: [],
    drawnCards: [],   // solo IDs; se persisten en bloque al final
    drawMs,
    maxPlayers,
    drawTimer: null,
    countdownTimer: null
  });

  return roomId;
}

// ── Unirse a sala ────────────────────────────────────────────
async function joinRoom(roomId, userId, username, ws) {
  const room = rooms.get(roomId);

  if (!room) {
    const { rows } = await db.query('SELECT state FROM rooms WHERE id=$1', [roomId]);
    if (!rows[0] || rows[0].state === 'finished')
      return { error: 'Sala no disponible o ya terminó' };
    return { error: 'El servidor se reinició, vuelve al lobby' };
  }

  // Reconexión de jugador ya registrado
  if (room.players.has(userId)) {
    const player = room.players.get(userId);
    player.ws = ws;
    player.isConnected = true;

    send(ws, {
      type:        'room_joined',
      roomId,
      roomName:    room.name,
      state:       room.state,
      players:     playerList(room),
      isHost:      room.hostId === userId,
      board:       player.board.map(id => ({ id, ...CARD_MAP.get(id) })),
      markedCards: player.markedCards,
      drawnCards:  room.drawnCards.map(id => ({ id, ...CARD_MAP.get(id) }))
    });

    broadcast(room, { type: 'player_reconnected', userId, username, players: playerList(room) }, userId);
    return { reconnected: true };
  }

  if (room.state === 'active' || room.state === 'finished')
    return { error: room.state === 'finished' ? 'La partida ya terminó' : 'La partida está en curso' };

  if (room.players.size >= room.maxPlayers)
    return { error: 'Sala llena' };

  const board = generateBoard();

  await db.query(
    `INSERT INTO room_players (room_id, user_id, board)
     VALUES ($1,$2,$3)
     ON CONFLICT (room_id,user_id) DO UPDATE SET board=$3`,
    [roomId, userId, JSON.stringify(board)]
  );

  room.players.set(userId, {
    userId, username, ws,
    board,
    markedCards: [],
    isConnected: true
  });

  const players = playerList(room);

  send(ws, {
    type:        'room_joined',
    roomId,
    roomName:    room.name,
    state:       room.state,
    players,
    isHost:      room.hostId === userId,
    board:       board.map(id => ({ id, ...CARD_MAP.get(id) })),
    markedCards: [],
    drawnCards:  []
  });

  broadcast(room, { type: 'player_joined', userId, username, players }, userId);
  return { ok: true };
}

// ── Desconexión ──────────────────────────────────────────────
function leaveRoom(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const player = room.players.get(userId);
  if (player) {
    player.isConnected = false;
    player.ws = null;
    broadcast(room, { type: 'player_left', userId, username: player.username, players: playerList(room) });
  }

  if (room.state === 'waiting') {
    const connected = [...room.players.values()].filter(p => p.isConnected).length;
    if (connected === 0) cleanupRoom(roomId);
  }
}

// ── Iniciar cuenta regresiva ──────────────────────────────────
async function startCountdown(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.state !== 'waiting') return { error: 'No se puede iniciar' };
  if (room.players.size < 1)            return { error: 'Se necesita al menos 1 jugador' };

  room.state = 'starting';
  await db.query(`UPDATE rooms SET state='starting' WHERE id=$1`, [roomId]);

  let secs = +process.env.WAITING_ROOM_SECONDS || 30;
  broadcastAll(room, { type: 'countdown_started', secondsLeft: secs });

  room.countdownTimer = setInterval(async () => {
    secs--;
    broadcastAll(room, { type: 'countdown_tick', secondsLeft: secs });
    if (secs <= 0) {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
      await startGame(roomId);
    }
  }, 1000);

  return { ok: true };
}

// ── Empezar partida ───────────────────────────────────────────
async function startGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.state      = 'active';
  room.deck       = shuffleDeck();
  room.drawnCards = [];

  await db.query(
    `UPDATE rooms SET state='active', started_at=NOW() WHERE id=$1`,
    [roomId]
  );

  for (const [, p] of room.players) {
    send(p.ws, {
      type:  'game_started',
      board: p.board.map(id => ({ id, ...CARD_MAP.get(id) }))
    });
  }

  // Primera carta inmediata, luego intervalo
  drawCard(roomId);
  room.drawTimer = setInterval(() => drawCard(roomId), room.drawMs);
}

// ── Cantar carta ──────────────────────────────────────────────
// NO hace INSERT por carta — se persisten en bloque al terminar la partida
function drawCard(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.state !== 'active') return;

  if (room.deck.length === 0) {
    endGame(roomId, null, null);
    return;
  }

  const cardId = room.deck.shift();
  room.drawnCards.push(cardId);
  const card = CARD_MAP.get(cardId);

  broadcastAll(room, {
    type:      'card_drawn',
    card:      { id: cardId, ...card },
    remaining: room.deck.length,
    total:     room.drawnCards.length
  });
}

// ── Reclamar victoria ─────────────────────────────────────────
async function claimWin(roomId, userId, markedCardIds) {
  const room = rooms.get(roomId);
  if (!room || room.state !== 'active') return { error: 'Juego no activo' };

  const player = room.players.get(userId);
  if (!player) return { error: 'Jugador no encontrado' };

  const pattern = validateWin(player.board, markedCardIds, room.drawnCards);

  if (pattern) {
    broadcastAll(room, {
      type:     'win_claimed',
      userId,
      username: player.username,
      pattern:  PATTERN_NAMES_ES[pattern],
      valid:    true
    });
    await endGame(roomId, userId, pattern);
    return { valid: true };
  }

  send(player.ws, {
    type:    'invalid_win',
    message: '¡Canto inválido! Revisa tus cartas marcadas.'
  });
  return { valid: false };
}

// ── Terminar partida (transacción única) ──────────────────────
async function endGame(roomId, winnerId, winPattern) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearInterval(room.drawTimer);
  clearInterval(room.countdownTimer);
  room.state = 'finished';

  const winner = winnerId ? room.players.get(winnerId) : null;
  broadcastAll(room, {
    type:       'game_over',
    winner:     winner ? { userId: winner.userId, username: winner.username } : null,
    winPattern: winPattern ? PATTERN_NAMES_ES[winPattern] : null
  });

  // Persistir todo en una sola transacción
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Actualizar sala
    await client.query(
      `UPDATE rooms SET state='finished', finished_at=NOW(), winner_id=$2, win_pattern=$3
       WHERE id=$1`,
      [roomId, winnerId || null, winPattern || null]
    );

    // 2. Estadísticas de usuarios
    if (winnerId) {
      await client.query(
        `UPDATE users SET wins=wins+1, games_played=games_played+1 WHERE id=$1`,
        [winnerId]
      );
      for (const [uid] of room.players) {
        if (uid !== winnerId)
          await client.query(
            `UPDATE users SET games_played=games_played+1 WHERE id=$1`, [uid]
          );
      }
    } else {
      for (const [uid] of room.players)
        await client.query(
          `UPDATE users SET games_played=games_played+1 WHERE id=$1`, [uid]
        );
    }

    // 3. Persistir cartas cantadas en bloque (1 query en vez de 54)
    if (room.drawnCards.length > 0) {
      const vals    = [];
      const params  = [];
      let   p       = 1;
      for (let i = 0; i < room.drawnCards.length; i++) {
        vals.push(`($${p++}, $${p++}, $${p++})`);
        params.push(roomId, room.drawnCards[i], i + 1);
      }
      await client.query(
        `INSERT INTO drawn_cards (room_id, card_id, position) VALUES ${vals.join(',')}`,
        params
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[endGame] Transacción falló:', e.message);
  } finally {
    client.release();
  }

  setTimeout(() => rooms.delete(roomId), 60_000);
}

// ── Listado para lobby ────────────────────────────────────────
async function getRoomsForLobby() {
  const { rows } = await db.query(`
    SELECT r.id, r.name, r.state, r.max_players,
           COUNT(rp.id)::int AS player_count,
           u.username AS host_name
    FROM rooms r
    LEFT JOIN room_players rp ON r.id = rp.room_id
    LEFT JOIN users u         ON r.host_id = u.id
    WHERE r.state IN ('waiting','starting')
    GROUP BY r.id, u.username
    ORDER BY r.created_at DESC
    LIMIT 20
  `);
  return rows;
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearInterval(room.drawTimer);
  clearInterval(room.countdownTimer);
  rooms.delete(roomId);
}

function getRoomState(roomId) { return rooms.get(roomId); }

function playerList(room) {
  return [...room.players.values()].map(p => ({
    userId: p.userId, username: p.username, isConnected: p.isConnected
  }));
}

module.exports = {
  createRoom, joinRoom, leaveRoom, startCountdown,
  claimWin, getRoomsForLobby, getRoomState,
  send, broadcast, broadcastAll
};

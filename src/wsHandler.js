const jwt  = require('jsonwebtoken');
const rm   = require('./roomManager');

function init(wss) {
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.userId  = null;
    ws.roomId  = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await dispatch(ws, msg);
      } catch (e) {
        rm.send(ws, { type: 'error', message: 'Mensaje inválido' });
      }
    });

    ws.on('close', () => {
      if (ws.roomId && ws.userId) rm.leaveRoom(ws.roomId, ws.userId);
    });

    ws.on('error', (e) => console.error('[WS]', e.message));
  });

  // Heartbeat cada 30 s para limpiar conexiones muertas
  const hb = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(hb));
}

async function dispatch(ws, msg) {
  const { type, token, ...data } = msg;

  if (type === 'ping') { rm.send(ws, { type: 'pong' }); return; }

  // Autenticar JWT en cada mensaje
  if (!token) { rm.send(ws, { type: 'error', message: 'Token requerido' }); return; }
  try {
    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    ws.userId   = decoded.id;
    ws.username = decoded.username;
  } catch {
    rm.send(ws, { type: 'error', message: 'Token inválido o expirado' });
    return;
  }

  switch (type) {

    case 'join_room': {
      ws.roomId = data.roomId;
      const result = await rm.joinRoom(data.roomId, ws.userId, ws.username, ws);
      if (result.error) rm.send(ws, { type: 'error', message: result.error });
      break;
    }

    case 'start_game': {
      const room = rm.getRoomState(ws.roomId);
      if (!room) { rm.send(ws, { type: 'error', message: 'Sala no encontrada' }); break; }
      if (room.hostId !== ws.userId) { rm.send(ws, { type: 'error', message: 'Solo el anfitrión puede iniciar' }); break; }
      const r = await rm.startCountdown(ws.roomId);
      if (r.error) rm.send(ws, { type: 'error', message: r.error });
      break;
    }

    case 'mark_card': {
      const room = rm.getRoomState(ws.roomId);
      if (!room || room.state !== 'active') break;
      const player = room.players.get(ws.userId);
      if (!player) break;
      const { cardId } = data;
      if (!player.board.includes(cardId)) {
        rm.send(ws, { type: 'error', message: 'Esa carta no está en tu tablero' }); break;
      }
      const idx = player.markedCards.indexOf(cardId);
      if (idx === -1) player.markedCards.push(cardId);
      else            player.markedCards.splice(idx, 1);
      rm.send(ws, { type: 'card_marked', cardId, marked: player.markedCards });
      break;
    }

    case 'claim_win': {
      const result = await rm.claimWin(ws.roomId, ws.userId, data.markedCards || []);
      if (result.error) rm.send(ws, { type: 'error', message: result.error });
      break;
    }

    default:
      rm.send(ws, { type: 'error', message: `Tipo desconocido: ${type}` });
  }
}

module.exports = { init };

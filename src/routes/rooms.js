const jwt = require('jsonwebtoken');
const rm  = require('../roomManager');

async function roomRoutes(fastify) {

  // GET /api/rooms – listado para el lobby
  fastify.get('/', async (req, reply) => {
    const user = auth(req, reply); if (!user) return;
    return rm.getRoomsForLobby();
  });

  // POST /api/rooms – crear sala
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:            { type: 'string', minLength: 1, maxLength: 100 },
          drawIntervalMs:  { type: 'number', minimum: 2000, maximum: 30000 },
          maxPlayers:      { type: 'number', minimum: 1,    maximum: 20   }
        }
      }
    }
  }, async (req, reply) => {
    const user = auth(req, reply); if (!user) return;
    const { name, drawIntervalMs, maxPlayers } = req.body;
    const roomId = await rm.createRoom(name, user.id, { drawIntervalMs, maxPlayers });
    return reply.code(201).send({ roomId });
  });
}

function auth(req, reply) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { reply.code(401).send({ error: 'No autorizado' }); return null; }
  try { return jwt.verify(h.slice(7), process.env.JWT_SECRET); }
  catch { reply.code(401).send({ error: 'Token inválido' }); return null; }
}

module.exports = roomRoutes;

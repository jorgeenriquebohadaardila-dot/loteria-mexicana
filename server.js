require('dotenv').config();

// ── Validar variables de entorno antes de arrancar ────────────
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`❌  Falta la variable de entorno: ${key}`);
    console.error('    Copia .env.example → .env y completa los valores.');
    process.exit(1);
  }
}

const Fastify   = require('fastify');
const { WebSocketServer } = require('ws');
const path      = require('path');
const wsHandler = require('./src/wsHandler');

const isProd = process.env.NODE_ENV === 'production';

const fastify = Fastify({
  logger: isProd ? false : { level: 'warn' },
  trustProxy: true
});

// ── Plugins (en orden: compress → cors → static) ─────────────
fastify.register(require('@fastify/compress'), { global: true, threshold: 1024 });
fastify.register(require('@fastify/cors'), { origin: true });
fastify.register(require('@fastify/static'), {
  root:       path.join(__dirname, 'public'),
  prefix:     '/',
  maxAge:     3600,   // 1 h de caché para CSS/JS/HTML en el browser
  etag:       true,
  lastModified: true
});

// ── Rutas API ─────────────────────────────────────────────────
fastify.register(require('./src/routes/auth'),  { prefix: '/api/auth'  });
fastify.register(require('./src/routes/rooms'), { prefix: '/api/rooms' });
fastify.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

fastify.setNotFoundHandler((req, reply) => {
  if (req.raw.url.startsWith('/api'))
    return reply.code(404).send({ error: 'No encontrado' });
  reply.sendFile('lobby.html');
});

// ── Arranque ──────────────────────────────────────────────────
async function start() {
  try {
    // Limpiar salas que quedaron abiertas de sesiones anteriores
    const db = require('./src/db');
    const { rowCount } = await db.query(
      `UPDATE rooms SET state='finished', finished_at=NOW()
       WHERE state IN ('waiting','starting','active')`
    );
    if (rowCount > 0)
      console.log(`🧹  ${rowCount} sala(s) huérfana(s) cerradas al arrancar`);

    const port = parseInt(process.env.PORT) || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });

    const wss = new WebSocketServer({ server: fastify.server });
    wsHandler.init(wss);

    console.log(`✅  Servidor listo en http://localhost:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// ── Apagado graceful (SIGTERM de Render/Railway) ──────────────
async function shutdown(signal) {
  console.log(`\n${signal} recibido — cerrando servidor...`);
  try { await fastify.close(); } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();

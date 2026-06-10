const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../db');

async function authRoutes(fastify) {

  // POST /api/auth/register
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username','email','password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50 },
          email:    { type: 'string', format: 'email'             },
          password: { type: 'string', minLength: 6                }
        }
      }
    }
  }, async (req, reply) => {
    const { username, email, password } = req.body;
    const hash = await bcrypt.hash(password, 8);

    try {
      const { rows } = await db.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1,$2,$3) RETURNING id, username, email`,
        [username.trim(), email.toLowerCase().trim(), hash]
      );
      const user  = rows[0];
      const token = signToken(user);
      return reply.code(201).send({ token, user: safeUser(user) });
    } catch (err) {
      if (err.code === '23505')
        return reply.code(409).send({ error: 'Nombre de usuario o email ya registrado' });
      throw err;
    }
  });

  // POST /api/auth/login
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email','password'],
        properties: {
          email:    { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    const { email, password } = req.body;
    const { rows } = await db.query(
      `SELECT id, username, email, password_hash FROM users WHERE email=$1`,
      [email.toLowerCase().trim()]
    );
    if (!rows[0]) return reply.code(401).send({ error: 'Credenciales inválidas' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid)  return reply.code(401).send({ error: 'Credenciales inválidas' });

    const token = signToken(rows[0]);
    return { token, user: safeUser(rows[0]) };
  });

  // GET /api/auth/me
  fastify.get('/me', async (req, reply) => {
    const user = await verifyRequest(req, reply);
    if (!user) return;
    const { rows } = await db.query(
      `SELECT id, username, email, wins, games_played FROM users WHERE id=$1`,
      [user.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Usuario no encontrado' });
    return rows[0];
  });
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function safeUser(u) {
  return { id: u.id, username: u.username, email: u.email };
}

async function verifyRequest(req, reply) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'No autorizado' }); return null;
  }
  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    reply.code(401).send({ error: 'Token inválido' }); return null;
  }
}

module.exports = authRoutes;

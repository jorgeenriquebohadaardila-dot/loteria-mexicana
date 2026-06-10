require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('../src/db');

async function main() {
  const hash = await bcrypt.hash('admin123', 8);
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ('admin', 'admin@loteria.com', $1)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, username, email`,
    [hash]
  );
  console.log('Usuario admin listo:', rows[0]);
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });

-- ============================================================
--  Lotería Mexicana – Esquema de base de datos (PostgreSQL)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuarios registrados
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  email         VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  wins          INTEGER DEFAULT 0,
  games_played  INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Salas de juego
CREATE TABLE IF NOT EXISTS rooms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100) NOT NULL,
  state            VARCHAR(20)  NOT NULL DEFAULT 'waiting',
  host_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  winner_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  win_pattern      VARCHAR(20),
  max_players      INTEGER DEFAULT 10,
  draw_interval_ms INTEGER DEFAULT 5000,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ
);

-- Jugadores en salas (tablero persistido)
CREATE TABLE IF NOT EXISTS room_players (
  id         SERIAL PRIMARY KEY,
  room_id    UUID    REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  board      JSONB   NOT NULL,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

-- Historial de cartas cantadas por sala
CREATE TABLE IF NOT EXISTS drawn_cards (
  id        SERIAL PRIMARY KEY,
  room_id   UUID    REFERENCES rooms(id) ON DELETE CASCADE,
  card_id   INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  drawn_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_rooms_state       ON rooms(state);
CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_drawn_cards_room  ON drawn_cards(room_id);

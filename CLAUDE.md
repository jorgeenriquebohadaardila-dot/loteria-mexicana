# Lotería Mexicana – Guía para Claude Code

## Stack
- **Backend:** Node.js + Fastify 4 + ws (WebSocket nativo)
- **Base de datos:** PostgreSQL (pool máx. 5 conexiones)
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **Frontend:** HTML/CSS/JS vanilla — sin frameworks

## Estructura
```
server.js          → entrada principal (HTTP + WS)
src/
  db.js            → pool PostgreSQL
  cards.js         → 54 cartas con emoji
  gameLogic.js     → generateBoard, shuffleDeck, checkWin
  roomManager.js   → estado de salas en memoria + persistencia
  wsHandler.js     → despacho de mensajes WebSocket
  routes/
    auth.js        → /api/auth (register, login, me)
    rooms.js       → /api/rooms (list, create)
public/            → frontend estático servido por Fastify
  css/style.css
  js/api.js | auth.js | lobby.js | game.js
  index | login | register | lobby | game .html
db/schema.sql      → esquema PostgreSQL
```

## Variables de entorno requeridas
Copia `.env.example` → `.env` y completa:
- `DATABASE_URL` — cadena de conexión PostgreSQL
- `JWT_SECRET`   — secreto largo y aleatorio
- `PORT`         — por defecto 3000

## Comandos
```bash
npm install   # instalar dependencias
npm start     # producción
npm run dev   # desarrollo con --watch
```

## Base de datos
```bash
psql $DATABASE_URL < db/schema.sql
```

---

# gstack

Usa la skill `/browse` de gstack para toda navegación web.
Nunca uses las herramientas `mcp__claude-in-chrome__*` directamente.

## Skills disponibles

/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn

## Instalación de gstack (una vez por máquina)
```bash
bash setup-gstack.sh
```

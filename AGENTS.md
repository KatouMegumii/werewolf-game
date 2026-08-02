# AGENTS.md

## Commands

```bash
# Backend (port 3000)
cd backend && npm run dev     # nodemon --exec node server.js (ESM)

# Frontend (port 5173)
cd frontend && npm run dev    # vite

# Build frontend for production
cd frontend && npm run build
```

## Architecture

- **backend/** — Express + Socket.io server. Single `server.js` with all routes, game state, and Socket.io events embedded. ESM (`"type": "module"` in package.json). Database layer in `db.js` (PostgreSQL).
- **frontend/** — Vue 3 + Vite + TypeScript H5 app. Vue Router 4 (history mode). Pinia store in `gameStore.ts` is the single source of truth for auth, room, and chat state.

## Dual real-time channels

The game uses **both** Socket.io and Easemob (环信) for real-time communication:
- **Socket.io** — game state events: join/leave, seat swap, chat messages within server memory.
- **Easemob IM SDK** (`easemob-websdk`) — persistent IM chat via groups. Connection is **optional**; the app continues with Socket.io only if Easemob fails.

## Authentication

User auth is entirely delegated to **Easemob (环信)**. No local password storage. Register/login calls go through `backend/server.js` → Easemob REST API at `ngi-a1.easemob.com`. Session persists via `localStorage` only (no tokens, no refresh).

The Easemob appKey is **hardcoded** in `backend/server.js:32`: `1196260703193552#langrensha`. Changing it requires editing both `server.js` and `.env`.

## Database

- **PostgreSQL** is the database — NOT SQLite. `DEPLOYMENT.md` incorrectly states SQLite; ignore that.
- `db.js` creates a `boards` table on startup. The `pg` Pool is configured from env vars (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
- Room/player state is stored **in-memory** (Map objects in server.js). Restarting the server loses all rooms and players.

## Config

- Backend: copy `backend/.env.example` → `backend/.env`, fill in Easemob credentials and DB config.
- Frontend: copy `frontend/.env.example` → `frontend/.env`, set `VITE_API_URL` pointing to backend.
- Both `.env` files are gitignored.

## Game logic status

Core game mechanics (role assignment, night/day phases, voting, win conditions) are **not yet implemented**. The current app supports login, lobby, room creation/joining, board config CRUD, real-time chat, and seat swapping.

## Drawer pattern (critical convention)

When creating modal drawers, follow the z-index convention from `DEVELOPMENT_GUIDELINES.md`:
- Overlay: `z-index: 109`
- Drawer: `z-index: 110`, `pointer-events: none` when closed, `pointer-events: auto` when open (`.drawer.open`)
- Overlay `<div>` must be a **separate element** with `v-if`, NOT a `::before` pseudo-element.
- Multiple stacked drawers require cascading z-indices (add 100 per layer).

## Quirks

- No tests, linter, formatter, or type-check commands are configured. `vue-tsc` is listed as a devDependency but has no tsconfig.json.
- `frontend/vite.config.ts` hardcodes `allowedHosts: ['langrensha.jxjhlrs.fun']` for production.
- `nodemon --exec node` is required (not plain `nodemon`) because the backend uses ES modules.
- `ROLES_GUIDE.md` in frontend/ is gitignored — it's generated/placeholder documentation for the 25 roles.

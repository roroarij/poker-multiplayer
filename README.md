# Multiplayer Poker (Texas Hold'em)

Production-style full-stack poker app inspired by PokerNow with a server-authoritative real-time engine.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + Socket.IO + TypeScript
- Shared contract/types package for client/server consistency
- In-memory room and game state (cleanly abstracted for Redis/Postgres extension)

## Features

- Room creation + join by shareable URL
- Nickname-based access (no auth required)
- Host controls (start hand, reset table, remove player)
- Real-time turn-based Texas Hold'em with:
  - Dealer/button rotation
  - Small blind / big blind
  - Pre-flop, flop, turn, river betting
  - Fold, check, call, bet, raise, all-in
  - Side pot handling
  - Showdown with full hand ranking evaluator
- Reconnect support via session token
- Turn timer with auto-fold on timeout
- Mobile + desktop table UI

## Project Structure

```text
/server
  /src
    /engine      # pure game logic + state machine
    /rooms       # room manager and in-memory state layer
    /socket      # socket event transport and validation
/client
  /src
    /components
    /hooks
    /lib
/shared
  /src           # shared TypeScript contracts
```

## Setup

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

## Scripts

- `npm run dev` - run server + client in watch mode
- `npm run build` - build shared, server, and client
- `npm run start` - run built server
- `npm run test` - run server unit tests

## Environment Variables (`server/.env`)

- `PORT` (default `3001`)
- `CLIENT_ORIGIN` (default `http://localhost:5173`)
- `MIN_PLAYERS_TO_START` (default `2`)
- `TURN_TIMEOUT_SECONDS` (default `30`)
- `DEFAULT_SMALL_BLIND` (default `10`)
- `DEFAULT_BIG_BLIND` (default `20`)

## Deploy (Vercel + Render)

Frontend is deployed on Vercel. Deploy backend separately on Render.

### 1. Render backend

This repo includes [`render.yaml`](/Users/arirosenzweig/poker-multiplayer/render.yaml) so Render can auto-configure the service.

- In Render: **New +** -> **Blueprint**
- Connect your GitHub repo and select this project
- Set `CLIENT_ORIGIN` to your Vercel URL(s)
  - You can provide multiple origins as a comma-separated string, e.g.
    - `https://your-preview.vercel.app,https://your-production.vercel.app`
- Deploy

### 2. Vercel frontend

- In Vercel project settings, set:
  - `VITE_SERVER_URL=https://<your-render-service>.onrender.com`
- Redeploy the Vercel project

## Architecture Notes

- Engine is pure and deterministic (no Socket.IO dependency).
- Server is source of truth for all game transitions.
- Client receives sanitized state; private cards are only sent to their owner.
- Room manager isolates storage concerns to allow future Redis/Postgres swap.
- Action validation and turn ownership enforced server-side.

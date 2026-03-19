# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Kanban project management MVP with AI chat. Frontend: Next.js (static export) served by a FastAPI backend with SQLite persistence. AI chat uses OpenRouter API.

## Commands

### Running the App

```bash
./scripts/start_mac.sh    # macOS: docker compose up --build -d
./scripts/stop_mac.sh     # macOS: docker compose down
# Equivalent scripts exist for Linux and Windows
```

App runs at `http://localhost:8000`.

### Frontend (local dev, outside Docker)

```bash
cd frontend
npm run dev               # Dev server on port 3000
npm run build             # Static export to frontend/out/
npm run test:unit         # Vitest unit tests
npm run test:e2e          # Playwright E2E tests
npm run test:all          # Both
npm run test:unit -- --run src/components/KanbanBoard.test.tsx  # Single test file
```

### Backend (local dev, outside Docker)

```bash
cd backend
pytest                    # All backend tests
pytest tests/test_api.py  # Single test file
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000  # Run server
```

## Architecture

### Request Flow

1. Browser loads static assets served by FastAPI from `backend/static/`
2. Frontend authenticates client-side only (hardcoded `user`/`password` in `lib/auth.ts`, stored in `sessionStorage`)
3. On mount, `KanbanBoard` fetches `/api/board/{username}` — auto-creates user + default board if first visit
4. Every card/column change calls `PUT /api/board/{username}` — full board replace (transactional delete + re-insert)
5. AI chat calls `POST /api/ai/chat/{username}` — sends full board state + conversation history, receives JSON with `assistant_message` and optional `board_update`

### Key Files

| File | Purpose |
|---|---|
| `backend/app/main.py` | FastAPI app, all API routes |
| `backend/app/db.py` | SQLite layer (`get_board`, `replace_board`, `get_or_create_user`) |
| `backend/app/ai.py` | OpenRouter chat call, structured JSON response parsing |
| `backend/app/default_board.py` | Seed data (5 columns, 8 cards) for new users |
| `backend/app/schemas.py` | Pydantic models for board/card/column/AI request-response |
| `frontend/src/lib/api.ts` | `fetchBoard`, `saveBoard`, `sendAIChat` — all backend calls |
| `frontend/src/lib/auth.ts` | Client-side auth logic |
| `frontend/src/components/KanbanBoard.tsx` | Root board component, owns all state |
| `frontend/src/components/AIChatSidebar.tsx` | AI chat panel |

### Board Data Structure (JSON sent/received by API)

```json
{
  "columns": [{"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"]}],
  "cards": {"card-1": {"id": "card-1", "title": "Task", "details": "Description"}}
}
```

### Database Schema

Five SQLite tables: `users` → `boards` → `columns` → `cards` (foreign key chain). Board save is always a full transactional replace — never partial updates.

### AI Integration

- Model: `openai/gpt-oss-120b` via OpenRouter
- System prompt enforces structured JSON output: `{assistant_message: string, board_update?: BoardData}`
- Board updates from AI are validated via Pydantic and applied transactionally
- Requires `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`) env var

### Docker Build

Two-stage Dockerfile: Node 22 builds Next.js static export → Python 3.12 slim runs FastAPI with static assets copied in. Uses `uv` for Python deps. SQLite DB at `backend/data/pm.db` (not volume-mounted by default — ephemeral).

## MVP Constraints (intentional, do not "fix")

- Authentication is client-side only with fixed credentials
- One board per user
- Local Docker deployment only
- No JWT, no real auth backend

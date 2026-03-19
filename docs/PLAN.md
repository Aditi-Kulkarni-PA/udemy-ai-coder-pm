# Project plan

This document is the execution checklist for the MVP.

## Part 1: Plan (this document + frontend inventory)

### Checklist
- [x] Expand this file with detailed implementation substeps, testing, and success criteria.
- [x] Create `frontend/AGENTS.md` describing the current frontend code.
- [x] Get user approval on this plan before building scaffolding.

### Tests
- [x] Human review: plan is clear, sequenced, and complete for all 10 parts.

### Success criteria
- Plan is approved by user and becomes the source of truth for execution.

## Part 2: Scaffolding

### Checklist
- [x] Create containerization files at project root (Dockerfile, optional compose file, .dockerignore).
- [x] Scaffold FastAPI app in `backend/` with health and sample API endpoints.
- [x] Add startup wiring so backend serves simple static hello page first.
- [x] Add `scripts/` start/stop scripts for macOS, Linux, and Windows.
- [x] Add minimal backend docs in `backend/AGENTS.md` and README notes.

### Tests
- [x] Build container successfully.
- [x] Run container locally and verify `/` returns hello page.
- [x] Verify API route responds (for example `/api/health`).
- [x] Verify stop scripts terminate running container cleanly.

### Success criteria
- One command path exists per OS to start and stop local app via Docker.
- Hello page and sample API both work from the running container.

## Part 3: Add frontend

### Checklist
- [x] Build current Next.js frontend into static assets.
- [x] Serve those assets from FastAPI at `/` instead of hello page.
- [x] Ensure backend routing still supports API prefix paths.
- [x] Keep current board behavior unchanged.

### Tests
- [x] Frontend unit tests pass.
- [x] Frontend integration/e2e tests pass against served app.
- [x] Manual smoke test: board loads at `/` with 5 columns.

### Success criteria
- Kanban UI is visible at `/` when served through FastAPI in Docker.
- Existing frontend tests remain green.

## Part 4: Dummy sign-in flow

### Checklist
- [x] Add login UI as first screen for unauthenticated users.
- [x] Validate credentials against fixed values: `user` / `password`.
- [x] Add logout action and return user to login screen.
- [x] Keep session handling simple and local for MVP (cookie or token as chosen in implementation).

### Tests
- [x] Unit tests for auth state transitions and credential validation.
- [x] Integration tests for redirect/login/logout behavior.
- [x] E2E test for failed login and successful login.

### Success criteria
- User cannot access board until authenticated with dummy credentials.
- Logout reliably clears auth state and hides board.

## Part 5: Database modeling

### Checklist
- [x] Propose SQLite schema for users, board, columns, cards, and ordering.
- [x] Provide JSON representation of schema in `docs/`.
- [x] Document migration/init strategy (create DB if missing).
- [x] Document tradeoffs and assumptions for one-board-per-user MVP.
- [ ] Get explicit user sign-off before implementation.

### Tests
- [x] Validate schema JSON against sample board data.
- [x] Review that schema supports future multi-user extension.

### Success criteria
- Approved schema documentation exists and is implementation-ready.

## Part 6: Backend APIs + persistence

### Checklist
- [ ] Implement DB initialization on startup when DB file is missing.
- [ ] Add endpoints to fetch board for authenticated user.
- [ ] Add endpoints to update board changes (rename/move/create/delete).
- [ ] Add input/output models and validation.
- [ ] Add backend unit tests for repository + API layers.

### Tests
- [ ] Unit tests for DB CRUD and ordering logic.
- [ ] API tests for happy path and invalid payload handling.
- [ ] Startup test proving DB auto-creation.

### Success criteria
- Board state persists across server restarts.
- API contracts are tested and stable.

## Part 7: Frontend + backend integration

### Checklist
- [ ] Replace frontend in-memory board state initialization with API fetch.
- [ ] Persist all board changes via backend APIs.
- [ ] Add loading/error handling with simple UX.
- [ ] Keep drag/drop and editing interactions intact.

### Tests
- [ ] Frontend integration tests with API mocked and real backend path.
- [ ] E2E tests covering rename/add/delete/move persistence.
- [ ] Manual restart test: reload still shows saved state.

### Success criteria
- Kanban is a real persistent application backed by API + DB.

## Part 8: AI connectivity (OpenRouter)

### Checklist
- [ ] Add backend OpenRouter client using `OPENAI_API_KEY`.
- [ ] Configure model `openai/gpt-oss-120b`.
- [ ] Add a minimal internal route/service test prompt call (`2+2`).
- [ ] Add safe error mapping for missing key and provider/network failures.

### Tests
- [ ] Automated test for client request construction.
- [ ] Connectivity test route/service returns a valid completion for `2+2`.

### Success criteria
- Backend can successfully call OpenRouter with configured model.

## Part 9: Structured-output AI board operations

### Checklist
- [ ] Define strict structured response schema with:
	- [ ] assistant message text
	- [ ] optional board update payload
- [ ] Send full board JSON + user message + prior conversation history.
- [ ] Validate and parse model response against schema.
- [ ] Apply optional board updates transactionally in backend.
- [ ] Return both assistant text and latest board state to frontend.

### Tests
- [ ] Unit tests for schema validation and parser failures.
- [ ] Service tests for no-op response vs board-modifying response.
- [ ] Integration test that malformed AI output is handled gracefully.

### Success criteria
- AI responses are predictable and machine-readable.
- Optional board updates are safely applied and persisted.

## Part 10: Frontend AI sidebar

### Checklist
- [ ] Add sidebar chat UI on board page.
- [ ] Send user messages and board context through backend AI endpoint.
- [ ] Render conversation history in sidebar.
- [ ] If AI returns board updates, refresh UI state automatically.
- [ ] Keep UX simple and aligned with existing style tokens.

### Tests
- [ ] Component tests for chat send/render states.
- [ ] Integration test for AI response that updates board UI.
- [ ] E2E flow: ask AI to change card, board updates automatically.

### Success criteria
- User can chat with AI from sidebar.
- AI can optionally update board and changes appear immediately.

## Execution order and gates

- Gate A: complete Part 1 and obtain user approval.
- Gate B: complete Parts 2-4 and verify app runs end-to-end locally with auth.
- Gate C: complete Parts 5-7 and verify persistent board.
- Gate D: complete Parts 8-10 and verify AI-assisted board updates.
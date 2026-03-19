# Code Review Report

**Project:** PM Kanban MVP
**Date:** 2026-03-19
**Scope:** Full codebase — backend (FastAPI/SQLite), frontend (Next.js/React), infrastructure (Docker)

---

## Critical

### C1. Hard-coded credentials in frontend source
**File:** `frontend/src/lib/auth.ts:4-5`
Username `user` and password `password` are exported constants compiled into the client bundle — visible to anyone who views page source. The backend never validates identity; any client can call any `/api/board/{username}` endpoint directly.
**Fix:** Validate credentials server-side; use proper session tokens (JWT or server-side sessions). For MVP extension: move credentials to backend env vars and add a real `/api/auth/login` endpoint.

---

### C2. Redundant condition — dead code path
**File:** `backend/app/main.py:85-86`
```python
board_updated = parsed.board_update is not None
if board_updated and parsed.board_update is not None:   # second check is always true here
```
This is harmless today but creates a confusing invariant and masks future refactoring mistakes.
**Fix:**
```python
if parsed.board_update is not None:
    board_updated = True
    # ... update code
else:
    board_updated = False
```

---

### C3. DB commit failures are silently swallowed
**File:** `backend/app/main.py:47, 93`
`conn.commit()` is called bare. If the commit raises (disk full, I/O error, locked DB), the exception propagates through no handler, leaving the user with a generic 500 and the board in an ambiguous state.
**Fix:** Wrap both call sites in a try/except that rolls back and returns a clear 503 with a retry hint.

---

### C4. AI can silently drop cards from the board
**File:** `backend/app/ai.py` / `backend/app/main.py:87-94`
`_validate_board_payload` checks structural consistency (card dict ↔ column lists match), but does **not** check that the AI-returned board preserves the same card IDs as the current board. The AI could fabricate a board with fewer cards, effectively deleting user data.
**Fix:** After parsing the AI response, compare `set(current_board cards)` with `set(ai_board cards)`. Reject any update that removes cards the AI was not explicitly asked to delete.

---

### C5. Unvalidated username path parameter
**File:** `backend/app/main.py:34, 41, 64`
`username` comes from the URL path with no length or character validation. A 10 000-character username is accepted, stored, and used as a DB lookup key.
**Fix:** Add a `Field` validator or use a `Annotated[str, Path(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')]` on the route parameter.

---

## High

### H1. No rate limiting on AI endpoint
**File:** `backend/app/main.py:63`
`POST /api/ai/chat/{username}` triggers a real paid API call with no throttle. A script or misbehaving client can run up unbounded cost.
**Fix:** Add a per-username cooldown (e.g., 1 request per 3 seconds) using an in-memory TTL cache. For production: use a proper rate-limit middleware.

---

### H2. No size limit on request bodies
**File:** `backend/app/main.py` (all routes)
FastAPI's default body limit is very large. A client can POST a board with thousands of cards and megabytes of text — no limit exists in code.
**Fix:** Set `app = FastAPI(...)` with a body size limit, or add a `ContentSizeLimitMiddleware`.

---

### H3. No input length constraints on Pydantic schemas
**File:** `backend/app/schemas.py:4-18`
`CardPayload.title`, `CardPayload.details`, and `ColumnPayload.title` accept arbitrarily long strings.
**Fix:**
```python
from pydantic import Field
class CardPayload(BaseModel):
    id: str = Field(max_length=100)
    title: str = Field(max_length=255)
    details: str = Field(default="", max_length=5000)
```

---

### H4. Client-side ID generation is collision-prone
**File:** `frontend/src/lib/kanban.ts:164-168`
```typescript
const randomPart = Math.random().toString(36).slice(2, 8);  // 6 chars ≈ 2 billion combos
const timePart = Date.now().toString(36);
```
Two cards added in rapid succession (same millisecond) share identical `timePart`. Combined random entropy is ~36 bits — low for a production system.
**Fix:** Use `crypto.randomUUID()` (available in all modern browsers and Node.js) or install `nanoid`.

---

### H5. Fetch requests have no timeout
**File:** `frontend/src/lib/api.ts:28, 34, 50`
All three `fetch` calls have no `AbortController` timeout. A hung backend keeps the UI's "Loading..." or "Sending..." state forever.
**Fix:**
```typescript
const fetchWithTimeout = (url: string, options: RequestInit = {}, ms = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};
```

---

### H6. Race condition on board load
**File:** `frontend/src/components/KanbanBoard.tsx:37-64`
The `isMounted` guard prevents a stale `fetchBoard` response from updating state, but if `username` changes (hypothetically) and a new load starts while the first is still in flight, the two loads race with no cancellation.
**Fix:** Pass an `AbortController.signal` to `fetchBoard` and cancel the previous request in the `useEffect` cleanup.

---

### H7. No CORS configuration
**File:** `backend/app/main.py`
FastAPI has no explicit CORS middleware. If the frontend is ever hosted on a different origin, all API requests will be rejected by browsers. Also leaves the app open to CSRF if CORS headers are later added incorrectly.
**Fix:** Add `CORSMiddleware` with an explicit `allow_origins` list (not `"*"`).

---

### H8. AI API key validated at call time, not at startup
**File:** `backend/app/ai.py:41-48`
The missing-key check runs inside `call_openrouter()` — only discovered when a user first tries AI chat. The app starts fine with no key set.
**Fix:** In `create_app()`, check for at least one API key and log a clear startup warning if neither is present. Optionally disable the AI routes entirely.

---

### H9. No logging anywhere in the backend
**File:** All backend files
No `logging` calls exist. There is no audit trail of board changes, AI calls, errors, or user creation events.
**Fix:** Add `import logging` and structured log lines at key points: user creation, board replace, AI request start/finish/error.

---

### H10. `_extract_json_object` fallback accepts arbitrary text fragments
**File:** `backend/app/ai.py:25-39`
The fallback path does `cleaned[start : end + 1]` — the outermost `{` to the outermost `}`. If the model returns prose with a JSON snippet embedded inside a sentence, the fallback silently parses only that snippet.
**Fix:** On the fallback path, log a warning and only accept the result if it passes the full Pydantic schema validation immediately after extraction.

---

### H11. User message added to UI before API call succeeds
**File:** `frontend/src/components/AIChatSidebar.tsx:28-46`
The user's message is pushed into `messages` state before `sendAIChat` resolves. On API error the message stays in the history with no way to retry just that message.
**Fix:** Mark the user message as `status: "pending"` and only confirm it (remove the status) on success, or roll it back on failure.

---

### H12. E2E tests share a live backend DB — no test isolation
**File:** `frontend/tests/kanban.spec.ts`, `playwright.config.ts`
Tests 3 and 4 run sequentially against the same DB. Test 3 persists a "Playwright card" that bleeds into test 4's board state. This makes the suite order-dependent and brittle.
**Fix:** Either reset the DB between tests (e.g., a `DELETE /api/board/{username}` test-only endpoint), or stub the backend entirely in E2E tests (as tests 2 and 5 already do for AI).

---

## Medium

### M1. `whitespace-pre-wrap` on AI output without HTML escaping
**File:** `frontend/src/components/AIChatSidebar.tsx:70`
React auto-escapes text content, so XSS is not a current risk. However, the comment about `whitespace-pre-wrap` is worth noting: if this component is ever refactored to use `dangerouslySetInnerHTML` for Markdown rendering, existing content would become an XSS vector.
**Fix:** Document this constraint. If Markdown rendering is added later, use a sanitizing library (`DOMPurify` + `marked`, or `react-markdown`).

---

### M2. Chat history lost on page refresh
**File:** `frontend/src/components/AIChatSidebar.tsx`
`messages` state is ephemeral — lost on refresh. The AI also receives no history on the first message of a new session, so multi-turn conversation context is always cold.
**Fix:** Persist chat history to `sessionStorage` keyed by username. Restore on mount.

---

### M3. AI model names not configurable
**File:** `backend/app/ai.py:9-12`
Model names are hard-coded constants. Switching models (e.g., to a newer GPT or Claude version) requires a code change and redeploy.
**Fix:** Read from env vars: `OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")`.

---

### M4. `initialData` used as fallback silently hides backend errors
**File:** `frontend/src/components/KanbanBoard.tsx:47-52`
When `fetchBoard` fails, the board silently falls back to the hardcoded `initialData`. The error message says "Using local fallback board. Backend unavailable." — but the user is editing data that will never be saved, with no visual distinction from a real board.
**Fix:** Show a more prominent non-dismissable error banner. Disable card edits until the backend is confirmed reachable.

---

### M5. Column position reordering not validated against the committed schema
**File:** `backend/app/db.py:164-184` / `backend/app/schemas.py`
`replace_board` accepts any ordering of columns — including zero columns. A client (or AI) could save a board with 0 columns, which would wipe all data.
**Fix:** Validate `len(board.columns) >= 1` in `_validate_board_payload`.

---

### M6. No test for mismatched board card mapping (validation path)
**File:** `backend/tests/test_api.py`
`_validate_board_payload` raises `ValueError` for mismatched cards, but no test exercises this path through the API layer (the 400 response).
**Fix:** Add a test that PUTs a board where `cards` dict and column `cardIds` disagree and asserts a 400 response.

---

### M7. No test for AI board update persistence
**File:** `backend/tests/test_api.py:37-57`
`test_ai_chat_route_with_mock` only tests the no-op case (`board_update: null`). The code path that calls `replace_board` from an AI response is never tested.
**Fix:** Add a test where the mock returns a `board_update` and verify `get_board` reflects the new state.

---

### M8. Playwright `webServer` config starts a dev server on every run
**File:** `frontend/playwright.config.ts`
`reuseExistingServer: true` is set, but the base URL points to port 3000. When no server is running, Playwright starts a dev server — which has no backend, so board API calls 404 and the board falls back to `initialData`. Tests pass but don't test the real backend integration.
**Fix:** Add a separate Playwright config (e.g., `playwright.docker.config.ts`) that targets `http://localhost:8000` for full-stack integration runs.

---

### M9. Stale `backend/data/pm.db` committed to repository
**File:** `backend/data/pm.db` (tracked in git, `A` in git status)
A binary SQLite file in the repo means every developer starts with potentially different data, and Docker builds could bake in a stale DB state. (`.dockerignore` now excludes it, but the git-tracked file remains.)
**Fix:** Add `backend/data/` to `.gitignore`. Delete the committed DB file. The `init_db` + `ensure_user_board` seed path handles DB creation on first run.

---

### M10. `ensure_user_board` auto-creates users silently
**File:** `backend/app/db.py:90-105`
Any string passed as `username` (from the URL path) creates a new user and board with seed data. There is no authentication check before board creation.
**Fix:** This is intentional for the MVP (since auth is client-side only), but document it as a known limitation. When real auth is added, this function must verify a valid session token before creating a user.

---

## Low

### L1. Missing `.env.example`
**File:** (missing)
Contributors have no reference for required env vars. Both `OPENAI_API_KEY` and `OPENROUTER_API_KEY` are undocumented outside of code.
**Fix:** Add `.env.example`:
```
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
OPENAI_MODEL=gpt-4o-mini
```

---

### L2. `backend/data/pm.db` in `.gitignore` still missing
**File:** `.gitignore` (root)
The `.dockerignore` now excludes the DB, but `.gitignore` does not. The file is tracked in git (`A` status).
**Fix:** Add to `.gitignore`:
```
backend/data/pm.db
backend/data/*.db
```

---

### L3. AI conversation history grows unbounded in-memory
**File:** `frontend/src/components/AIChatSidebar.tsx`
Every message is kept in state forever. A very long session sends the entire history to the backend on every message. Long history = large tokens = slow + expensive AI calls.
**Fix:** Limit history sent to the backend to the last N turns (e.g., last 10 messages).

---

### L4. `temperature: 0.4` on structured-output AI calls
**File:** `backend/app/ai.py:52`
For structured JSON output (where determinism matters), temperature > 0 introduces unnecessary variability and increases the chance of malformed JSON.
**Fix:** Set `temperature: 0.0` or `0.1` for the structured-output path. Reserve higher temperature for free-text generation.

---

### L5. AI system prompt does not enforce max card/column limits
**File:** `backend/app/ai.py:79-94`
The system prompt tells the AI to return the complete board but does not say "do not add more than N cards". An AI hallucinating extras would pass Pydantic validation.
**Fix:** Add to the system prompt: "The board must not exceed 5 columns or 50 cards total."

---

### L6. `KanbanCardPreview` component not reviewed
**File:** `frontend/src/components/KanbanCardPreview.tsx` (not included in review)
This component is used in `DragOverlay` but was not found in the initial file listing. Its correctness was not reviewed.
**Fix:** Confirm it exists and has the same accessibility/security posture as `KanbanCard`.

---

### L7. No `aria-live` region for board sync errors
**File:** `frontend/src/components/KanbanBoard.tsx:203-205`
The sync error paragraph renders visually but is not announced to screen readers.
**Fix:** Add `role="alert"` to the error paragraph so assistive technology reads it when it appears.

---

### L8. `handleDragEnd` calls `persistBoard` inside `setBoard` updater
**File:** `frontend/src/components/KanbanBoard.tsx:86-93`
Calling `persistBoard` (which calls `saveBoard`) inside the `setBoard` functional updater is a side effect inside a state updater — React discourages this pattern (it can be called twice in Strict Mode).
**Fix:** Separate the persist call from the state updater:
```typescript
setBoard((prev) => {
  const nextBoard = { ...prev, columns: moveCard(...) };
  return nextBoard;
});
// Call persistBoard outside
```
(This requires capturing `nextBoard` before setState, which requires a local variable.)

---

### L9. `NewCardForm` has no max length on title input
**File:** `frontend/src/components/NewCardForm.tsx` (assumed)
No `maxLength` attribute on the card title input means users can type arbitrarily long titles that overflow card UI or hit backend limits.
**Fix:** Add `maxLength={255}` to the title input and `maxLength={5000}` to details.

---

### L10. Docker container runs as root
**File:** `Dockerfile`
No `USER` directive is set; the container process runs as root. If the FastAPI process is compromised, the attacker has root access inside the container.
**Fix:** Add to Dockerfile:
```dockerfile
RUN adduser --disabled-password --no-create-home appuser
USER appuser
```

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 12 |
| Medium | 10 |
| Low | 10 |
| **Total** | **37** |

## Recommended action order

**Before any production use:**
- C1 — real authentication (server-side credential validation)
- C4 — prevent AI from silently deleting cards
- H1 — rate-limit AI endpoint
- H3 — add field-length constraints to Pydantic schemas

**Short-term cleanup:**
- C2, C3, C5 — fix dead code and missing error handling
- H5 — add fetch timeouts
- H8 — fail fast on missing API key at startup
- H9 — add logging
- M9, L2 — remove committed DB from git

**Nice to have:**
- H6 — AbortController for board fetch race
- M2 — persist chat history to sessionStorage
- M3 — make AI model configurable via env var
- L4 — lower AI temperature to 0 for structured output
- L10 — run Docker as non-root user

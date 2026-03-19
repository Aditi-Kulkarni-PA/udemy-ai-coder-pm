# Database approach (MVP)

## Scope

This document defines the SQLite persistence model for the Kanban app MVP.

MVP behavior constraints:
- One board per user
- Fixed dummy login (`user` / `password`) at UI level
- Board must persist cards, column titles, and card ordering

## Selected model

The schema is defined in `docs/db-schema.json`.

Tables:
- `users`
- `boards` (one row per user in MVP via `UNIQUE(user_id)`)
- `columns` (column order by `position`)
- `cards` (per-column order by `position`)

Why this model:
- Supports all current frontend operations: rename column, add/delete card, move card within/across columns
- Keeps ordering explicit and queryable
- Allows future expansion to multi-board without changing card/column fundamentals

## DB initialization and migration strategy

Startup behavior for backend (Part 6 target):
1. Open SQLite file at `backend/data/pm.db`
2. Ensure `PRAGMA foreign_keys = ON`
3. Execute `CREATE TABLE IF NOT EXISTS` for all tables
4. Create indexes with `IF NOT EXISTS`
5. Seed default user + board + 5 default columns only when absent

Migration approach:
- Use a lightweight `schema_version` integer (`PRAGMA user_version`) to track versions
- For MVP, version `1` only
- Future changes should add incremental migration steps based on current `user_version`

## Read/write strategy for board APIs

Read board (`GET`):
- Query columns ordered by `position`
- Query cards ordered by `(column_id, position)`
- Recompose response shape used by frontend (`columns[]` + `cards{}`)

Write board operations (`PATCH`/mutations):
- Column rename updates `columns.title`
- Add/delete card updates `cards`
- Card moves update `column_id` and `position` in a single transaction
- Reindex impacted siblings after move/delete to keep positions contiguous

## Tradeoffs and assumptions

Assumptions:
- Current auth remains dummy; backend uses username identity for board ownership
- Column IDs and card IDs stay as text to match existing frontend IDs

Tradeoffs:
- `position`-based ordering is simple and robust for MVP, but card moves may rewrite multiple rows
- One-board-per-user enforced by schema now; future multi-board support requires dropping/adjusting `UNIQUE(user_id)` on `boards`

## Validation against current frontend model

Current frontend initial board has:
- 5 columns
- 8 cards
- ordered columns and ordered cards within each column

Schema coverage:
- Column order -> `columns.position`
- Card order within column -> `cards.position`
- Card content -> `cards.title`, `cards.details`
- Board ownership -> `boards.user_id`

This is sufficient for Part 6 backend CRUD implementation.
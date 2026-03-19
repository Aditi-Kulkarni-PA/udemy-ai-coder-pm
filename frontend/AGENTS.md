# Frontend overview

This directory contains a working Next.js Kanban MVP UI used as the project starting point.

## Stack

- Next.js App Router (`next@16`)
- React 19 + TypeScript
- Tailwind CSS v4 + CSS custom properties for theme tokens
- `@dnd-kit` for card drag-and-drop
- Vitest + Testing Library for unit/component tests
- Playwright for end-to-end tests

## Current app structure

- `src/app/layout.tsx`
  - Loads Google fonts (`Space_Grotesk`, `Manrope`), global styles, and page metadata.
- `src/app/page.tsx`
  - Renders `KanbanBoard` as the home page.
- `src/app/globals.css`
  - Defines color/token variables aligned with project palette.

## Core domain module

- `src/lib/kanban.ts`
  - Defines `Card`, `Column`, `BoardData` types.
  - Stores `initialData` for one in-memory board.
  - Implements `moveCard(columns, activeId, overId)` for same-column reorder and cross-column moves.
  - Implements `createId(prefix)` for client-side card IDs.

## UI components

- `src/components/KanbanBoard.tsx`
  - Owns board state in memory via `useState`.
  - Configures drag-and-drop (`DndContext`, `DragOverlay`, pointer sensor).
  - Supports:
    - Column rename
    - Card add
    - Card delete
    - Card move across columns
  - Renders 5-column board layout and top summary header.

- `src/components/KanbanColumn.tsx`
  - Droppable column container.
  - Editable column title input.
  - Sortable card list + empty state.
  - Includes `NewCardForm`.

- `src/components/KanbanCard.tsx`
  - Sortable draggable card.
  - Displays title/details.
  - Remove button triggers card deletion.

- `src/components/NewCardForm.tsx`
  - Expand/collapse add-card form.
  - Validates non-empty title.
  - Submits title/details to parent.

- `src/components/KanbanCardPreview.tsx`
  - Drag overlay preview card while dragging.

## Test coverage (current)

- `src/lib/kanban.test.ts`
  - Unit tests for `moveCard` reorder/move/drop-to-column behavior.

- `src/components/KanbanBoard.test.tsx`
  - Component tests for rendering, renaming column, add/remove card.

- `tests/kanban.spec.ts`
  - E2E tests for board load, add card, and drag card between columns.

## Current limitations

- Frontend-only in-memory state (no backend persistence).
- No authentication yet.
- No AI sidebar/chat yet.
- No backend API integration yet.

## Notes for next phases

- Keep UI behavior parity while moving data operations to backend APIs.
- Preserve current design tokens in `globals.css`.
- Update tests alongside each phase of integration to maintain confidence.
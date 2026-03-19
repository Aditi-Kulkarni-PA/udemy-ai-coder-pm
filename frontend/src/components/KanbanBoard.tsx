"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { BoardSelector } from "@/components/BoardSelector";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { fetchBoardData, saveBoardData } from "@/lib/api";
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  username: string;
  onLogout?: () => void;
};

export const KanbanBoard = ({ username, onLogout }: KanbanBoardProps) => {
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [overCardId, setOverCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  // Track in-flight save to avoid race conditions
  const saveAbortRef = useRef<AbortController | null>(null);

  const columnIds = useMemo(
    () => new Set(board.columns.map((c) => c.id)),
    [board.columns]
  );

  // Three-tier collision detection
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerHits = pointerWithin(args);
      const cardHit = pointerHits.find((h) => !columnIds.has(String(h.id)));
      if (cardHit) return [cardHit];

      const columnHit = pointerHits.find((h) => columnIds.has(String(h.id)));
      if (!columnHit) return rectIntersection(args);

      const column = board.columns.find((c) => c.id === String(columnHit.id));
      const cardIdsInColumn = new Set(column?.cardIds ?? []);

      if (cardIdsInColumn.size === 0) return [columnHit];

      const cardCollisions = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) =>
          cardIdsInColumn.has(String(c.id))
        ),
      });

      return cardCollisions.length > 0 ? cardCollisions : [columnHit];
    },
    [columnIds, board.columns]
  );

  const persistBoard = useCallback(
    (nextBoard: BoardData, boardId: number) => {
      void saveBoardData(username, boardId, nextBoard).catch(() => {
        setSyncError("Could not sync board to backend.");
      });
    },
    [username]
  );

  // Load board data when activeBoardId changes
  useEffect(() => {
    if (activeBoardId === null) return;

    const controller = new AbortController();
    setIsLoading(true);
    setSyncError("");

    const load = async () => {
      try {
        const remote = await fetchBoardData(username, activeBoardId, controller.signal);
        setBoard(remote);
      } catch {
        if (!controller.signal.aborted) {
          setSyncError("Backend unavailable — board edits will not be saved.");
          setBoard(initialData);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [username, activeBoardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    setOverCardId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const id = event.over?.id;
    setOverCardId(id && !columnIds.has(String(id)) ? String(id) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    setOverCardId(null);
    if (!over || active.id === over.id || activeBoardId === null) return;

    const nextBoard = {
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    };
    setBoard(nextBoard);
    persistBoard(nextBoard, activeBoardId);
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    if (activeBoardId === null) return;
    setBoard((prev) => {
      const nextBoard = {
        ...prev,
        columns: prev.columns.map((col) =>
          col.id === columnId ? { ...col, title } : col
        ),
      };
      persistBoard(nextBoard, activeBoardId);
      return nextBoard;
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    if (activeBoardId === null) return;
    const id = createId("card");
    setBoard((prev) => {
      const nextBoard = {
        ...prev,
        cards: {
          ...prev.cards,
          [id]: { id, title, details: details || "No details yet." },
        },
        columns: prev.columns.map((col) =>
          col.id === columnId ? { ...col, cardIds: [...col.cardIds, id] } : col
        ),
      };
      persistBoard(nextBoard, activeBoardId);
      return nextBoard;
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (activeBoardId === null) return;
    setBoard((prev) => {
      const nextBoard = {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((col) =>
          col.id === columnId
            ? { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) }
            : col
        ),
      };
      persistBoard(nextBoard, activeBoardId);
      return nextBoard;
    });
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    // Use h-screen + overflow-hidden on this wrapper so the page never scrolls —
    // all scrolling happens inside the columns. This prevents the AI sidebar's
    // scrollIntoView from shifting the header off-screen.
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Decorative radial gradients — pointer-events-none so they don't block clicks */}
      <div className="pointer-events-none fixed left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)] z-0" />
      <div className="pointer-events-none fixed bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)] z-0" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 px-6 pb-6 pt-5">
        {/* ── Header ── */}
        <header className="flex flex-shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-5 py-3 shadow-[var(--shadow)] backdrop-blur">
          {/* Logo + title */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--navy-dark)]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" className="h-4 w-4">
                <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2A1.5 1.5 0 0 1 6 3.5v9A1.5 1.5 0 0 1 4.5 14h-2A1.5 1.5 0 0 1 1 12.5v-9ZM7.5 2A1.5 1.5 0 0 0 6 3.5v5A1.5 1.5 0 0 0 7.5 10h6A1.5 1.5 0 0 0 15 8.5v-5A1.5 1.5 0 0 0 13.5 2h-6Z" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold leading-none text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-0.5 text-xs text-[var(--gray-text)]">
                {username}
              </p>
            </div>
          </div>

          {/* Board tabs */}
          <div className="flex-1">
            <BoardSelector
              username={username}
              activeBoardId={activeBoardId}
              onSelectBoard={(id) => {
                setActiveBoardId(id);
                setSyncError("");
              }}
            />
          </div>

          {/* Right-side controls */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {syncError ? (
              <p
                role="alert"
                className="rounded-lg border border-[var(--secondary-purple)] bg-[var(--secondary-purple)]/10 px-3 py-1.5 text-xs font-medium text-[var(--secondary-purple)]"
              >
                {syncError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 ${
                aiOpen ? "bg-[var(--navy-dark)]" : "bg-[var(--secondary-purple)]"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm-.75 4.25a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5ZM8 10.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              </svg>
              {aiOpen ? "Hide AI" : "AI Assistant"}
            </button>
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                title="Log out"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 0 1 4.75 2h3a2.75 2.75 0 0 1 2.75 2.75v.5a.75.75 0 0 1-1.5 0v-.5c0-.69-.56-1.25-1.25-1.25h-3c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h3c.69 0 1.25-.56 1.25-1.25v-.5a.75.75 0 0 1 1.5 0v.5A2.75 2.75 0 0 1 7.75 14h-3A2.75 2.75 0 0 1 2 11.25v-6.5Zm9.47.47a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06l-2.25 2.25a.75.75 0 1 1-1.06-1.06l.97-.97H6.75a.75.75 0 0 1 0-1.5h5.69l-.97-.97a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            ) : null}
          </div>
        </header>

        {/* ── Content area (grows to fill remaining height) ── */}
        <div className={`grid min-h-0 flex-1 gap-4 ${aiOpen ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"}`}>
          {isLoading || activeBoardId === null ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <p className="text-sm font-medium text-[var(--gray-text)]">Loading board...</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {/* Columns scroll horizontally on small screens */}
              <section className="grid gap-3 overflow-x-auto lg:grid-cols-5" style={{ alignContent: "start" }}>
                {board.columns.map((column, index) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    columnIndex={index}
                    cards={column.cardIds.map((cardId) => board.cards[cardId])}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    overCardId={overCardId}
                  />
                ))}
              </section>
              <DragOverlay>
                {activeCard ? (
                  <div className="w-[260px]">
                    <KanbanCardPreview card={activeCard} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {aiOpen ? (
            <AIChatSidebar
              username={username}
              boardId={activeBoardId ?? undefined}
              onBoardUpdate={setBoard}
              onClose={() => setAiOpen(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

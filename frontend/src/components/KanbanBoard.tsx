"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { fetchBoard, saveBoard } from "@/lib/api";
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  username: string;
  onLogout?: () => void;
};

export const KanbanBoard = ({ username, onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [overCardId, setOverCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const columnIds = useMemo(
    () => new Set(board.columns.map((c) => c.id)),
    [board.columns]
  );

  // Three-tier collision strategy:
  // 1. Pointer directly on a card → use that card (exact insertion)
  // 2. Pointer in the gap between cards → closestCenter restricted to cards
  //    in the SAME column the pointer is over (avoids column center winning)
  // 3. Pointer over an empty column or outside all columns → column / rectIntersection
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerHits = pointerWithin(args);

      // 1. Pointer is directly on a card
      const cardHit = pointerHits.find((h) => !columnIds.has(String(h.id)));
      if (cardHit) return [cardHit];

      // 2. Identify the column the pointer is inside
      const columnHit = pointerHits.find((h) => columnIds.has(String(h.id)));
      if (!columnHit) {
        // Not over any column — fall back to rect intersection
        return rectIntersection(args);
      }

      // 3. Use closestCenter restricted to cards inside THIS column only.
      //    This prevents the (tall) column's own center from winning over nearby cards.
      const column = board.columns.find((c) => c.id === String(columnHit.id));
      const cardIdsInColumn = new Set(column?.cardIds ?? []);

      if (cardIdsInColumn.size === 0) {
        // Empty column — drop onto the column itself (appends)
        return [columnHit];
      }

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

  const persistBoard = (nextBoard: BoardData) => {
    void saveBoard(username, nextBoard).catch(() => {
      setSyncError("Could not sync board to backend.");
    });
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadBoard = async () => {
      setIsLoading(true);
      setSyncError("");
      try {
        const remoteBoard = await fetchBoard(username, controller.signal);
        setBoard(remoteBoard);
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

    void loadBoard();
    return () => controller.abort();
  }, [username]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    setOverCardId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const id = event.over?.id;
    // Only track card IDs for the indicator — column IDs don't get a line
    setOverCardId(id && !columnIds.has(String(id)) ? String(id) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    setOverCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const nextBoard = {
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    };
    setBoard(nextBoard);
    persistBoard(nextBoard);
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) => {
      const nextBoard = {
        ...prev,
        columns: prev.columns.map((column) =>
          column.id === columnId ? { ...column, title } : column
        ),
      };
      persistBoard(nextBoard);
      return nextBoard;
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    setBoard((prev) => {
      const nextBoard = {
        ...prev,
        cards: {
          ...prev.cards,
          [id]: { id, title, details: details || "No details yet." },
        },
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? { ...column, cardIds: [...column.cardIds, id] }
            : column
        ),
      };
      persistBoard(nextBoard);
      return nextBoard;
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setBoard((prev) => {
      const nextBoard = {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
      };
      persistBoard(nextBoard);
      return nextBoard;
    });
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-8 px-6 pb-16 pt-10">
        <header className="flex flex-col gap-5 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-2 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAiOpen((v) => !v)}
                  className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                >
                  {aiOpen ? "Hide AI" : "AI Assistant"}
                </button>
                {onLogout ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                  >
                    Log out
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        {syncError ? (
          <p
            role="alert"
            className="rounded-xl border border-[var(--secondary-purple)] bg-[var(--secondary-purple)]/10 px-4 py-3 text-sm font-medium text-[var(--secondary-purple)]"
          >
            {syncError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-sm font-medium text-[var(--gray-text)]">Loading board...</p>
        ) : (
          <div className={`grid gap-6 ${aiOpen ? "xl:grid-cols-[minmax(0,1fr)_272px]" : "grid-cols-1"}`}>
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <section className="grid gap-4 lg:grid-cols-5">
                {board.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
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

            {aiOpen ? (
              <AIChatSidebar
                username={username}
                onBoardUpdate={setBoard}
                onClose={() => setAiOpen(false)}
              />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
};

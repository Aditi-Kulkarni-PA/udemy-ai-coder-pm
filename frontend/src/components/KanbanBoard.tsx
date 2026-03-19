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

      <main className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-6 pb-6 pt-5">
        {/* Compact single-row header */}
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-white/80 px-5 py-3 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--navy-dark)]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" className="h-4 w-4">
                <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2A1.5 1.5 0 0 1 6 3.5v9A1.5 1.5 0 0 1 4.5 14h-2A1.5 1.5 0 0 1 1 12.5v-9ZM7.5 2A1.5 1.5 0 0 0 6 3.5v5A1.5 1.5 0 0 0 7.5 10h6A1.5 1.5 0 0 0 15 8.5v-5A1.5 1.5 0 0 0 13.5 2h-6Z" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold leading-none text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-0.5 text-xs text-[var(--gray-text)]">
                Single Board Kanban · Zero clutter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <p className="text-sm font-medium text-[var(--gray-text)]">Loading board...</p>
          </div>
        ) : (
          <div className={`grid flex-1 gap-4 ${aiOpen ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"}`}>
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <section className="grid gap-3 lg:grid-cols-5">
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

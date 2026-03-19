import { Fragment } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

const COLUMN_ACCENT_COLORS = [
  "#94a3b8", // Backlog: slate
  "#209dd7", // Discovery: blue
  "#f59e0b", // In Progress: amber
  "#753991", // Review: purple
  "#22c55e", // Done: green
];

type KanbanColumnProps = {
  column: Column;
  columnIndex: number;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  overCardId?: string | null;
};

export const KanbanColumn = ({
  column,
  columnIndex,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  overCardId,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const accentColor = COLUMN_ACCENT_COLORS[columnIndex] ?? "#94a3b8";

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[calc(100vh-120px)] flex-col rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[var(--shadow)] transition overflow-hidden",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      {/* Colored top accent bar */}
      <div className="h-1 w-full flex-shrink-0" style={{ backgroundColor: accentColor }} />

      <div className="flex flex-col flex-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
            <input
              value={column.title}
              onChange={(event) => onRename(column.id, event.target.value)}
              className="min-w-0 flex-1 bg-transparent font-display text-sm font-semibold text-[var(--navy-dark)] outline-none"
              aria-label="Column title"
            />
          </div>
          <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums text-white" style={{ backgroundColor: accentColor }}>
            {cards.length}
          </span>
        </div>

        <div className="mt-3 flex flex-1 flex-col gap-2">
          <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <Fragment key={card.id}>
                {overCardId === card.id && (
                  <div className="mx-1 h-0.5 rounded-full bg-[var(--primary-blue)] shadow-[0_0_6px_rgba(32,157,215,0.6)]" />
                )}
                <KanbanCard
                  card={card}
                  onDelete={(cardId) => onDeleteCard(column.id, cardId)}
                  accentColor={accentColor}
                />
              </Fragment>
            ))}
          </SortableContext>
          {cards.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Drop a card here
            </div>
          )}
        </div>

        <NewCardForm
          onAdd={(title, details) => onAddCard(column.id, title, details)}
          accentColor={accentColor}
        />
      </div>
    </section>
  );
};

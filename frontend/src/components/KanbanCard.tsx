import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  accentColor?: string;
};

export const KanbanCard = ({ card, onDelete, accentColor }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 shadow-[0_2px_8px_rgba(3,33,71,0.06)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {/* Colored left border accent */}
      {accentColor && (
        <div
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-[var(--gray-text)] opacity-0 pointer-events-none transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 group-hover:pointer-events-auto"
        aria-label={`Delete ${card.title}`}
      >
        {/* Trash icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
        </svg>
      </button>
      <div className="min-w-0 pl-2 pr-5">
        <h4 className="font-display text-sm font-semibold text-[var(--navy-dark)]">
          {card.title}
        </h4>
        {card.details && card.details !== "No details yet." && (
          <p className="mt-1 text-xs leading-5 text-[var(--gray-text)]">
            {card.details}
          </p>
        )}
      </div>
    </article>
  );
};

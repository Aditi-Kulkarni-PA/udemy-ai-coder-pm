"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createBoard, deleteBoard, fetchBoards, type BoardInfo } from "@/lib/api";

type BoardSelectorProps = {
  username: string;
  activeBoardId: number | null;
  onSelectBoard: (boardId: number) => void;
};

export const BoardSelector = ({ username, activeBoardId, onSelectBoard }: BoardSelectorProps) => {
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newBoardName, setNewBoardName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const loadBoards = async () => {
    try {
      const list = await fetchBoards(username);
      setBoards(list);
      // Auto-select the first board if none is selected
      if (activeBoardId === null && list.length > 0) {
        onSelectBoard(list[0].id);
      }
    } catch {
      setError("Failed to load boards.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newBoardName.trim();
    if (!name) return;
    setIsCreating(true);
    setError("");
    try {
      const boardId = await createBoard(username, name);
      setNewBoardName("");
      setShowForm(false);
      const list = await fetchBoards(username);
      setBoards(list);
      onSelectBoard(boardId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create board.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (boardId: number) => {
    if (boards.length <= 1) return;
    if (!confirm("Delete this board and all its cards?")) return;
    try {
      await deleteBoard(username, boardId);
      const list = await fetchBoards(username);
      setBoards(list);
      if (activeBoardId === boardId && list.length > 0) {
        onSelectBoard(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete board.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-10 items-center gap-2 text-xs text-[var(--gray-text)]">
        Loading boards...
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {boards.map((board) => (
        <div key={board.id} className="group relative flex items-center">
          <button
            type="button"
            onClick={() => onSelectBoard(board.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              board.id === activeBoardId
                ? "bg-[var(--navy-dark)] text-white"
                : "border border-[var(--stroke)] bg-white text-[var(--gray-text)] hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
            }`}
          >
            {board.name}
          </button>
          {boards.length > 1 ? (
            <button
              type="button"
              onClick={() => void handleDelete(board.id)}
              aria-label={`Delete board ${board.name}`}
              title="Delete board"
              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white group-hover:flex"
            >
              ×
            </button>
          ) : null}
        </div>
      ))}

      {showForm ? (
        <form onSubmit={(e) => void handleCreate(e)} className="flex items-center gap-1">
          <input
            autoFocus
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            placeholder="Board name"
            maxLength={100}
            className="rounded-lg border border-[var(--stroke)] px-2 py-1 text-xs text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            disabled={isCreating || !newBoardName.trim()}
            className="rounded-lg bg-[var(--primary-blue)] px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            {isCreating ? "…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setNewBoardName(""); }}
            className="rounded-lg border border-[var(--stroke)] px-2 py-1 text-xs text-[var(--gray-text)]"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          title="New board"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-[var(--stroke)] text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
        </button>
      )}

      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : null}
    </div>
  );
};

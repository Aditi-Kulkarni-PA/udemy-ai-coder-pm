import type { BoardData } from "@/lib/kanban";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChatResult = {
  assistantMessage: string;
  boardUpdated: boolean;
  board: BoardData;
};

export type BoardInfo = {
  id: number;
  name: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// All fetch calls go through this helper with a 15-second timeout.
const fetchWithTimeout = (url: string, options: RequestInit = {}, ms = 15000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  const externalSignal = options.signal as AbortSignal | undefined;
  if (externalSignal?.aborted) {
    controller.abort();
  } else if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId)
  );
};

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let detail = "";
    try {
      const parsed = (await response.json()) as { detail?: string };
      detail = parsed.detail ?? "";
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginUser = async (username: string, password: string): Promise<string> => {
  const response = await fetchWithTimeout("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJson<{ status: string; username: string }>(response);
  return data.username;
};

export const registerUser = async (username: string, password: string): Promise<string> => {
  const response = await fetchWithTimeout("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJson<{ status: string; username: string }>(response);
  return data.username;
};

// ---------------------------------------------------------------------------
// Board list management
// ---------------------------------------------------------------------------

export const fetchBoards = async (username: string): Promise<BoardInfo[]> => {
  const response = await fetchWithTimeout(`/api/boards/${encodeURIComponent(username)}`);
  const data = await parseJson<{ boards: BoardInfo[] }>(response);
  return data.boards;
};

export const createBoard = async (username: string, name: string): Promise<number> => {
  const response = await fetchWithTimeout(`/api/boards/${encodeURIComponent(username)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await parseJson<{ status: string; board_id: number }>(response);
  return data.board_id;
};

export const deleteBoard = async (username: string, boardId: number): Promise<void> => {
  const response = await fetchWithTimeout(
    `/api/boards/${encodeURIComponent(username)}/${boardId}`,
    { method: "DELETE" }
  );
  await parseJson<{ status: string }>(response);
};

// ---------------------------------------------------------------------------
// Board data (per-board)
// ---------------------------------------------------------------------------

export const fetchBoardData = async (username: string, boardId: number, signal?: AbortSignal): Promise<BoardData> => {
  const response = await fetchWithTimeout(
    `/api/boards/${encodeURIComponent(username)}/${boardId}/data`,
    signal ? { signal } : {}
  );
  const data = await parseJson<{ board: BoardData }>(response);
  return data.board;
};

export const saveBoardData = async (username: string, boardId: number, board: BoardData): Promise<void> => {
  const response = await fetchWithTimeout(
    `/api/boards/${encodeURIComponent(username)}/${boardId}/data`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board }),
    }
  );
  await parseJson<{ status: string }>(response);
};

// ---------------------------------------------------------------------------
// Legacy single-board endpoints (kept for backwards compatibility)
// ---------------------------------------------------------------------------

export const fetchBoard = async (username: string, signal?: AbortSignal): Promise<BoardData> => {
  const response = await fetchWithTimeout(
    `/api/board/${encodeURIComponent(username)}`,
    signal ? { signal } : {}
  );
  const data = await parseJson<{ board: BoardData }>(response);
  return data.board;
};

export const saveBoard = async (username: string, board: BoardData): Promise<void> => {
  const response = await fetchWithTimeout(`/api/board/${encodeURIComponent(username)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board }),
  });
  await parseJson<{ status: string }>(response);
};

// ---------------------------------------------------------------------------
// AI chat
// ---------------------------------------------------------------------------

export const sendAIChat = async (
  username: string,
  question: string,
  history: ChatMessage[],
  boardId?: number
): Promise<AIChatResult> => {
  const response = await fetchWithTimeout(`/api/ai/chat/${encodeURIComponent(username)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history, board_id: boardId ?? null }),
  });
  return parseJson<AIChatResult>(response);
};

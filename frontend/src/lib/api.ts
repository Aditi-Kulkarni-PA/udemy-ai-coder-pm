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

// H5: All fetch calls go through this helper with a 15-second timeout.
// If an external AbortSignal is provided via options.signal, either signal can cancel the request.
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

export const sendAIChat = async (
  username: string,
  question: string,
  history: ChatMessage[]
): Promise<AIChatResult> => {
  const response = await fetchWithTimeout(`/api/ai/chat/${encodeURIComponent(username)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  return parseJson<AIChatResult>(response);
};

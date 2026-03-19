"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendAIChat, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const MAX_HISTORY = 10;

type AIChatSidebarProps = {
  username: string;
  boardId?: number;
  onBoardUpdate: (board: BoardData) => void;
  onClose?: () => void;
};

export const AIChatSidebar = ({ username, boardId, onBoardUpdate, onClose }: AIChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  // Ref to the scrollable messages container (not the end sentinel)
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const storageKey = boardId != null ? `pm-chat-${username}-${boardId}` : `pm-chat-${username}`;

  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        setMessages(JSON.parse(stored) as ChatMessage[]);
      } catch {
        // Ignore corrupt storage
      }
    } else {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey]);

  // Scroll the messages CONTAINER (not the window) when messages change
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || isSending) return;

    setInput("");
    setError("");
    const prevMessages = messages;
    setMessages([...prevMessages, { role: "user" as const, content: question }]);
    setIsSending(true);

    try {
      const result = await sendAIChat(username, question, prevMessages.slice(-MAX_HISTORY), boardId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.assistantMessage },
      ]);
      if (result.boardUpdated) {
        onBoardUpdate(result.board);
      }
    } catch (err) {
      setMessages(prevMessages);
      const message = err instanceof Error ? err.message : "AI request failed. Please try again.";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex flex-col overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white/90 shadow-[var(--shadow)] backdrop-blur">
      {/* Purple top accent */}
      <div className="h-1 w-full flex-shrink-0 bg-[var(--secondary-purple)]" />

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--secondary-purple)]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" className="h-4 w-4">
                <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm-.75 4.25a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5ZM8 10.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--navy-dark)]">AI Assistant</h2>
              <p className="text-xs text-[var(--gray-text)]">Ask to update the board</p>
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI assistant"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--gray-text)] transition hover:bg-[var(--stroke)] hover:text-[var(--navy-dark)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          ) : null}
        </div>

        {/* Message list — the container itself scrolls, not the window */}
        <div
          ref={messagesContainerRef}
          className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface)] p-2"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-8 w-8 text-[var(--stroke)]">
                <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v3.52c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-[var(--gray-text)]">Ask me anything about your board!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-lg px-2.5 py-2 text-xs ${
                    message.role === "user"
                      ? "ml-4 border border-[var(--stroke)] bg-white"
                      : "mr-4 border border-[var(--secondary-purple)]/20 bg-[var(--secondary-purple)]/5"
                  }`}
                >
                  <p className={`mb-1 font-semibold uppercase tracking-[0.12em] ${
                    message.role === "user" ? "text-[var(--gray-text)]" : "text-[var(--secondary-purple)]"
                  }`}>
                    {message.role === "user" ? "You" : "AI"}
                  </p>
                  <p className="whitespace-pre-wrap leading-5 text-[var(--navy-dark)]">{message.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="mt-2 flex-shrink-0 text-xs text-red-500">{error}</p> : null}

        {/* Input form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 flex-shrink-0 space-y-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
            placeholder="Ask AI to update the board..."
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--secondary-purple)]"
          />
          <button
            type="submit"
            disabled={isSending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {isSending ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 animate-spin">
                  <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
                </svg>
                Thinking...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M2.87 2.298a.75.75 0 0 0-.812 1.021L3.39 6.624a1 1 0 0 0 .928.626H8.25a.75.75 0 0 1 0 1.5H4.318a1 1 0 0 0-.927.626l-1.333 3.305a.75.75 0 0 0 .812 1.021 24.194 24.194 0 0 0 11.367-5.126.75.75 0 0 0 0-1.196A24.194 24.194 0 0 0 2.869 2.298Z" />
                </svg>
                Send
              </>
            )}
          </button>
        </form>
      </div>
    </aside>
  );
};

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendAIChat, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const MAX_HISTORY = 10;

type AIChatSidebarProps = {
  username: string;
  onBoardUpdate: (board: BoardData) => void;
  onClose?: () => void;
};

export const AIChatSidebar = ({ username, onBoardUpdate, onClose }: AIChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(`pm-chat-${username}`);
    if (stored) {
      try {
        setMessages(JSON.parse(stored) as ChatMessage[]);
      } catch {
        // Ignore corrupt storage
      }
    }
  }, [username]);

  useEffect(() => {
    sessionStorage.setItem(`pm-chat-${username}`, JSON.stringify(messages));
  }, [messages, username]);

  useEffect(() => {
    const el = messagesEndRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth" });
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
      const result = await sendAIChat(username, question, prevMessages.slice(-MAX_HISTORY));
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
    <aside className="flex flex-col rounded-3xl border border-[var(--stroke)] bg-white/90 p-3 shadow-[var(--shadow)] backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">AI Assistant</h2>
          <p className="text-xs text-[var(--gray-text)]">Ask to update the board.</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Minimize AI assistant"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-[var(--stroke)] hover:text-[var(--navy-dark)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Message list */}
      <div className="mt-3 flex-1 overflow-y-auto rounded-2xl border border-[var(--stroke)] bg-white p-2" style={{ minHeight: 0, height: "320px" }}>
        {messages.length === 0 ? (
          <p className="p-2 text-xs text-[var(--gray-text)]">No messages yet. Ask me anything about your board!</p>
        ) : (
          <div className="space-y-2">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-xl px-2.5 py-1.5 text-xs ${
                  message.role === "user"
                    ? "border border-[var(--stroke)] bg-[var(--surface)]"
                    : "border border-[var(--primary-blue)]/20 bg-[var(--primary-blue)]/5"
                }`}
              >
                <p className={`font-semibold uppercase tracking-[0.12em] ${
                  message.role === "user" ? "text-[var(--gray-text)]" : "text-[var(--primary-blue)]"
                }`}>
                  {message.role === "user" ? "You" : "AI"}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap leading-5 text-[var(--navy-dark)]">{message.content}</p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-[var(--secondary-purple)]">{error}</p> : null}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="mt-2 space-y-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={2}
          placeholder="Ask AI to update the board..."
          className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isSending}
          className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </aside>
  );
};

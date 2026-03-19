"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  readAuthState,
  readAuthUsername,
  validateCredentials,
  writeAuthState,
  writeAuthUsername,
} from "@/lib/auth";

export const AuthGate = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsAuthenticated(readAuthState());
    setUsername(readAuthUsername());
    setIsReady(true);
  }, []);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateCredentials(username.trim(), password)) {
      setError("Invalid credentials. Use user / password.");
      return;
    }

    writeAuthState(true);
    writeAuthUsername(username.trim());
    setError("");
    setPassword("");
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    writeAuthState(false);
    setUsername("");
    setPassword("");
    setError("");
    setIsAuthenticated(false);
  };

  if (!isReady) {
    return null;
  }

  if (isAuthenticated) {
    return <KanbanBoard username={username || "user"} onLogout={handleLogout} />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[460px] items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Sign In
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          Use the demo account to access your board.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <p className="text-sm font-medium text-[var(--secondary-purple)]">{error}</p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
};

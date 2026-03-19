"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { loginUser, registerUser } from "@/lib/api";
import {
  readAuthState,
  readAuthUsername,
  writeAuthState,
  writeAuthUsername,
} from "@/lib/auth";

type Mode = "login" | "register";

export const AuthGate = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("login");

  useEffect(() => {
    setIsAuthenticated(readAuthState());
    setUsername(readAuthUsername());
    setIsReady(true);
  }, []);

  const resetForm = () => {
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetForm();
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const loggedInUsername = await loginUser(username.trim(), password);
      writeAuthState(true);
      writeAuthUsername(loggedInUsername);
      setPassword("");
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const registeredUsername = await registerUser(username.trim(), password);
      writeAuthState(true);
      writeAuthUsername(registeredUsername);
      setPassword("");
      setConfirmPassword("");
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    writeAuthState(false);
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setIsAuthenticated(false);
  };

  if (!isReady) return null;

  if (isAuthenticated) {
    return <KanbanBoard username={username || "user"} onLogout={handleLogout} />;
  }

  const isLogin = mode === "login";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[460px] items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          {isLogin ? "Sign In" : "Create Account"}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          {isLogin
            ? "Sign in to access your boards."
            : "Create a new account to get started."}
        </p>

        {/* Mode switcher */}
        <div className="mt-6 flex rounded-xl border border-[var(--stroke)] p-1">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              isLogin
                ? "bg-[var(--navy-dark)] text-white"
                : "text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              !isLogin
                ? "bg-[var(--navy-dark)] text-white"
                : "text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            }`}
          >
            Register
          </button>
        </div>

        <form
          onSubmit={(e) => void (isLogin ? handleLogin(e) : handleRegister(e))}
          className="mt-6 space-y-4"
        >
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
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              autoComplete="username"
              required
              minLength={1}
              maxLength={64}
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
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? 1 : 6}
            />
          </div>

          {!isLogin ? (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
          ) : null}

          {error ? (
            <p className="text-sm font-medium text-[var(--secondary-purple)]">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {isSubmitting
              ? isLogin ? "Signing in…" : "Creating account…"
              : isLogin ? "Sign in" : "Create account"}
          </button>
        </form>

        {isLogin ? (
          <p className="mt-4 text-center text-xs text-[var(--gray-text)]">
            Demo account: <span className="font-mono font-semibold text-[var(--navy-dark)]">user / password</span>
          </p>
        ) : null}
      </section>
    </main>
  );
};

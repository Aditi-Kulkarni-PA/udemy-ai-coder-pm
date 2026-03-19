import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AuthGate } from "@/components/AuthGate";
import { initialData } from "@/lib/kanban";

// Mock all API + BoardSelector so tests don't need a real server
vi.mock("@/lib/api", () => ({
  loginUser: vi.fn(async (username: string, password: string) => {
    if (username === "user" && password === "password") return "user";
    throw new Error("Invalid credentials");
  }),
  registerUser: vi.fn(async (username: string, _password: string) => username),
  fetchBoards: vi.fn(async () => [{ id: 1, name: "Kanban Board", created_at: "" }]),
  fetchBoardData: vi.fn(async () => initialData),
  saveBoardData: vi.fn(async () => undefined),
  createBoard: vi.fn(async () => 2),
  deleteBoard: vi.fn(async () => undefined),
  sendAIChat: vi.fn(async () => ({ assistantMessage: "Done", boardUpdated: false, board: initialData })),
}));

describe("AuthGate", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("shows login form first", () => {
    render(<AuthGate />);
    expect(screen.getByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
    // There's a "Sign In" button (submit) and a "Sign In" tab — both present
    expect(screen.getAllByRole("button", { name: /sign in/i }).length).toBeGreaterThan(0);
  });

  it("shows error on invalid credentials", async () => {
    render(<AuthGate />);

    await userEvent.type(screen.getByLabelText(/^username/i), "user");
    await userEvent.type(screen.getByLabelText(/^password$/i), "wrong");
    // Click the submit button (last "Sign in" button on page)
    const submitBtn = screen.getAllByRole("button", { name: /sign in/i }).at(-1)!;
    await userEvent.click(submitBtn);

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it("logs in and stores session", async () => {
    render(<AuthGate />);

    await userEvent.type(screen.getByLabelText(/^username/i), "user");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password");
    const submitBtn = screen.getAllByRole("button", { name: /sign in/i }).at(-1)!;
    await userEvent.click(submitBtn);

    expect(window.sessionStorage.getItem("pm-authenticated")).toBe("true");
    expect(window.sessionStorage.getItem("pm-username")).toBe("user");
  });

  it("switches to register mode", async () => {
    render(<AuthGate />);
    await userEvent.click(screen.getByRole("button", { name: /^register$/i }));
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("shows password mismatch error on registration", async () => {
    render(<AuthGate />);
    await userEvent.click(screen.getByRole("button", { name: /^register$/i }));

    await userEvent.type(screen.getByLabelText(/^username/i), "newuser");
    await userEvent.type(screen.getByLabelText(/^password$/i), "secret1");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "secret2");

    const submitBtn = screen.getByRole("button", { name: /create account/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });
});

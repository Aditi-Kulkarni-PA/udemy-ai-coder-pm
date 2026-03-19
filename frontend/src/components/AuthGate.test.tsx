import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";

describe("AuthGate", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("shows login first and blocks board until auth", () => {
    render(<AuthGate />);

    expect(screen.getByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/single board kanban/i)).not.toBeInTheDocument();
  });

  it("shows error on invalid credentials", async () => {
    render(<AuthGate />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      screen.getByText(/invalid credentials\. use user \/ password\./i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/single board kanban/i)).not.toBeInTheDocument();
  });

  it("logs in and logs out", async () => {
    render(<AuthGate />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/single board kanban/i)).toBeInTheDocument();
    expect(window.sessionStorage.getItem("pm-authenticated")).toBe("true");
    expect(window.sessionStorage.getItem("pm-username")).toBe("user");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/single board kanban/i)).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("pm-authenticated")).toBeNull();
    expect(window.sessionStorage.getItem("pm-username")).toBeNull();
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  fetchBoards: vi.fn(async () => [{ id: 1, name: "Kanban Board", created_at: "" }]),
  fetchBoardData: vi.fn(async () => initialData),
  saveBoardData: vi.fn(async () => undefined),
  createBoard: vi.fn(async () => 2),
  deleteBoard: vi.fn(async () => undefined),
  sendAIChat: vi.fn(async () => ({
    assistantMessage: "Done",
    boardUpdated: false,
    board: initialData,
  })),
  // Keep legacy exports intact
  fetchBoard: vi.fn(async () => initialData),
  saveBoard: vi.fn(async () => undefined),
}));

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", async () => {
    render(<KanbanBoard username="user" />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard username="user" />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard username="user" />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", { name: /add a card/i });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", { name: /delete new card/i });
    await userEvent.click(deleteButton);
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("shows board selector", async () => {
    render(<KanbanBoard username="user" />);
    // BoardSelector renders the board name as a button
    expect(await screen.findByRole("button", { name: /kanban board/i })).toBeInTheDocument();
  });
});

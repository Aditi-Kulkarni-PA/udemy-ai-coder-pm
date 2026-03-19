import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { BoardSelector } from "@/components/BoardSelector";

const fetchBoardsMock = vi.fn();
const createBoardMock = vi.fn();
const deleteBoardMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchBoards: (...args: unknown[]) => fetchBoardsMock(...args),
  createBoard: (...args: unknown[]) => createBoardMock(...args),
  deleteBoard: (...args: unknown[]) => deleteBoardMock(...args),
}));

const defaultBoards = [
  { id: 1, name: "Kanban Board", created_at: "" },
  { id: 2, name: "Sprint 1", created_at: "" },
];

describe("BoardSelector", () => {
  beforeEach(() => {
    fetchBoardsMock.mockReset();
    createBoardMock.mockReset();
    deleteBoardMock.mockReset();
  });

  it("renders boards as buttons", async () => {
    fetchBoardsMock.mockResolvedValue(defaultBoards);
    render(
      <BoardSelector username="user" activeBoardId={1} onSelectBoard={vi.fn()} />
    );
    expect(await screen.findByRole("button", { name: "Kanban Board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprint 1" })).toBeInTheDocument();
  });

  it("calls onSelectBoard when a board is clicked", async () => {
    fetchBoardsMock.mockResolvedValue(defaultBoards);
    const onSelect = vi.fn();
    render(<BoardSelector username="user" activeBoardId={1} onSelectBoard={onSelect} />);
    await screen.findByRole("button", { name: "Sprint 1" });
    await userEvent.click(screen.getByRole("button", { name: "Sprint 1" }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("shows new board form and creates a board", async () => {
    fetchBoardsMock
      .mockResolvedValueOnce(defaultBoards)
      .mockResolvedValue([...defaultBoards, { id: 3, name: "New Board", created_at: "" }]);
    createBoardMock.mockResolvedValue(3);

    const onSelect = vi.fn();
    render(<BoardSelector username="user" activeBoardId={1} onSelectBoard={onSelect} />);
    await screen.findByRole("button", { name: "Kanban Board" });

    // Click the + button
    await userEvent.click(screen.getByTitle("New board"));
    expect(screen.getByPlaceholderText("Board name")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Board name"), "New Board");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(createBoardMock).toHaveBeenCalledWith("user", "New Board"));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("auto-selects first board when activeBoardId is null", async () => {
    fetchBoardsMock.mockResolvedValue([{ id: 1, name: "Kanban Board", created_at: "" }]);
    const onSelect = vi.fn();
    render(<BoardSelector username="user" activeBoardId={null} onSelectBoard={onSelect} />);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(1));
  });
});

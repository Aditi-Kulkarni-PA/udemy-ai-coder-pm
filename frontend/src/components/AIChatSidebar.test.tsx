import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { initialData } from "@/lib/kanban";

const sendAIChatMock = vi.fn();

vi.mock("@/lib/api", () => ({
  sendAIChat: (...args: unknown[]) => sendAIChatMock(...args),
}));

describe("AIChatSidebar", () => {
  beforeEach(() => {
    sendAIChatMock.mockReset();
  });

  it("sends message and applies board update", async () => {
    const onBoardUpdate = vi.fn();
    sendAIChatMock.mockResolvedValue({
      assistantMessage: "Moved card",
      boardUpdated: true,
      board: initialData,
    });

    render(<AIChatSidebar username="user" onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(
      screen.getByPlaceholderText(/ask ai to update the board/i),
      "Move card-1 to review"
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(sendAIChatMock).toHaveBeenCalled();
    expect(await screen.findByText("Moved card")).toBeInTheDocument();
    expect(onBoardUpdate).toHaveBeenCalledWith(initialData);
  });
});

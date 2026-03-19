import { expect, test } from "@playwright/test";

const login = async (page: import("@playwright/test").Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
};

test("shows an error for invalid login", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByText(/invalid credentials\. use user \/ password\./i)).toBeVisible();
  await expect(page.getByText("Single Board Kanban")).not.toBeVisible();
});

test("loads the kanban board after login", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  await login(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  // Target card-6, the existing card in Review, for a reliable drop position
  const targetCard = page.getByTestId("card-card-6");
  const cardBox = await card.boundingBox();
  const targetCardBox = await targetCard.boundingBox();
  if (!cardBox || !targetCardBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetCardBox.x + targetCardBox.width / 2,
    targetCardBox.y + targetCardBox.height / 2,
    { steps: 20 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("applies AI board updates from sidebar", async ({ page }) => {
  await page.goto("/");
  await login(page);

  // Open the AI sidebar (it starts minimized)
  await page.getByRole("button", { name: /ai assistant/i }).click();

  await page.route("**/api/ai/chat/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assistantMessage: "Updated via AI",
        boardUpdated: true,
        board: {
          columns: [
            { id: "col-backlog", title: "Backlog", cardIds: [] },
            { id: "col-discovery", title: "Discovery", cardIds: [] },
            { id: "col-progress", title: "In Progress", cardIds: [] },
            { id: "col-review", title: "Review", cardIds: ["card-1"] },
            { id: "col-done", title: "Done", cardIds: [] },
          ],
          cards: {
            "card-1": {
              id: "card-1",
              title: "Moved by AI",
              details: "AI change",
            },
          },
        },
      }),
    });
  });

  await page
    .getByPlaceholder("Ask AI to update the board...")
    .fill("Move card-1 to review and rename it");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText("Updated via AI")).toBeVisible();
  await expect(page.getByText("Moved by AI")).toBeVisible();
});

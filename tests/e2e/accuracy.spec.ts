import { test, expect } from "./fixtures.js";

// A fresh demo session has no resolved markets, so its accuracy is empty.
// Other specs share this server, so the board itself may or may not be empty.

test("the portfolio Accuracy card explains the score and starts empty", async ({
  page,
}) => {
  await page.goto("/portfolio");
  const card = page.getByRole("region", { name: "Accuracy" });
  await expect(card).toContainText("0 is perfect");
  await expect(card).toContainText("always saying 50% scores 0.25");
  await expect(card).toContainText(
    "Your accuracy appears once one of your markets resolves YES or NO.",
  );
  await expect(card.getByRole("img")).toHaveCount(0);
});

test("the leaderboard has a Most accurate board ranked by Brier score", async ({
  page,
}) => {
  await page.goto("/leaderboard");
  const tab = page.getByRole("button", { name: "Most accurate" });
  await expect(tab).toHaveAttribute("aria-pressed", "false");
  await tab.click();
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("heading", { name: "No forecasters yet" })
      .or(page.locator(".rank-list")),
  ).toBeVisible();
  await expect(page.locator(".fine-print")).toContainText(
    "at least 3 markets resolved YES or NO by Brier score",
  );
  await expect(page.locator(".rank-you")).toHaveCount(0);
});

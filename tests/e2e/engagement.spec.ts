import { randomUUID } from "node:crypto";
import { test, expect, api, mockApi, type Page, expectAllMarkets } from "./fixtures.js";
import { choose } from "./select.js";

// These journeys never create markets. The one real trade below moves a seeded
// market's price and volume; the specs that check order read the API at runtime.

/** The page's own demo session; call once the app has rendered loaded data. */
const demoToken = (page: Page) =>
  page.evaluate(() => localStorage.getItem("peakcast.token.v1") ?? "");

test("the daily bonus credits 50 once and stays claimed", async ({ page }) => {
  await page.goto("/portfolio");
  const card = page.getByRole("region", { name: "Daily bonus" });
  const balance = page.locator(".balance-button");
  await expect(balance).toContainText("5,000.00");
  await card.getByRole("button", { name: "Claim 50 credits" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Daily bonus: +50 credits",
  );
  await expect(balance).toContainText("5,050.00");
  await expect(card).toContainText("Come back tomorrow for 60 credits");
  await expect(card).toContainText("1-day streak");
  await expect(card.getByRole("button")).toHaveCount(0);
  await page.reload();
  await expect(card).toContainText("Come back tomorrow for 60 credits");
  await expect(balance).toContainText("5,050.00");
});

test("a bonus already claimed elsewhere shows the claimed state, not an error", async ({
  page,
}) => {
  await page.goto("/portfolio");
  const card = page.getByRole("region", { name: "Daily bonus" });
  const claim = card.getByRole("button", { name: "Claim 50 credits" });
  await expect(claim).toBeVisible();
  const elsewhere = await api(page, "/bonus/claim", {
    method: "POST",
    token: await demoToken(page),
  });
  expect(elsewhere.ok).toBeTruthy();
  await claim.click();
  await expect(card).toContainText("Come back tomorrow for 60 credits");
  await expect(card.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".balance-button")).toContainText("5,050.00");
});

test("the trading record counts the account's trades", async ({ page }) => {
  await page.goto("/portfolio");
  const record = page.getByRole("region", { name: "Trading record" });
  await expect(record.locator(".stat-trades strong")).toHaveText("0");
  await expect(record.locator(".stat-win-rate strong")).toHaveText("—");
  const order = {
    marketId: "fed-rate",
    outcome: "YES",
    action: "buy",
    shares: 10,
  };
  const quote = (
    await api<{ amountMicros: number }>(page, "/quotes", { data: order })
  ).body;
  const fill = await api(page, "/trades", {
    token: await demoToken(page),
    headers: { "Idempotency-Key": randomUUID() },
    data: { ...order, limitMicros: quote.amountMicros },
  });
  expect(fill.status).toBe(201);
  await page.reload();
  await expect(record.locator(".stat-trades strong")).toHaveText("1");
  await expect(record.locator(".stat-volume strong")).not.toHaveText("0.00");
  await expect(record.locator(".stat-win-rate")).toContainText(
    "No resolved markets yet",
  );
});

test("the inbox starts empty and Escape returns focus to the bell", async ({
  page,
}) => {
  await page.goto("/markets");
  await expect(page.locator(".market-card").first()).toBeVisible();
  const bell = page.getByRole("button", { name: "Notifications", exact: true });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(
    panel.getByRole("heading", { name: "You're all caught up." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
});

test("a server-cancelled order raises the badge, is listed and opens its market", async ({
  page,
}) => {
  await page.goto("/markets");
  await expect(page.locator(".market-card").first()).toBeVisible();
  // Selling shares the account does not hold is cancelled at once.
  const order = await api<{ status: string }>(page, "/orders", {
    token: await demoToken(page),
    data: {
      marketId: "fed-rate",
      outcome: "YES",
      action: "sell",
      shares: 5,
      limitPrice: 0.01,
    },
  });
  expect(order.body.status).toBe("cancelled");
  await page.reload();
  const bell = page.getByRole("button", { name: "Notifications, 1 unread" });
  await expect(bell).toBeVisible();
  await expect(page.locator(".notification-badge")).toHaveText("1");
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  const item = panel.getByRole("button", { name: /was cancelled/ });
  await expect(item).toBeVisible();
  await expect(panel).toContainText("1 new");
  // Opening marks everything read.
  await expect(page.locator(".notification-badge")).toHaveCount(0);
  await item.click();
  await expect(page).toHaveURL(/\/markets\/fed-rate$/);
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(page.locator(".forecast-header")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible();
});

test("biggest movers sorts by absolute 24h change and labels each move", async ({
  page,
}) => {
  // Fixed moves keep this independent of trades made by other specs.
  const moves: Record<number, number> = {
    1: -0.03,
    4: 0.12,
    7: -0.2,
    9: 0.004,
  };
  await mockApi(page, "/api/v1/markets?", {
    transform: `const moves = ${JSON.stringify(moves)};
      body.items = body.items.map((market, index) => ({ ...market, change24h: moves[index] ?? 0 }));
      return body;`,
  });
  const served = (
    await api<{ items: { title: string }[] }>(page, "/markets")
  ).body.items.map((market, index) => ({
    title: market.title,
    change24h: moves[index] ?? 0,
  }));
  await page.goto("/markets");
  await expectAllMarkets(page);
  await choose(page, "Sort markets", "movers");
  await expect(page.locator(".market-card h3")).toHaveText(
    [...served]
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
      .map((market) => market.title),
  );
  // Under half a point (and flat) shows no chip.
  await expect(page.locator(".market-grid .change-chip")).toHaveCount(3);
  const cards = page.locator(".market-card");
  await expect(cards.nth(0).locator(".change-chip")).toHaveClass(/down/);
  await expect(cards.nth(0)).toHaveAccessibleName(
    /, down 20 points in 24 hours$/,
  );
  await expect(cards.nth(1).locator(".change-chip")).toHaveClass(/up/);
  await expect(cards.nth(1)).toHaveAccessibleName(
    /, up 12 points in 24 hours$/,
  );
  await cards.nth(1).click();
  await expect(page.locator(".forecast-header .change-chip")).toContainText(
    "Up 12 points in 24 hours",
  );
});

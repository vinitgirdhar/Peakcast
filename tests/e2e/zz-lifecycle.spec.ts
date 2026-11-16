import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { choose } from "./select.js";

// Must match OPERATOR_TOKEN in tests/e2e/server.mjs.
const OPERATOR = "e2e-operator-test-token";
const draft = {
  question: "Will the lifecycle journey resolve before 2028?",
  sourceName: "Official source",
  sourceUrl: "https://example.org/data",
  closesAt: "2028-01-01T00:00:00.000Z",
  yesRule:
    "The official source publishes a qualifying measurement before the deadline.",
  noRule:
    "No qualifying measurement exists in the complete published record by the deadline.",
  invalidRule: "If the source is missing or incomplete, hold for human review.",
};

test("a launched market is proposed, disputed, ruled by the operator and ranked", async ({
  page,
  request,
}, testInfo) => {
  // ponytail: this journey adds a market to the shared in-memory server, so it
  // runs once, in the last project, after every count-sensitive spec. Give it
  // its own server if more journeys like it are added.
  test.skip(testInfo.project.name !== "mobile-webkit");
  test.setTimeout(60000);
  const session = async () =>
    (await (await request.post("/api/v1/sessions")).json()).token as string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const creator = await session();
  const trader = await session();
  const saved = await (
    await request.post("/api/v1/drafts", {
      headers: auth(creator),
      data: draft,
    })
  ).json();
  const market = await (
    await request.post(`/api/v1/drafts/${saved.id}/launch`, {
      headers: auth(creator),
      data: { category: "Science" },
    })
  ).json();
  const order = {
    marketId: market.id,
    outcome: "YES",
    action: "buy",
    shares: 20,
  };
  const quote = await (
    await request.post("/api/v1/quotes", { data: order })
  ).json();
  const fill = await request.post("/api/v1/trades", {
    headers: { ...auth(trader), "Idempotency-Key": randomUUID() },
    data: { ...order, limitMicros: quote.amountMicros },
  });
  expect(fill.status()).toBe(201);

  const openAs = async (token: string) => {
    await page.goto("/markets");
    // Wait for the app to store its own session first, or it overwrites ours.
    await expect(page.locator(".market-card").first()).toBeVisible();
    await page.evaluate(
      (value) => localStorage.setItem("wildcatter.demo.token.v1", value),
      token,
    );
    await page.goto(`/markets/${market.id}`);
  };

  await openAs(creator);
  await expect(
    page.getByRole("region", { name: "Recent trades" }),
  ).toContainText("bought 20 shares");
  // Watch, discuss and rest a limit order before the market is resolved.
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Watching", exact: true }),
  ).toBeVisible();
  // Phones start these secondary panels collapsed; this journey runs on a phone.
  await page.getByRole("button", { name: /^Discussion/ }).click();
  await page.getByLabel("Share your reasoning").fill("Source reports Friday.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("region", { name: "Discussion" })).toContainText(
    "Source reports Friday.",
  );
  await page.getByRole("button", { name: /^Limit order/ }).click();
  await page.getByLabel("Max price (¢)").fill("5");
  await page.getByRole("button", { name: "Place limit order" }).click();
  const orders = page.getByRole("list", { name: "Your open orders" });
  await expect(orders).toContainText("Buy 25 at 5¢");
  await orders.getByRole("button", { name: "Cancel" }).click();
  await expect(orders).toHaveCount(0);

  await page.getByLabel("Evidence link").fill("https://example.org/result");
  await page.getByRole("button", { name: "Propose outcome" }).click();
  await expect(page.getByText("Proposed outcome: YES")).toBeVisible();

  await openAs(trader);
  await page.getByRole("button", { name: /Dispute/ }).click();
  await expect(
    page.getByText("Disputed. Payouts wait for an operator ruling."),
  ).toBeVisible();

  await page.getByText("Operator ruling", { exact: true }).click();
  await choose(page, "Final outcome", "NO");
  await page.getByLabel("Operator token").fill("wrong-operator-token-value");
  await page.getByRole("button", { name: "Issue final ruling" }).click();
  await expect(page.getByText("Operator token is invalid.")).toBeVisible();
  await page.getByLabel("Operator token").fill(OPERATOR);
  await page.getByRole("button", { name: "Issue final ruling" }).click();
  await expect(page.getByText("Final outcome: NO")).toBeVisible();

  await page.goto("/leaderboard");
  await expect(
    page.getByRole("heading", { name: "Leaderboard" }),
  ).toBeVisible();
  await expect(page.locator(".rank-you")).toContainText("You");
  await page.getByRole("button", { name: "Top creators" }).click();
  await expect(page.locator(".rank-list li")).toHaveCount(1);
});

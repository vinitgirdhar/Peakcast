import { randomUUID } from "node:crypto";
import { test, expect, api } from "./fixtures.js";

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

// Two accounts share this browser's on-device data, as two people would share
// one phone. The apps have no operator, so a disputed market waits there.
test("a launched market is traded, discussed, proposed, disputed and ranked", async ({
  page,
}) => {
  test.setTimeout(60000);
  const session = async () => {
    const token = (
      await api<{ token: string }>(page, "/sessions", { method: "POST" })
    ).body.token;
    await api(page, "/account", {
      method: "PUT",
      token,
      data: { displayName: "Player", acceptTerms: true, confirmAdult: true },
    });
    return token;
  };
  const creator = await session();
  const trader = await session();
  const saved = (
    await api<{ id: string }>(page, "/drafts", { token: creator, data: draft })
  ).body;
  const market = (
    await api<{ id: string }>(page, `/drafts/${saved.id}/launch`, {
      token: creator,
      data: { category: "Science" },
    })
  ).body;
  const order = {
    marketId: market.id,
    outcome: "YES",
    action: "buy",
    shares: 20,
  };
  const quote = (
    await api<{ amountMicros: number }>(page, "/quotes", { data: order })
  ).body;
  const fill = await api(page, "/trades", {
    token: trader,
    headers: { "Idempotency-Key": randomUUID() },
    data: { ...order, limitMicros: quote.amountMicros },
  });
  expect(fill.status).toBe(201);

  const openAs = async (token: string) => {
    await page.evaluate(
      (value) => localStorage.setItem("peakcast.token.v1", value),
      token,
    );
    await page.goto(`/markets/${market.id}`);
  };

  await openAs(creator);
  // Phones start these secondary panels collapsed; open them when they are.
  const open = async (name: RegExp) => {
    const toggle = page.getByRole("button", { name });
    if ((await toggle.getAttribute("aria-expanded")) === "false")
      await toggle.click();
  };
  await expect(
    page.getByRole("region", { name: "Recent trades" }),
  ).toContainText("bought 20 shares");
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Watching", exact: true }),
  ).toBeVisible();
  await open(/^Discussion/);
  await page.getByLabel("Share your reasoning").fill("Source reports Friday.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("region", { name: "Discussion" })).toContainText(
    "Source reports Friday.",
  );
  await open(/^Limit order/);
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

  await page.goto("/leaderboard");
  await expect(
    page.getByRole("heading", { name: "Leaderboard" }),
  ).toBeVisible();
  await expect(page.locator(".rank-you")).toContainText("You");
  // The sample players created markets too; this journey adds one creator.
  await page.getByRole("button", { name: "Top creators" }).click();
  await expect(
    page.locator(".rank-list li").filter({ hasText: "Player" }),
  ).toHaveCount(1);
});

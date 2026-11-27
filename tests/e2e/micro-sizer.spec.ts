import AxeBuilder from "@axe-core/playwright";
import { test, expect, api, mockApi, type Page } from "./fixtures.js";
import { choose } from "./select.js";

const banner =
  "Educational tool for Peakcast practice credits. It shows a textbook formula, not a recommendation, and nothing here is financial advice.";

interface MarketRow {
  id: string;
  title: string;
  probability: number;
  status: string;
}
interface PortfolioRow {
  balanceMicros: number;
  trades: unknown[];
}

/** The live (not mid-transition) sizer page. */
const sizer = (page: Page) =>
  page.locator(".route-surface:not([inert]) .micro-sizer");

async function portfolio(page: Page): Promise<PortfolioRow> {
  const token = await page.evaluate(() =>
    localStorage.getItem("peakcast.token.v1"),
  );
  const result = await api<PortfolioRow>(page, "/portfolio", {
    token: token ?? undefined,
  });
  expect(result.ok).toBe(true);
  return result.body;
}

/** An open market whose price leaves room for a belief 10 points higher. */
async function openMarket(page: Page): Promise<MarketRow> {
  const items = (await api<{ items: MarketRow[] }>(page, "/markets")).body
    .items;
  const open = items.filter((item) => item.status === "open");
  const roomy = open.find(
    (item) => item.probability > 0.05 && item.probability < 0.85,
  );
  expect(roomy, "an open market with a mid-range price").toBeTruthy();
  return roomy as MarketRow;
}

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .include(".route-surface:not([inert]) .micro-sizer")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}

test("sizes a stake on a market and checks it with a quote without trading", async ({
  page,
}) => {
  const before = await portfolio(page);
  const market = await openMarket(page);
  await page.goto("/apps/sizer");
  const app = sizer(page);
  await expect(app.getByRole("note")).toHaveText(banner);
  await expect(app.getByLabel("Bankroll")).not.toHaveValue("");

  await choose(page, "Market", market.id);
  await expect(app.getByText("Using the crowd price now")).toBeVisible();
  await expect(app.getByLabel("YES price")).toBeHidden();
  const belief = Math.min(99, Math.round(market.probability * 100) + 10);
  await app.getByLabel("Your probability of YES").fill(String(belief));
  await app.getByRole("button", { name: "½ Kelly" }).click();
  await expect(app.getByRole("button", { name: "½ Kelly" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const result = app.getByRole("region", { name: "Kelly stake" });
  await expect(
    result.getByText(/^Buy YES: edge \d+\.\d points after fees$/),
  ).toBeVisible();
  await expect(result.locator(".sizer-stake strong")).not.toHaveText("0.00");
  await expect(result).toContainText("practice credits");
  await expect(result).toContainText("½ Kelly bets as if your belief were");
  // There is no way to trade from inside the app.
  await expect(
    app.getByRole("button", { name: /^(Buy|Sell|Trade)\b/ }),
  ).toHaveCount(0);

  await result.getByRole("button", { name: "Check with a quote" }).click();
  await expect(result.getByText("Average price, fee included")).toBeVisible();
  await expect(
    result.getByText(
      /^(The edge survives price impact: \d+\.\d points\.|Price impact eats the edge at this size; try a smaller multiplier\.)$/,
    ),
  ).toBeVisible();

  const after = await portfolio(page);
  expect(after.balanceMicros).toBe(before.balanceMicros);
  expect(after.trades.length).toBe(before.trades.length);

  await app.getByRole("button", { name: "Open market" }).click();
  await expect(page).toHaveURL(new RegExp(`/markets/${market.id}$`));
});

test("manual mode shows no edge, field errors and remembers the multiplier", async ({
  page,
}) => {
  await page.goto("/apps/sizer");
  await page.evaluate(() =>
    localStorage.setItem("peakcast.micro.sizer.v1", "{not json"),
  );
  await page.reload();
  const app = sizer(page);
  // Corrupt storage falls back to quarter Kelly.
  await expect(app.getByRole("button", { name: "¼ Kelly" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const result = app.getByRole("region", { name: "Kelly stake" });
  await app.getByLabel("YES price").fill("50");
  await app.getByLabel("Bankroll").fill("1000");
  await app.getByLabel("Your probability of YES").fill("50");
  await expect(result).toContainText(
    "No edge at this price. Your belief matches the market, so Kelly stakes 0.",
  );
  await app.getByLabel("Your probability of YES").fill("30");
  await expect(result.getByText(/^Buy NO: edge 20\.0 points/)).toBeVisible();
  await app.getByRole("button", { name: "Full Kelly" }).click();
  // Full Kelly on NO at 50¢ with belief 70%: 40% of 1,000 credits.
  await expect(result.locator(".sizer-stake strong")).toHaveText("400.00");

  const belief = app.getByLabel("Your probability of YES");
  await belief.fill("150");
  await belief.press("Enter");
  await expect(app.getByRole("alert")).toHaveText(
    "Give your probability as a whole percent from 1 to 99.",
  );
  await expect(belief).toHaveAttribute("aria-invalid", "true");
  await expect(result).toContainText("Fix the highlighted fields.");
  // The next edit ends the submit moment: errors stay, alerts do not.
  await belief.fill("1500");
  await expect(app.getByRole("alert")).toHaveCount(0);
  await expect(belief).toHaveAttribute("aria-invalid", "true");

  // A stake bigger than one trade is capped at 10,000 shares.
  await app.getByLabel("YES price").fill("1");
  await belief.fill("99");
  await expect(result).toContainText(
    "Capped at 10,000 shares, the most one trade can buy.",
  );
  await expect(result).toContainText("Expected profit on 10,000 shares");

  await page.reload();
  await expect(
    sizer(page).getByRole("button", { name: "Full Kelly" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("peakcast.micro.sizer.v1") ?? "null"),
    ),
  ).toEqual({ version: 1, multiplier: 1 });
});

test("a failed quote is shown inline and nothing is traded", async ({
  page,
}) => {
  await mockApi(page, "/api/v1/quotes", {
    status: 409,
    json: { message: "This market is closed." },
  });
  const before = await portfolio(page);
  const market = await openMarket(page);
  await page.goto("/apps/sizer");
  const app = sizer(page);
  await choose(page, "Market", market.id);
  await app
    .getByLabel("Your probability of YES")
    .fill(String(Math.min(99, Math.round(market.probability * 100) + 10)));
  await app.getByLabel("Bankroll").fill("1000");
  await app.getByRole("button", { name: "Check with a quote" }).click();
  await expect(app.getByRole("alert")).toContainText("This market is closed.");
  await expect(app.getByRole("button", { name: "Try again" })).toBeVisible();
  expect((await portfolio(page)).balanceMicros).toBe(before.balanceMicros);
});

test("a market priced outside 1–99¢ explains itself and offers a typed price", async ({
  page,
}) => {
  const market = await openMarket(page);
  await mockApi(page, "/api/v1/markets?", {
    transform: `body.items = body.items.map((item) =>
        item.id === ${JSON.stringify(market.id)} ? { ...item, probability: 0.995 } : item);
      return body;`,
  });
  await page.goto("/apps/sizer");
  const app = sizer(page);
  await choose(page, "Market", market.id);
  await app.getByLabel("Your probability of YES").fill("60");
  const message =
    "This market's price is outside 1–99¢; enter a price yourself.";
  await expect(app.getByText(message).first()).toBeVisible();
  await expect(app.getByRole("region", { name: "Kelly stake" })).toContainText(
    message,
  );
  await app.getByRole("button", { name: "Enter a price", exact: true }).click();
  await expect(app.getByLabel("YES price")).toBeVisible();
  await expect(app.locator(".sizer-stake strong")).toBeVisible();
});

test("with no open markets the sizer still works on a typed price", async ({
  page,
}) => {
  await mockApi(page, "/api/v1/markets?", { json: { items: [] } });
  await page.goto("/apps/sizer");
  const app = sizer(page);
  await expect(
    app.getByText("No open markets right now, so enter a price yourself."),
  ).toBeVisible();
  await app.getByLabel("Your probability of YES").fill("60");
  await app.getByLabel("Bankroll").fill("5000");
  await app.getByRole("button", { name: "Full Kelly" }).click();
  await expect(app.locator(".sizer-stake strong")).toHaveText("1,000.00");
});

for (const theme of ["light", "dark"] as const)
  test(`the sizer passes axe in ${theme} mode and fits narrow phones`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("peakcast.theme", value),
      theme,
    );
    const market = await openMarket(page);
    await page.goto("/apps/sizer");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const app = sizer(page);
    await choose(page, "Market", market.id);
    await app
      .getByLabel("Your probability of YES")
      .fill(String(Math.min(99, Math.round(market.probability * 100) + 10)));
    await app.getByLabel("Bankroll").fill("1000");
    await app.getByRole("button", { name: "Check with a quote" }).click();
    await expect(app.getByText("Average price, fee included")).toBeVisible();
    await expectAxeClean(page);
    await app.getByLabel("Bankroll").fill("-5");
    await app.getByLabel("Bankroll").blur();
    await expect(
      app.getByText("Enter practice credits of 0 or more."),
    ).toBeVisible();
    await expectAxeClean(page);
    await expectNoOverflow(page, 375);
    await expectNoOverflow(page, 320);
  });

import { choose } from "./select.js";
import { test, expect } from "./fixtures.js";

test("all discovery filters, sorts and navigation controls work", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60000);
  await page.goto("/markets");
  await expect(page.locator(".market-card")).toHaveCount(6);
  const response = await page.request.get("/api/v1/markets");
  const markets = (await response.json()).items as {
    title: string;
    category: string;
    probability: number;
    volumeMicros: number;
    closesAt: string;
  }[];
  for (const category of [
    "Economy",
    "Technology",
    "Crypto",
    "Science",
    "Climate",
    "World",
  ]) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await expect(page.locator(".market-card h3")).toHaveText(
      markets
        .filter((market) => market.category === category)
        .map((market) => market.title),
    );
  }
  await page.getByRole("button", { name: "All markets", exact: true }).click();
  for (const [value, compare] of [
    [
      "probability",
      (a: (typeof markets)[number], b: (typeof markets)[number]) =>
        b.probability - a.probability,
    ],
    [
      "activity",
      (a: (typeof markets)[number], b: (typeof markets)[number]) =>
        b.volumeMicros - a.volumeMicros,
    ],
    [
      "closing",
      (a: (typeof markets)[number], b: (typeof markets)[number]) =>
        Date.parse(a.closesAt) - Date.parse(b.closesAt),
    ],
  ] as const) {
    await choose(page, "Sort markets", value);
    await expect(page.locator(".market-card h3")).toHaveText(
      [...markets]
        .sort(compare)
        .slice(0, 6)
        .map((market) => market.title),
    );
  }
  await page
    .getByRole("button", { name: "Draft a market", exact: true })
    .click();
  await expect(page.locator(".page h1")).toHaveText("Draft studio");
  await page.getByRole("button", { name: "Wildcatter home" }).click();
  await expect(page.locator(".page h1")).toHaveText("Markets");
  await page.locator(".balance-button").click();
  await expect(page.locator(".page h1")).toHaveText("Your portfolio");
  await page
    .getByRole("button", { name: "Trade activity", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No trades yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Open positions/ }).click();
  await page
    .getByRole("button", { name: "Explore markets", exact: true })
    .click();
  await page.locator(".featured-market").click();
  await expect(page.locator(".page h1")).toHaveText(markets[0].title);
  await page
    .getByRole("button", { name: "Rules & source", exact: true })
    .click();
  const source = page.locator(".rules-section a");
  await expect(source).toHaveAttribute("href", /^https:\/\//);
  const sourceUrl = await source.getAttribute("href");
  await page.context().route(sourceUrl!, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "Primary-source navigation test fixture.",
    }),
  );
  const popupPromise = page.waitForEvent("popup");
  await source.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(sourceUrl!);
  await popup.close();
  await page.getByRole("button", { name: "All markets", exact: true }).click();
  await page.getByRole("button", { name: "About this app" }).click();
  await expect(page.locator(".page h1")).toHaveText("App & integrations");
  const schema = await page.request.get("/api/v1/openapi.json");
  expect(schema.status()).toBe(200);
  expect((await schema.json()).paths["/api/v1/trades"]).toBeTruthy();
  if (!isMobile) {
    await page
      .getByRole("button", { name: "Read platform documentation" })
      .click();
    await page
      .getByRole("button", { name: "App & integrations", exact: true })
      .click();
    await expect(page.locator(".page h1")).toHaveText("App & integrations");
  }
});

test("a buy can spend the available balance without requiring an unaffordable slippage buffer", async ({
  page,
}) => {
  await page.route("**/api/v1/quotes", (route) =>
    route.fulfill({
      json: {
        marketId: "fed-rate",
        outcome: "YES",
        action: "buy",
        shares: 10000,
        amountMicros: 4_999_000_000,
        averagePrice: 0.4999,
        priceAfter: 0.4999,
      },
    }),
  );
  await page.goto("/markets/fed-rate");
  await page.getByLabel("Number of shares").fill("10000");
  await expect(
    page.getByRole("button", { name: "Buy YES shares" }),
  ).toBeEnabled();
});

test("failed quotes can be refreshed directly without changing the order", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/v1/quotes", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: { message: "Temporary quote failure." },
      });
    else await route.continue();
  });
  await page.goto("/markets/fed-rate");
  await expect(page.getByText("Temporary quote failure.")).toBeVisible();
  fail = false;
  await page
    .getByRole("button", { name: "Refresh quote", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Buy YES shares" }),
  ).toBeEnabled();
});

test("NO outcome, quick share amounts, input guards and trade activity work", async ({
  page,
  isMobile,
}) => {
  await page.goto("/markets/fed-rate");
  await page.getByRole("button", { name: /^No / }).click();
  for (const quantity of [10, 25, 100, 250]) {
    await page
      .getByRole("button", { name: String(quantity), exact: true })
      .click();
    await expect(page.getByLabel("Number of shares")).toHaveValue(
      String(quantity),
    );
  }
  for (const value of ["0", "1.5", "10001"]) {
    await page.getByLabel("Number of shares").fill(value);
    await expect(page.locator(".execute-button")).toBeDisabled();
  }
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Buy NO shares" }).click();
  await expect(page.getByRole("status")).toContainText("Bought 10 NO shares");
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  const navigation = isMobile
    ? page.getByRole("navigation", { name: "Quick navigation" })
    : page.locator(".desktop-sidebar nav");
  await navigation
    .getByRole("button", { name: "Portfolio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Trade activity", exact: true })
    .click();
  await expect(page.locator(".activity-row")).toContainText(
    "Bought 10 NO shares",
  );
  await page.locator(".activity-row").click();
  await page.getByRole("button", { name: "Sell shares", exact: true }).click();
  await page.getByRole("button", { name: /^No / }).click();
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Sell NO shares" }).click();
  await expect(page.getByRole("status")).toContainText("Sold 10 NO shares");
});

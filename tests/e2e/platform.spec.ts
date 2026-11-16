import { test, expect } from "@playwright/test";

test("explore, filter, buy, reload, inspect the portfolio and sell", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/markets");
  await expect(
    page.getByRole("heading", { name: "Markets", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Crypto", exact: true }).click();
  await expect(page.locator(".market-card")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Search markets" }).fill("Bitcoin");
  await expect(page.locator(".market-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Search markets" })
    .fill("nonexistent forecast");
  await expect(
    page.getByRole("heading", { name: "No markets match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".market-card")).toHaveCount(6);
  await page.locator(".market-card").first().click();
  await page
    .getByRole("button", { name: "Rules & source", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "How this market resolves" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Forecast", exact: true }).click();
  await page.getByLabel("Number of shares").fill("10");
  await expect(
    page.getByRole("button", { name: "Buy YES shares" }),
  ).toBeEnabled();
  // WebKit reports requests cut off by reload as page errors; finish both post-trade refreshes.
  const tradeStarted = Date.now();
  const chartRefresh = page.waitForResponse(
    (response) =>
      response.url().endsWith("/history") &&
      response.request().timing().startTime > tradeStarted,
  );
  const quoteRefresh = page.waitForResponse(
    (response) =>
      response.url().endsWith("/quotes") &&
      response.request().timing().startTime > tradeStarted,
  );
  await page.getByRole("button", { name: "Buy YES shares" }).click();
  await expect(page.getByRole("status")).toContainText("Bought 10 YES shares");
  await chartRefresh;
  await (await quoteRefresh).finished();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Will the Fed cut interest rates before 2027?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.locator(".position-row")).toHaveCount(1);
  await expect(page.locator(".position-row")).toContainText("10 shares");
  await page.locator(".position-row").click();
  await page.getByRole("button", { name: "Sell shares", exact: true }).click();
  await page.getByLabel("Number of shares").fill("10");
  await expect(
    page.getByRole("button", { name: "Sell YES shares" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Sell YES shares" }).click();
  await expect(page.getByRole("status")).toContainText("Sold 10 YES shares");
  expect(errors).toEqual([]);
});

test("save and inspect a private manual draft", async ({ page }) => {
  await page.goto("/studio");
  await expect(
    page.getByRole("heading", { name: "Draft studio" }),
  ).toBeVisible();
  await expect(
    page.getByText("AI not connected", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Save private draft" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Manual draft saved privately",
  );
  await page.getByRole("button", { name: /^Saved drafts/ }).click();
  await page
    .getByText("Will the Fed cut interest rates before 2027?", { exact: true })
    .click();
  await expect(
    page.getByText(
      "Human review required. Source content has not been fetched or verified.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".saved-drafts details")).toHaveCount(1);
  await page.locator(".saved-drafts summary").click();
  await expect(page.locator(".saved-drafts")).toContainText("Primary source:");
  await expect(page.locator(".saved-drafts")).toContainText(
    "Closes (your timezone):",
  );
});

test("developer reference, PWA assets, no horizontal overflow, explicit offline failure", async ({
  page,
}) => {
  await page.goto("/developers");
  await expect(
    page.getByRole("heading", { name: "Developer tools" }),
  ).toBeVisible();
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe("standalone");
  for (const asset of [
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable.png",
    "/sw.js",
  ])
    expect((await page.request.get(asset)).ok()).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("link", { name: "Open API reference", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Wildcatter API/ }),
  ).toBeVisible();
  await page.goto("/markets");
  await expect(
    page.getByRole("heading", { name: "Markets", exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page.locator(".market-card").first().click();
  await expect(
    page
      .locator(".form-error")
      .filter({ hasText: /fetch|network|load failed/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buy YES shares" }),
  ).toBeDisabled();
  await page.context().setOffline(false);
});

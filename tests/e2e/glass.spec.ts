import { test, expect } from "@playwright/test";

test("glass engine, navigation lifecycle and reduced motion keep controls usable", async ({
  page,
  isMobile,
  browserName,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/markets");
  await expect(page.locator(".page h1")).toBeVisible();
  await expect(page.locator(".category-tabs")).toHaveAttribute(
    "data-glass-renderer",
    browserName === "webkit" ? "frosted" : "refraction",
  );
  const initialFilters = await page.locator('filter[id^="lg-filter-"]').count();
  expect(initialFilters).toBeLessThanOrEqual(6);
  for (let i = 0; i < 3; i++) {
    const navigation = isMobile
      ? page.getByRole("navigation", { name: "Quick navigation" })
      : page.locator(".sidebar nav");
    if (!isMobile)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await navigation
      .getByRole("button", { name: "Portfolio", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your portfolio" }),
    ).toBeVisible();
    if (!isMobile)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await navigation
      .getByRole("button", { name: "Markets", exact: true })
      .click();
    await expect(page.locator(".category-tabs")).toHaveAttribute(
      "data-glass-renderer",
      browserName === "webkit" ? "frosted" : "refraction",
    );
  }
  await expect(page.locator('filter[id^="lg-filter-"]')).toHaveCount(
    initialFilters,
  );
  expect(
    await page
      .locator(".market-card")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("interrupted trade confirmation retries the original request once", async ({
  page,
}) => {
  await page.goto("/markets/fed-rate");
  await expect(page.locator(".page h1")).toBeVisible();
  await page.getByLabel("Number of shares").fill("10");
  let interrupted = false;
  let originalBody = "";
  let originalKey = "";
  await page.route("**/api/v1/trades", async (route) => {
    if (!interrupted) {
      interrupted = true;
      originalBody = route.request().postData() ?? "";
      originalKey = route.request().headers()["idempotency-key"];
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    } else {
      expect(route.request().postData()).toBe(originalBody);
      expect(route.request().headers()["idempotency-key"]).toBe(originalKey);
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Buy YES shares" }).click();
  await expect(
    page.getByRole("button", { name: "Retry trade confirmation" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Number of shares")).toBeDisabled();
  await page.getByRole("button", { name: "Retry trade confirmation" }).click();
  await expect(page.getByRole("status")).toContainText("Bought 10 YES shares");
  const portfolio = await page.evaluate(async () => {
    const response = await fetch("/api/v1/portfolio", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("wildcatter.demo.token.v1")}`,
      },
    });
    return response.json();
  });
  expect(portfolio.trades).toHaveLength(1);
  expect(portfolio.positions[0].shares).toBe(10);
});

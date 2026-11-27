import { test, expect, expectAllMarkets } from "./fixtures.js";
import { choose } from "./select.js";
test("appearance persists between Settings, the app and short landing page", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Turn your view/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("link", { name: "Download for Android" }),
  ).toHaveAttribute("href", "/downloads/Peakcast-Android.apk");
  await page.getByRole("button", { name: "Continue on the web" }).click();
  await expect(page).toHaveURL(/\/markets$/);
  await expect(page.locator('filter[id^="lg-filter-"]')).toHaveCount(0);
  await expectAllMarkets(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("custom dropdown supports mouse and keyboard and categories keep clear spacing", async ({
  page,
}) => {
  await page.goto("/markets");
  await choose(page, "Sort markets", "closing");
  await expect(
    page.getByRole("combobox", { name: "Sort markets" }),
  ).toContainText("Closing soon");
  await page.getByRole("combobox", { name: "Sort markets" }).focus();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("combobox", { name: "Sort markets" }),
  ).toContainText("Featured");
  const tabs = await page.locator(".explorer > .category-tabs").boundingBox();
  const cards = await page.locator(".market-grid").boundingBox();
  expect(cards!.y - tabs!.y - tabs!.height).toBeGreaterThanOrEqual(20);
});

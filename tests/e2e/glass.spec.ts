import { test, expect } from "./fixtures.js";

test("opaque surfaces, navigation lifecycle and reduced motion keep controls usable", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/markets");
  await expect(page.locator(".page h1")).toBeVisible();
  await expect(page.locator('filter[id^="lg-filter-"]')).toHaveCount(0);
  for (let i = 0; i < 3; i++) {
    const navigation = isMobile
      ? page.getByRole("navigation", { name: "Quick navigation" })
      : page.locator(".desktop-sidebar nav");
    await navigation
      .getByRole("button", { name: "Portfolio", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your portfolio" }),
    ).toBeVisible();
    await navigation
      .getByRole("button", { name: "Markets", exact: true })
      .click();
    await expect(page.locator(".market-card")).toHaveCount(6);
  }
  await expect(page.locator('filter[id^="lg-filter-"]')).toHaveCount(0);
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

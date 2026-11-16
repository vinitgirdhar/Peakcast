import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("featured probability stays inside its card across narrow and intermediate widths", async ({
  page,
}) => {
  await page.route("**/api/v1/markets?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.items[0].probability = 1;
    await route.fulfill({ json: body });
  });
  await page.goto("/markets");
  await expect(page.locator(".feature-probability")).toContainText("100%");
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 1100, 900, 768, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.locator(".featured-market").evaluate((card) => {
      const probability = card.querySelector(".feature-probability")!;
      const range = document.createRange();
      range.selectNodeContents(probability.firstChild!);
      const text = range.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      return {
        textLeft: text.left,
        textRight: text.right,
        textTop: text.top,
        textBottom: text.bottom,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      };
    });
    expect(bounds.textLeft, `left at ${width}px`).toBeGreaterThanOrEqual(
      bounds.left + 12,
    );
    expect(bounds.textRight, `right at ${width}px`).toBeLessThanOrEqual(
      bounds.right - 12,
    );
    expect(bounds.textTop).toBeGreaterThan(bounds.top);
    expect(bounds.textBottom).toBeLessThan(bounds.bottom);
  }
});

test("dark appearance keeps the black foundation, glow, readable drawer and no extra tick", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator(".appearance-options button > svg")).toHaveCount(3);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(0, 0, 0)");
  expect(
    await page
      .locator(".ambient-light")
      .evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain("radial-gradient");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Workspace menu" }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .include(".navigation-drawer")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
});

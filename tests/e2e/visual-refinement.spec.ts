import { test, expect, mockApi } from "./fixtures.js";
import AxeBuilder from "@axe-core/playwright";

test("landing reveals and animated selections keep content available with reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Turn your view/ }),
  ).toBeVisible();
  const platforms = page.getByRole("region", { name: "Get Peakcast" });
  await platforms.scrollIntoViewIfNeeded();
  await expect(platforms).toHaveCSS("opacity", "1");
  await expect(
    page.getByRole("link", { name: "Download desktop app" }),
  ).toHaveAttribute("href", "/downloads/Peakcast-Windows.zip");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(platforms).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Continue on the web" }).click();
  await page.getByRole("button", { name: "Technology", exact: true }).click();
  await expect(
    page.locator(".category-tabs .selected .tab-selection"),
  ).toHaveCount(1);
  await expect(page.locator(".market-card .category-label")).toHaveText([
    "Technology",
    "Technology",
  ]);
  await expect(page.locator(".probability-track > span").first()).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("market pulse totals actual activity and upcoming deadlines exclude closed or expired markets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page, "/api/v1/markets?", {
    transform: `body.items = body.items.slice(0, 4).map((market, index) => ({
        ...market,
        status: index === 1 ? "closed" : "open",
        closesAt: new Date(Date.now() + (index === 3 ? -1 : index === 2 ? 1 : 2) * 86400000).toISOString(),
        trades: index + 1,
        volumeMicros: (index + 1) * 1000000,
      }));
      return body;`,
  });
  await page.goto("/markets");
  await expect(page.locator(".market-pulse strong")).toHaveText([
    "2",
    "10",
    "10",
  ]);
  const deadlines = page
    .getByRole("region", { name: "Closing next" })
    .getByRole("button");
  await expect(deadlines).toHaveCount(2);
  await expect(deadlines.first()).toContainText(
    "Will a crewed mission land on the Moon in 2027?",
  );
  await deadlines.first().click();
  await expect(page).toHaveURL(/\/markets\/moon-landing$/);
});

test("hero downloads are visible immediately and hidden scrollbars preserve page scrolling", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.getByRole("region", { name: "Get Peakcast" });
  for (const name of ["Download desktop app", "Download for Android"]) {
    const link = hero.getByRole("link", { name });
    await expect(link).toBeInViewport();
  }
  await expect(
    hero.getByRole("button", { name: "Continue on the web" }),
  ).toBeInViewport();
  await expect(page.locator("html")).toHaveCSS("scrollbar-width", "none");
  await page.evaluate(() => window.scrollBy(0, 400));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await page.goto("/studio");
  await expect(
    page.locator('[aria-current="page"] .tab-selection'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: /^Saved drafts/ }).click();
  await expect(
    page.locator('[aria-current="page"] .tab-selection'),
  ).toHaveCount(1);
});

test("featured probability stays inside its card across narrow and intermediate widths", async ({
  page,
}) => {
  await mockApi(page, "/api/v1/markets?", {
    transform: "body.items[0].probability = 1; return body;",
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

test("dark appearance keeps a quiet black foundation and accessible tablet drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1050, height: 1000 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator(".appearance-options button > svg")).toHaveCount(3);
  // The theme cross-fades, so wait for it to settle.
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(0, 0, 0)");
  await expect(page.locator(".ambient-light")).toHaveCount(0);
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

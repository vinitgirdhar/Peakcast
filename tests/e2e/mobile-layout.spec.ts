import { test, expect } from "./fixtures.js";

test("navigation uses a desktop sidebar, tablet drawer and mobile tab bar", async ({
  page,
  isMobile,
}) => {
  await page.goto("/markets");
  const menu = page.getByRole("button", { name: "Open navigation" });
  const dock = page.getByRole("navigation", { name: "Quick navigation" });
  if (isMobile) {
    await expect(menu).toBeHidden();
    await expect(dock).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await dock.getByRole("button", { name: "Portfolio", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(
      dock.getByRole("button", { name: "Portfolio", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(menu).toBeHidden();
      await expect(dock).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      const bounds = await dock.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
  } else {
    await expect(dock).toBeHidden();
    await expect(menu).toBeHidden();
    await expect(page.locator(".desktop-sidebar")).toBeVisible();
    await page
      .locator(".desktop-sidebar")
      .getByRole("button", { name: "Portfolio", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portfolio$/);
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(page.locator(".desktop-sidebar")).toBeHidden();
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Workspace menu" });
    await expect(drawer).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close navigation" }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.click();
    await drawer
      .getByRole("button", { name: "Portfolio", exact: true })
      .click();
    await expect(drawer).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      "hidden",
    );
    await menu.click();
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(drawer).toBeHidden();
    await expect(page.locator(".desktop-sidebar")).toBeVisible();
  }
});

test("market pages, filtering and separate rules preserve an unfinished order", async ({
  page,
}) => {
  await page.goto("/markets");
  const titles = page.locator(".market-card h3");
  await expect(titles).toHaveCount(6);
  const first = await titles.allTextContents();
  await page.getByRole("button", { name: "Next markets" }).click();
  await expect(
    page.getByRole("navigation", { name: "Market pages" }),
  ).toContainText("2 of 3");
  expect(await titles.allTextContents()).not.toEqual(first);
  // Two house markets plus one a sample player created (server/demo.ts).
  await page.getByRole("button", { name: "Crypto", exact: true }).click();
  await expect(titles).toHaveCount(3);
  await expect(
    page.getByRole("navigation", { name: "Market pages" }),
  ).toHaveCount(0);
  await page.goto("/markets/fed-rate");
  await page.getByLabel("Number of shares").fill("37");
  await page
    .getByRole("button", { name: "Rules & source", exact: true })
    .click();
  await expect(page).toHaveURL(/\/markets\/fed-rate\/rules$/);
  await expect(page.locator(".trade-panel")).toHaveCount(0);
  await expect(
    page.getByText("Payouts are demo credits, never real money."),
  ).toBeVisible();
  await page.getByText("Missing or unclear evidence", { exact: true }).click();
  await expect(page.locator(".review-rule p")).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Number of shares")).toHaveValue("37");
  await page.goto("/markets/fed-rate/rules");
  await expect(
    page.getByRole("heading", { name: "How this market resolves" }),
  ).toBeVisible();
});

test("the phone dock has four tabs around a create button and its sheet", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "The dock is the phone navigation.");
  await page.goto("/markets");
  const dock = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(dock.getByRole("button")).toHaveText([
    "Markets",
    "Portfolio",
    "",
    "Leaderboard",
    "Settings",
  ]);
  const create = dock.getByRole("button", { name: "Create" });
  const sheet = page.getByRole("dialog", { name: "Create" });
  await create.click();
  await expect(sheet).toBeVisible();
  await expect(
    dock.getByRole("button", { name: "Close create menu" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await create.click();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/markets$/);
  await create.click();
  await sheet.getByRole("button", { name: /^Saved drafts/ }).click();
  await expect(page).toHaveURL(/\/studio\/drafts$/);
  await expect(sheet).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(/\/markets$/);
  await dock.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "About Peakcast" }).click();
  await expect(
    page.getByRole("heading", { name: "About Peakcast" }),
  ).toBeVisible();
  await expect(
    dock.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("about and saved drafts are focused pages rather than one long screen", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(
    page.getByRole("heading", { name: "About Peakcast" }),
  ).toBeVisible();
  await expect(page.getByText("Your data stays here")).toBeVisible();
  await page.goto("/studio");
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: /^Saved drafts/ }).click();
  await expect(page).toHaveURL(/\/studio\/drafts$/);
  await expect(page.locator(".draft-form-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "New draft", exact: true }).click();
  await expect(
    page.getByLabel("The question", { exact: true }),
  ).not.toHaveValue("");
});

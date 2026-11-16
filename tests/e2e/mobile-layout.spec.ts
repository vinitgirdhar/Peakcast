import { test, expect } from "@playwright/test";

test("navigation uses one surface, with an accessible desktop drawer", async ({
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
  ).toContainText("2 of 2");
  expect(await titles.allTextContents()).not.toEqual(first);
  await page.getByRole("button", { name: "Crypto", exact: true }).click();
  await expect(titles).toHaveCount(2);
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

test("developer hub and saved drafts are focused pages rather than one long screen", async ({
  page,
}) => {
  await page.goto("/developers");
  await expect(page.locator(".endpoint-list")).toHaveCount(0);
  await expect(
    page.getByText(
      /later milestone|development preview|A place to test your edge/,
    ),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "API & credentials", exact: false })
    .click();
  await expect(page).toHaveURL(/\/developers\/api$/);
  await expect(page.locator(".endpoint")).toHaveCount(8);
  await expect(page.getByLabel("TypeScript API example")).toBeHidden();
  await page
    .getByText("JavaScript / TypeScript example", { exact: true })
    .click();
  await expect(page.getByLabel("TypeScript API example")).toBeVisible();
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

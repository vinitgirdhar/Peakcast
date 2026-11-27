import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";

const apps = [
  ["Forecast journal", "/apps/journal"],
  ["Stake sizer", "/apps/sizer"],
  ["Evidence updater", "/apps/bayes"],
] as const;

test("the hub lists every micro app and each opens on its own page", async ({
  page,
}) => {
  await page.goto("/apps");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Micro apps",
  );
  const cards = page.locator(".micro-card");
  await expect(cards).toHaveCount(apps.length);
  for (const [name, path] of apps) {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    // The leaving page keeps its heading while it fades, so look this one up by name.
    await expect(
      page.getByRole("heading", { level: 1, name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Micro apps", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/apps$/);
  }
});

test("an unknown micro app shows a way back to the hub", async ({ page }) => {
  await page.goto("/apps/nope");
  await expect(
    page.getByRole("heading", { name: "App not found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All micro apps" }).click();
  await expect(page).toHaveURL(/\/apps$/);
});

test("the sidebar marks Micro apps while an app is open", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The sidebar is the desktop navigation.");
  await page.goto("/apps/sizer");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .first()
      .getByRole("button", { name: "Micro apps" }),
  ).toHaveAttribute("aria-current", "page");
});

test("phones reach micro apps from the create sheet and keep four dock tabs", async ({
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
  await dock.getByRole("button", { name: "Create" }).click();
  const sheet = page.getByRole("dialog", { name: "Create" });
  await sheet.getByRole("button", { name: /^Micro apps/ }).click();
  await expect(page).toHaveURL(/\/apps$/);
  await expect(sheet).toBeHidden();
});

test("deleting the account removes all micro-app data", async ({ page }) => {
  await page.goto("/apps");
  await page.evaluate(() => {
    localStorage.setItem("peakcast.micro.journal.v1", "{}");
    localStorage.setItem("peakcast.micro.sizer.v1", "{}");
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith("peakcast.micro."),
          ).length,
      ),
    )
    .toBe(0);
});

for (const theme of ["light", "dark"] as const)
  test(`the hub passes axe in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("peakcast.theme", value),
      theme,
    );
    await page.goto("/apps");
    await expect(page.locator(".micro-card")).toHaveCount(apps.length);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    // Axe reads blended colours while the page and cards fade in, so wait until they settle.
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".route-surface, .micro-grid li")].every(
        (element) => getComputedStyle(element).opacity === "1",
      ),
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

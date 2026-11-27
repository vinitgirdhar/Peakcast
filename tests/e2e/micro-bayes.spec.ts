import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect, api } from "./fixtures.js";
import { choose } from "./select.js";
import {
  formatProbability,
  fromBits,
  logit2,
  priorPercent,
} from "../../shared/micro/bayes.js";

interface MarketSummary {
  id: string;
  title: string;
  probability: number;
}

const firstMarket = async (page: Page): Promise<MarketSummary> =>
  (await api<{ items: MarketSummary[] }>(page, "/markets")).body.items[0];

const liveRegion = (page: Page) =>
  page.locator('.micro-bayes [aria-live="polite"]');

test("starts from a market, adds evidence and explains the update", async ({
  page,
}) => {
  const market = await firstMarket(page);
  await page.goto("/apps/bayes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Evidence updater",
  );
  await expect(page.getByText("No evidence yet.")).toBeVisible();
  // Opening the app announces nothing; only a changed posterior is spoken.
  await page.waitForTimeout(400);
  await expect(liveRegion(page)).toHaveText("");

  await choose(page, "Start from a market", market.id);
  const prior = page.getByLabel("Prior probability");
  const priorText = String(priorPercent(market.probability));
  await expect(prior).toHaveValue(priorText);

  await page.getByRole("button", { name: "Add evidence" }).click();
  const label = page.getByLabel("Label for evidence 1");
  await expect(label).toBeFocused();
  await label.fill("Strong report");
  await page.getByRole("button", { name: "×3", exact: true }).click();

  const posterior = formatProbability(
    fromBits(logit2(Number(priorText) / 100) + Math.log2(3)),
  );
  await expect(liveRegion(page)).toContainText(posterior);
  await expect(page.locator(".bayes-posterior")).toHaveText(posterior);
  await expect(page.locator(".bayes-readout")).toContainText("+1.58 bits");
  const moved = page.locator(".bayes-moved");
  await expect(moved).toContainText("Moved +1.6 bits (×3) from");
  await expect(moved).toContainText(`to ${posterior}`);
  await expect(page.locator(".bayes-crowd")).toContainText(/the crowd's \d+%/);
  await expect(
    page.getByRole("img", { name: /Log-odds scale from -10 to \+10 bits/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Multiplying ratios assumes each piece of evidence"),
  ).toBeVisible();

  // An invalid field greys out the last result instead of hiding it.
  await prior.fill("0");
  await expect(
    page.getByText("Prior must be from 0.1% to 99.9%."),
  ).toBeVisible();
  await expect(prior).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Fix the highlighted fields")).toBeVisible();
  await expect(page.locator(".bayes-result-body")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.locator(".bayes-posterior")).toHaveText(posterior);
  await prior.fill(priorText);
  await expect(page.getByText("Fix the highlighted fields")).toBeHidden();

  // Two chances: 90% if YES, 30% if NO is a ratio of 3 as well.
  await page.getByRole("button", { name: "Two chances" }).click();
  await page.getByLabel("If YES, how likely is this?").fill("90");
  await page.getByLabel("If NO, how likely is this?").fill("30");
  await expect(page.locator(".bayes-posterior")).toHaveText(posterior);

  await page.getByRole("button", { name: "Remove Strong report" }).click();
  await expect(
    page.getByRole("button", { name: "Add evidence" }),
  ).toBeFocused();
  await expect(page.locator(".bayes-posterior")).toHaveText(
    formatProbability(Number(priorText) / 100),
  );
});

test("moving evidence by keyboard keeps focus on the moved row", async ({
  page,
}) => {
  await page.goto("/apps/bayes");
  const add = page.getByRole("button", { name: "Add evidence" });
  await add.click();
  await page.getByLabel("Label for evidence 1").fill("Alpha");
  await add.click();
  await page.getByLabel("Label for evidence 2").fill("Beta");

  // Beta reaches the top, so its up arrow is disabled and focus moves to down.
  await page.getByRole("button", { name: "Move Beta up" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Label for evidence 1")).toHaveValue("Beta");
  await expect(
    page.getByRole("button", { name: "Move Beta down" }),
  ).toBeFocused();

  // And back to the bottom: focus lands on its up arrow.
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Label for evidence 2")).toHaveValue("Beta");
  await expect(
    page.getByRole("button", { name: "Move Beta up" }),
  ).toBeFocused();
});

test("the odds converter reads every format and rejects bad text", async ({
  page,
}) => {
  await page.goto("/apps/bayes");
  const toggle = page.getByRole("button", { name: "Odds converter" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("group", { name: "Odds format" })
    .getByRole("button", { name: "American" })
    .click();
  const input = page.getByLabel("American odds");
  await input.fill("+150");
  const forms = page.locator(".bayes-forms");
  for (const text of ["40.0%", "2.50", "+150", "3/2", "2:3", "1 in 2.5"])
    await expect(forms).toContainText(text);
  await input.fill("+50");
  await expect(
    page.getByText("American odds look like +150 or −200."),
  ).toBeVisible();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("-200");
  await page.getByRole("button", { name: "Use 66.7% as prior" }).click();
  await expect(page.getByLabel("Prior probability")).toHaveValue("66.7");
});

test("saves a worksheet and loads it after a reload", async ({ page }) => {
  await page.goto("/apps/bayes");
  await expect(page.getByText("Saved worksheets appear here.")).toBeVisible();
  await page.getByLabel("Prior probability").fill("20");
  await page.getByRole("button", { name: "Add evidence" }).click();
  await page.getByLabel("Label for evidence 1").fill("Polls");
  await page.getByLabel("Likelihood ratio (×)").fill("4");
  await page.getByLabel("Title", { exact: true }).fill("Rain check");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".bayes-sheet-list")).toContainText("Rain check");

  await page.reload();
  await expect(page.getByLabel("Prior probability")).toHaveValue("50");
  await page.getByRole("button", { name: "Load Rain check" }).click();
  await expect(page.getByLabel("Prior probability")).toHaveValue("20");
  await expect(page.getByLabel("Label for evidence 1")).toHaveValue("Polls");
  await expect(page.locator(".bayes-posterior")).toHaveText("50.0%");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete Rain check" }).click();
  await expect(page.getByText("Saved worksheets appear here.")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("peakcast.micro.bayes.v1")),
  ).toBe('{"version":1,"worksheets":[]}');
});

test("corrupt saved data opens an empty list instead of crashing", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("peakcast.micro.bayes.v1", "{not json"),
  );
  await page.goto("/apps/bayes");
  await expect(page.getByText("Saved worksheets appear here.")).toBeVisible();
  await expect(page.getByText("This app could not open.")).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const)
  test(`passes axe in ${theme} mode and fits a 375 px screen`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("peakcast.theme", value),
      theme,
    );
    await page.goto("/apps/bayes");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByRole("button", { name: "Add evidence" }).click();
    await page.getByRole("button", { name: "×2", exact: true }).click();
    await page.getByRole("button", { name: "Odds converter" }).click();
    await page.getByLabel("Percent odds").fill("35");
    await expect(page.locator(".bayes-forms")).toContainText("35.0%");
    const results = await new AxeBuilder({ page })
      .include(".micro-page")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  });

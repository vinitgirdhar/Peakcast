import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "./fixtures.js";

// Each test has its own browser storage, so launching a market here never
// changes the market counts another test sees.

const audit = async (page: Page, selector: string) =>
  expect(
    (
      await new AxeBuilder({ page })
        .include(selector)
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

async function saveDraft(page: Page, yesRule: string) {
  await page
    .getByLabel("The question")
    .fill("Will the Sensex close above 90,000 points on 2027-03-31?");
  await page.getByLabel("Primary source").fill("BSE");
  await page.getByLabel("Closes at (your timezone)").fill("2027-03-31T09:00");
  await page.getByLabel("Source URL").fill("https://www.bseindia.com/sensex");
  await page.getByLabel("Resolves YES when").fill(yesRule);
  await page.getByLabel("Resolves NO when").fill("Otherwise, resolves NO.");
  await page
    .getByLabel("If evidence is missing or ambiguous")
    .fill(
      "If BSE does not publish the close by 2027-04-07 23:59 IST, resolves INVALID.",
    );
  await page.getByRole("button", { name: "Save private draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved privately");
}

test("the studio rule check blocks, warns and publishes what it found", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/studio");
  const panel = page.getByRole("region", { name: "Rule check" });
  const question = page.getByLabel("The question");

  await question.fill("Will the Sensex close above the record?");
  await expect(panel.locator(".finding-group.block")).toContainText(
    "compares against nothing measurable",
  );
  await expect(panel.locator(".rule-badge")).toContainText("Blocked");
  await question.fill("Will the Sensex close above 90,000 points?");
  await expect(panel.locator(".finding-group.block")).toHaveCount(0);
  await expect(panel.locator(".finding-group.warn")).toContainText(
    "Say whether exactly the threshold counts",
  );
  await page.getByLabel("Resolves YES when").focus();
  await panel
    .getByRole("button", { name: /exactly the threshold counts/ })
    .click();
  await expect(question).toBeFocused();
  await audit(page, ".rule-check");

  await saveDraft(
    page,
    "Resolves YES if, in the creator's opinion, the Sensex closes strong.",
  );
  await saveDraft(
    page,
    "Resolves YES if BSE reports a Sensex close above 90,000 on 2027-03-31.",
  );
  await page.getByRole("button", { name: /^Saved drafts/ }).click();
  const drafts = page.locator(".saved-drafts details");
  const blocked = drafts.filter({ hasText: "in the creator's opinion" });
  const warned = drafts.filter({ hasText: "BSE reports a Sensex close" });

  await blocked.locator("summary").click();
  await expect(blocked.locator(".rule-badge")).toContainText("Blocked");
  await expect(blocked).toContainText(
    "Fix 1 blocking rule problem before launch: subjective-judge.",
  );
  await expect(
    blocked.getByRole("button", { name: "Launch market" }),
  ).toBeDisabled();

  await warned.locator("summary").click();
  const launch = warned.getByRole("button", { name: "Launch market" });
  await expect(launch).toBeDisabled();
  await expect(
    warned.getByRole("link", { name: "Open the source" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await warned
    .getByLabel(/I reviewed (this warning|these \d+ warnings)/)
    .check();
  await expect(launch).toBeDisabled();
  await warned
    .getByLabel("I opened the source and it shows the figure")
    .check();
  await audit(page, ".saved-drafts");
  await launch.click();

  await expect(page).toHaveURL(/\/markets\/will-the-sensex/);
  await page
    .getByRole("button", { name: "Rules & source", exact: true })
    .click();
  const line = page.locator(".rule-check-line");
  await expect(line).toContainText(/Launched with \d+ unresolved warnings?/);
  await expect(line).toContainText(
    "Unclear whether the exact threshold counts",
  );
});

test("a saved draft can be edited as a new draft", async ({ page }) => {
  await page.goto("/studio");
  await saveDraft(
    page,
    "Resolves YES if, in the creator's opinion, the Sensex closes strong.",
  );
  await page.getByRole("button", { name: /^Saved drafts/ }).click();
  await page.locator(".saved-drafts summary").first().click();
  await page.getByRole("button", { name: "Edit as new draft" }).first().click();
  await expect(page.getByLabel("Resolves YES when")).toHaveValue(
    "Resolves YES if, in the creator's opinion, the Sensex closes strong.",
  );
  await expect(
    page.getByRole("region", { name: "Rule check" }).locator(".rule-badge"),
  ).toContainText("Blocked");
});

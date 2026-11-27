import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect, api } from "./fixtures.js";

const storageKey = "peakcast.micro.journal.v1";
const question = "Will the city library open its new wing by June 2027?";

/** Matches a row button by the question title in its name. */
const named = (title: string) =>
  new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const probability = (page: Page) =>
  page.getByRole("spinbutton", { name: "Your probability of YES" });

async function openJournal(page: Page) {
  await page.goto("/apps/journal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Forecast journal",
  );
  await expect(
    page.getByRole("button", { name: "Save forecast" }),
  ).toBeVisible();
}

test("an own question persists, resolves and is scored", async ({ page }) => {
  await openJournal(page);
  await expect(
    page.getByRole("heading", { name: "No forecasts yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Own question" }).click();
  await page.getByLabel("Question", { exact: true }).fill(question);
  await probability(page).fill("75");
  await expect(page.getByText("about 1 in 1.3")).toBeVisible();
  await page.getByRole("button", { name: "Save forecast" }).click();
  const row = page.getByRole("button", { name: named(question) });
  await expect(row).toBeVisible();
  await expect(row).toContainText("75%");

  await page.reload();
  await expect(row).toBeVisible();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    storageKey,
  );
  expect(stored.questions[0]).toMatchObject({
    kind: "custom",
    title: question,
    forecasts: [{ pct: 75 }],
  });

  await row.click();
  await page
    .getByRole("group", { name: `Resolve “${question}”` })
    .getByRole("button", { name: "YES" })
    .click();
  const summary = page.getByRole("region", { name: "Your scores" });
  await expect(summary.locator(".stat-scored strong")).toHaveText("1");
  await expect(summary.locator(".stat-brier strong")).toHaveText("0.063");
  await expect(summary.getByRole("img")).toBeVisible();
  await page.getByRole("button", { name: /^Resolved/ }).click();
  await expect(row).toContainText("Resolved YES");
});

test("a forecast on the first open market records the crowd", async ({
  page,
}) => {
  const markets = (
    await api<{
      items: { id: string; title: string; status: string; closesAt: string }[];
    }>(page, "/markets")
  ).body.items;
  const first = markets
    .filter((market) => market.status === "open")
    .sort((a, b) => a.closesAt.localeCompare(b.closesAt))[0];
  await openJournal(page);
  await expect(page.getByRole("combobox", { name: "Market" })).toHaveText(
    first.title,
  );
  await probability(page).fill("40");
  await page.getByLabel("Why?").fill("Base rate is low.");
  await page.getByRole("button", { name: "Save forecast" }).click();
  const row = page.getByRole("button", { name: named(first.title) });
  await expect(row).toContainText("40%");
  await expect(row).toContainText("market");
  await row.click();
  await expect(page.getByText("Base rate is low.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open market" })).toBeVisible();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    storageKey,
  );
  expect(stored.questions[0].id).toBe(`m:${first.id}`);
  expect(typeof stored.questions[0].forecasts[0].crowd).toBe("number");
});

test("invalid input shows the message next to its field", async ({ page }) => {
  await openJournal(page);
  await page.getByRole("button", { name: "Own question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Short");
  await page.getByRole("button", { name: "Save forecast" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Write the question in 8 to 200 characters.",
  );
  await expect(page.getByLabel("Question", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("corrupt saved data does not break the journal", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "{not json"),
    storageKey,
  );
  await openJournal(page);
  await expect(
    page.getByRole("heading", { name: "No forecasts yet" }),
  ).toBeVisible();
});

const fixture = {
  version: 1,
  questions: [
    {
      id: "c:due",
      kind: "custom",
      title: "Will the bridge repairs finish by March 2026?",
      checkBy: "2026-01-01",
      createdAt: "2025-12-01T10:00:00.000Z",
      forecasts: [{ at: "2025-12-01T10:00:00.000Z", pct: 30, note: "" }],
    },
    {
      id: "c:done",
      kind: "custom",
      title: "Will it snow in the city before New Year 2026?",
      checkBy: "2025-12-31",
      resolution: "NO",
      resolvedAt: "2026-01-01T10:00:00.000Z",
      createdAt: "2025-11-01T10:00:00.000Z",
      forecasts: [
        { at: "2025-11-01T10:00:00.000Z", pct: 60, note: "Cold autumn." },
        { at: "2025-12-01T10:00:00.000Z", pct: 20, note: "" },
      ],
    },
  ],
};

for (const theme of ["light", "dark"] as const)
  test(`the journal passes axe in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(
      ([key, value, mode]) => {
        localStorage.setItem(key, value);
        localStorage.setItem("peakcast.theme", mode);
      },
      [storageKey, JSON.stringify(fixture), theme] as const,
    );
    await openJournal(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(
      page.getByRole("heading", { name: "Needs resolving" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^All/ }).click();
    await page
      .getByRole("button", { name: named(fixture.questions[1].title) })
      .click();
    await expect(page.getByText("Cold autumn.")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include(".micro-journal")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

test("no horizontal scroll at 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    storageKey,
    JSON.stringify(fixture),
  ] as const);
  await openJournal(page);
  await page.getByRole("button", { name: "Own question" }).click();
  await page
    .getByRole("button", { name: named(fixture.questions[0].title) })
    .click();
  await expect(page.getByRole("button", { name: "Save update" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

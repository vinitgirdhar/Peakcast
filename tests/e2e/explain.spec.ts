import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

// Read-only: the shared server runs without AI, so only the facts block shows.
test("a market explains itself in plain words without AI", async ({
  page,
  request,
}) => {
  const market = await (await request.get("/api/v1/markets/fed-rate")).json();
  await page.goto("/markets/fed-rate");
  const panel = page.getByRole("region", { name: "Explain this market" });
  const toggle = panel.getByRole("button", { name: /Explain this market/ });
  // Collapsible panels start closed on phones; one tap opens it.
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    panel.getByRole("heading", { name: "What the market says" }),
  ).toBeVisible();
  const fact = (label: string) =>
    panel.locator(".explain-facts > div", {
      has: page.getByRole("term").filter({ hasText: label }),
    });
  await expect(fact("Chance").getByRole("definition")).toHaveText(
    new RegExp(
      `^The crowd (puts this at|sees this as) .+ \\(${Math.round(market.probability * 100)}%\\)\\.$`,
    ),
  );
  await expect(fact("How it resolves").getByRole("definition")).toContainText(
    `Resolves using ${market.sourceName}; trading closes`,
  );
  await expect(fact("Time left").getByRole("definition")).toHaveText(
    /^Closes in /,
  );
  await expect(panel.getByRole("button", { name: /with AI/ })).toHaveCount(0);
  await expect(panel.getByLabel("AI access token")).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".explain-facts")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

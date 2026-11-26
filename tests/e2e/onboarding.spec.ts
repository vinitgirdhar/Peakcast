import { test, expect } from "./fixtures.js";

test.use({ onboarded: false });

test("first launch onboards, starts with 5,000 credits and keeps Playground on", async ({
  page,
}) => {
  await page.goto("/markets");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Forecast the future",
  );
  await page.getByRole("button", { name: "Skip" }).click();
  const start = page.getByRole("button", { name: "Start with 5,000 credits" });
  await page.getByLabel("Display name").fill("Ada");
  await page.getByLabel("I am 18 or older.").check();
  await expect(start).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await start.click();
  await expect(page.locator(".market-card")).toHaveCount(6);
  await expect(page.getByText("5,000.00").first()).toBeVisible();

  await page.goto("/settings");
  const playground = page.getByRole("switch", { name: /Playground mode/ });
  await expect(playground).toHaveAttribute("aria-checked", "true");
  await playground.click();
  await expect(page.getByRole("status")).toContainText(
    "Real-money trading isn't available",
  );
  await expect(playground).toHaveAttribute("aria-checked", "true");
});

test("legal pages are public and account deletion signs out", async ({
  page,
}) => {
  for (const [path, heading] of [
    ["/terms", "Terms of Use"],
    ["/privacy", "Privacy Policy"],
    ["/help", "Help and questions"],
  ])
    await page.goto(path).then(() =>
      expect(page.getByRole("heading", { level: 1 })).toHaveText(heading),
    );
  await page.goto("/delete-account");
  await expect(page.getByText(/Open this page in the Wildcatter app/)).toBeVisible();
});

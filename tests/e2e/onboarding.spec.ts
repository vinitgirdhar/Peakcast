import { test, expect, expectAllMarkets } from "./fixtures.js";

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
  await expectAllMarkets(page);
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
    await page
      .goto(path)
      .then(() =>
        expect(page.getByRole("heading", { level: 1 })).toHaveText(heading),
      );
  await page.goto("/delete-account");
  await expect(
    page.getByText(/Peakcast keeps no data on any server/),
  ).toBeVisible();
});

test("the Android app skips the landing page and asks for a name before the intro", async ({
  page,
}) => {
  // ?platform=android shows the Android app's layout (src/platform.ts).
  await page.goto("/?platform=android");
  await expect(page).toHaveURL(/\/markets$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Peakcast",
  );
  const next = page.getByRole("button", { name: "Continue" });
  await page.getByLabel("Display name").fill("Ada");
  await page.getByLabel("I am 18 or older.").check();
  await expect(next).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await next.click();
  // The outgoing step is still fading out, so look the new heading up by name.
  await expect(
    page.getByRole("heading", { name: /Forecast the future/ }),
  ).toBeVisible();
  // Taps during a step change are ignored on purpose, so retry until each step lands.
  for (const heading of [/Prices are probabilities/, /Start in Playground mode/])
    await expect(async () => {
      await page.getByRole("button", { name: /^(Next|Get started)/ }).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible({
        timeout: 600,
      });
    }).toPass();
  await expect(async () => {
    await page
      .getByRole("button", { name: "Start with 5,000 credits" })
      .click({ timeout: 600 });
    await expect(page.locator(".market-card").first()).toBeVisible({
      timeout: 1500,
    });
  }).toPass();
  await expect(page.getByText("5,000.00").first()).toBeVisible();
});

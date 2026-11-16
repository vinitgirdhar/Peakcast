import { test, expect } from "@playwright/test";
import { choose } from "./select.js";
test("appearance persists between Settings, the app and short landing page", async ({
  page,
  isMobile,
  browserName,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Turn your view/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("link", { name: "Download for Android" }),
  ).toHaveAttribute("href", "/downloads/Wildcatter-Android.apk");
  await page.getByRole("button", { name: "Continue on the web" }).click();
  await expect(page).toHaveURL(/\/markets$/);
  await expect(page.locator(".mobile-dock")).toHaveAttribute(
    "data-glass-renderer",
    browserName === "webkit" ? "frosted" : "refraction",
  );
  await expect(page.locator(".market-card")).toHaveCount(6);
  if (!isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("custom dropdown supports mouse and keyboard and categories keep clear spacing", async ({
  page,
}) => {
  await page.goto("/markets");
  await choose(page, "Sort markets", "closing");
  await expect(
    page.getByRole("combobox", { name: "Sort markets" }),
  ).toContainText("Closing soon");
  await page.getByRole("combobox", { name: "Sort markets" }).focus();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("combobox", { name: "Sort markets" }),
  ).toContainText("Featured");
  const tabs = await page.locator(".explorer > .category-tabs").boundingBox();
  const cards = await page.locator(".market-grid").boundingBox();
  expect(cards!.y - tabs!.y - tabs!.height).toBeGreaterThanOrEqual(20);
});
test("provider editor never receives a saved key and submits workspace authorization", async ({
  page,
}) => {
  let sent = false;
  await page.route("**/api/v1/settings/providers/openai", async (route) => {
    sent = true;
    expect(route.request().headers()["x-ai-access-token"]).toBe(
      "workspace-test-access",
    );
    expect(route.request().postDataJSON().apiKey).toBe("test-new-provider-key");
    await route.fulfill({ json: { items: [] } });
  });
  await page.goto("/settings");
  await page.getByLabel("Workspace access token").fill("workspace-test-access");
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await choose(page, "Provider name", "openai");
  await page
    .getByLabel("API key", { exact: true })
    .fill("test-new-provider-key");
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Provider saved");
  expect(sent).toBeTruthy();
});

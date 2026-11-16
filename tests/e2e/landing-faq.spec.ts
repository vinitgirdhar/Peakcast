import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing FAQ supports keyboard disclosure and footer navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Footer", exact: true })
    .getByRole("link", { name: "FAQ", exact: true })
    .click();
  await expect(page).toHaveURL(/#faq$/);
  const faq = page.getByRole("region", { name: "Questions? Start here." });
  await expect(faq).toBeInViewport();
  const desktop = faq.locator("details").filter({
    hasText: "How do I install the Windows desktop app?",
  });
  await desktop.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(desktop.locator("p")).toBeVisible();
  await expect(desktop).toContainText("extract the entire ZIP");
  await page.keyboard.press("Space");
  await expect(desktop.locator("p")).toBeHidden();

  for (const summary of await faq.locator("summary").all()) {
    await summary.click();
  }
  await expect(faq).toContainText(
    "signing into the same account across devices is not currently available",
  );
  await expect(faq).toContainText("no real-money payouts");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page }).include("#faq").analyze();
  expect(audit.violations).toEqual([]);
  await expect(
    page
      .getByRole("navigation", { name: "Footer", exact: true })
      .getByRole("link", { name: "Build with our API" }),
  ).toHaveAttribute("href", "/developers");
});

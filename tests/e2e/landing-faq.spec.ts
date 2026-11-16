import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing FAQ supports keyboard disclosure and footer navigation", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Footer", exact: true })
    .getByRole("link", { name: "FAQ", exact: true })
    .click();
  await expect(page).toHaveURL(/#faq$/);
  const faq = page.getByRole("region", { name: "Questions? Start here." });
  await expect(faq).toBeInViewport();
  const desktop = faq.locator(".landing-faq-item").filter({
    hasText: "How do I install the Windows desktop app?",
  });
  const question = desktop.getByRole("button");
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(desktop.locator("p")).toBeVisible();
  await expect(desktop).toContainText("extract the entire ZIP");
  await page.keyboard.press("Space");
  await expect(desktop.locator("p")).toBeHidden();
  if (isMobile) {
    await question.tap();
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await question.tap();
    await expect(question).toHaveAttribute("aria-expanded", "false");
  }

  for (const button of await faq.getByRole("button").all()) {
    await button.focus();
    await page.keyboard.press("Enter");
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

test("FAQ opens on mouse hover and closes after leaving the answer", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Touch devices use tap instead of hover");
  await page.goto("/");
  const item = page.locator(".landing-faq-item").first();
  const question = item.getByRole("button");
  await question.hover();
  await expect(question).toHaveAttribute("aria-expanded", "true");
  await item.locator("p").hover();
  await expect(question).toHaveAttribute("aria-expanded", "true");
  await page.locator(".landing-faq-heading").hover();
  await expect(question).toHaveAttribute("aria-expanded", "false");
  await expect(item.locator("p")).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await question.hover();
  await expect(item.locator("p")).toBeVisible();
});

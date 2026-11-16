import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const backend = "https://wildcatter-p3yy.onrender.com";

// Model the separate static CDN document, which does not carry the API server's same-origin-only CSP.
test.beforeEach(async ({ page }) => {
  await page.route("**/wake/index.html*", (route) =>
    route.fulfill({ path: "public/wake/index.html", contentType: "text/html" }),
  );
  await page.route(backend + "/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "Live backend calls are isolated in this test.",
    }),
  );
});

test("cached app shell explains a slow backend and automatically resumes", async ({
  page,
}) => {
  await page.clock.install();
  let attempts = 0;
  await page.route("**/api/v1/capabilities", async (route) => {
    attempts++;
    if (attempts <= 2)
      await route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "<h1>Platform startup page</h1>",
      });
    else await route.continue();
  });
  await page.goto("/markets");
  await expect.poll(() => attempts).toBe(1);
  await page.clock.runFor(3500);
  await expect(
    page.getByRole("heading", { name: "The server is warming up." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Please allow a minute or two",
  );
  await expect.poll(() => attempts).toBe(2);
  await page.clock.runFor(3500);
  await expect(page.locator(".market-card")).toHaveCount(6);
});

test("static entry hides the platform HTML and opens only after an app image decodes", async ({
  page,
}) => {
  await page.clock.install();
  let ready = false;
  let probes = 0;
  await page.route(backend + "/icon-192.png?**", async (route) => {
    probes++;
    if (ready)
      await route.fulfill({
        path: "public/icon-192.png",
        contentType: "image/png",
      });
    else
      await route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "<h1>Render default loading page</h1>",
      });
  });
  await page.route(backend + "/", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Backend ready</h1>" }),
  );
  await page.goto("/wake/index.html");
  await expect.poll(() => probes).toBe(1);
  await page.clock.runFor(3500);
  await expect(
    page.getByRole("heading", { name: "The server is warming up." }),
  ).toBeVisible();
  await expect(page.getByText("Render default loading page")).toHaveCount(0);
  await expect.poll(() => probes).toBe(2);
  ready = true;
  await page.clock.runFor(3500);
  await expect(
    page.getByRole("heading", { name: "Backend ready" }),
  ).toBeVisible();
  await expect(page).toHaveURL(backend + "/");
});

test("static entry stops retrying after three minutes and supports a fresh attempt", async ({
  page,
}) => {
  await page.clock.install();
  let ready = false;
  let probes = 0;
  await page.route(backend + "/icon-192.png?**", async (route) => {
    probes++;
    if (ready)
      await route.fulfill({
        path: "public/icon-192.png",
        contentType: "image/png",
      });
    else
      await route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "Unavailable",
      });
  });
  await page.route(backend + "/", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Backend ready</h1>" }),
  );
  await page.goto("/wake/index.html");
  await expect.poll(() => probes).toBe(1);
  await page.clock.runFor(180_001);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  const stoppedAt = probes;
  await page.clock.runFor(30_000);
  expect(probes).toBe(stoppedAt);
  ready = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Backend ready" }),
  ).toBeVisible();
});

test("native-app entry opens the market workspace after readiness", async ({
  page,
}) => {
  await page.route(backend + "/icon-192.png?**", (route) =>
    route.fulfill({ path: "public/icon-192.png", contentType: "image/png" }),
  );
  await page.route(backend + "/markets", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Native workspace</h1>",
    }),
  );
  await page.goto("/wake/index.html?app=1");
  await expect(
    page.getByRole("heading", { name: "Native workspace" }),
  ).toBeVisible();
  await expect(page).toHaveURL(backend + "/markets");
});

test("warm-up screen respects reduced motion and stays readable on a narrow display", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(backend + "/icon-192.png?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "Unavailable",
    }),
  );
  await page.goto("/wake/index.html");
  await expect(page.locator(".startup-halo").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

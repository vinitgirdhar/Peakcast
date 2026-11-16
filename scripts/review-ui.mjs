import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { buildApp } from "../dist-server/server/app.js";
const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
mkdirSync("output/screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const theme of ["light", "dark"]) {
    for (const viewport of [
      { width: 1440, height: 1050 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        (value) => localStorage.setItem("wildcatter.theme", value),
        theme,
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const route of [
        "/",
        "/markets",
        "/markets/fed-rate",
        "/markets/fed-rate/rules",
        "/portfolio",
        "/leaderboard",
        "/settings",
        "/studio",
        "/studio/drafts",
        "/developers",
        "/developers/api",
        "/developers/setup",
      ]) {
        await page.goto(`${origin}${route}`);
        await page.locator("h1").waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() =>
          [...document.querySelectorAll(".route-surface, .landing-copy")].every(
            (element) => getComputedStyle(element).opacity === "1",
          ),
        );
        if (route === "/markets/fed-rate")
          await page.locator(".execute-button:not(:disabled)").waitFor();
        const name =
          route === "/" ? "landing" : route.replaceAll("/", "-").slice(1);
        await page.screenshot({
          path: `output/screenshots/${theme}-${viewport.width}-${name}.png`,
          fullPage: route === "/",
        });
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        report.push({
          theme,
          viewport: viewport.width,
          route,
          overflow: await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          errors: [...errors],
          glass: await page
            .locator("[data-glass-renderer]")
            .evaluateAll((elements) =>
              elements.map((element) => ({
                class: element.className,
                renderer: element.dataset.glassRenderer,
              })),
            ),
          violations: audit.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          })),
        });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await app.close();
}
writeFileSync("output/ui-review.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    report.map(({ viewport, route, overflow, errors, glass, violations }) => ({
      viewport,
      route,
      overflow,
      errors,
      glassCount: glass.length,
      violations: violations.map((violation) => ({
        id: violation.id,
        count: violation.nodes.length,
        first: violation.nodes[0],
      })),
    })),
    null,
    2,
  ),
);
if (
  report.some(
    (result) =>
      result.overflow || result.errors.length || result.violations.length,
  )
)
  process.exitCode = 1;

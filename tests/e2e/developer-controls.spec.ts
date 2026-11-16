import { choose } from "./select.js";
import { test, expect } from "@playwright/test";

test("copy credential handles browser clipboard success and denial", async ({
  page,
}) => {
  await page.goto("/developers/api");
  await expect(page.locator(".page h1")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          sessionStorage.setItem("test-copied-token", text);
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy demo API token" }).click();
  await expect(
    page.getByRole("button", { name: "Copied demo token" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        sessionStorage.getItem("test-copied-token") ===
        localStorage.getItem("wildcatter.demo.token.v1"),
    ),
  ).toBeTruthy();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    });
  });
  await page.locator(".developer-token button").click();
  await expect(page.getByRole("alert")).toContainText(
    "Clipboard access is unavailable",
  );
});

test("install control invokes the browser prompt and handles prompt failure", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/developers/setup");
  await expect(page.locator(".page h1")).toBeVisible();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", {
      value: async () => {
        sessionStorage.setItem("test-install-prompt", "called");
      },
    });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install Wildcatter" }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("test-install-prompt")),
  ).toBe("called");
  await expect(
    page.getByRole("button", { name: "Install Wildcatter" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", {
      value: async () => {
        throw new Error("Prompt unavailable");
      },
    });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install Wildcatter" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Installation could not start",
  );
  expect(errors).toEqual([]);
});

test("startup retry, unknown pages and browser history recover through visible controls", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/v1/capabilities", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: { message: "Temporary startup error." },
      });
    else await route.continue();
  });
  await page.goto("/markets");
  await expect(page.getByRole("alert")).toContainText(
    "Temporary startup error.",
  );
  fail = false;
  await page.evaluate(() => {
    document.documentElement.dataset.startupMarker = "kept";
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".market-card")).toHaveCount(6);
  await expect(page.locator("html")).toHaveAttribute(
    "data-startup-marker",
    "kept",
  );
  await page.goto("/markets/not-a-market");
  await expect(
    page.getByRole("heading", { name: "Market not found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse markets" }).click();
  await expect(page.locator(".page h1")).toHaveText("Markets");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Market not found" }),
  ).toBeVisible();
  await page.goto("/not-a-page");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse markets" }).click();
  await expect(page.locator(".market-card")).toHaveCount(6);
});

test("configured studio selects Gemini and Groq, records the chosen provider and keeps keys out of requests", async ({
  page,
}) => {
  const savedDrafts: object[] = [];
  const called: string[] = [];
  await page.route("**/api/v1/drafts", (route) =>
    route.fulfill({ json: { items: savedDrafts } }),
  );
  await page.route("**/api/v1/capabilities", (route) =>
    route.fulfill({
      json: {
        mode: "demo",
        aiConfigured: true,
        marketCount: 12,
        version: "0.1.0",
        defaultAIProvider: "groq",
        aiProviders: [
          {
            id: "gemini",
            label: "Gemini",
            model: "test-gemini-model",
            configured: true,
          },
          {
            id: "groq",
            label: "Groq",
            model: "test-groq-model",
            configured: true,
          },
          { id: "openai", label: "OpenAI", model: "", configured: false },
        ],
      },
    }),
  );
  await page.route("**/api/v1/drafts/generate**", async (route) => {
    const provider = new URL(route.request().url()).searchParams.get(
      "provider",
    )!;
    called.push(provider);
    expect(route.request().headers()["x-ai-access-token"]).toBe(
      "test-ai-access-token-only",
    );
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const saved = {
      ...route.request().postDataJSON(),
      id: `test-ui-${provider}`,
      mode: provider,
      status: "draft",
      createdAt: new Date().toISOString(),
      yesRule:
        "These rules were refined by a mocked provider, not live inference.",
      reviewNotes: ["Mocked provider response for UI verification."],
    };
    savedDrafts.unshift(saved);
    await route.fulfill({ status: 201, json: saved });
  });
  await page.goto("/studio");
  await page.getByRole("button", { name: "Use an example" }).click();
  await choose(page, "Drafting mode", "ai");
  await expect(page.getByLabel("AI provider")).toContainText("Groq");

  await page.getByLabel("AI access token").fill("test-ai-access-token-only");
  for (const [provider, label] of [
    ["gemini", "Gemini"],
    ["groq", "Groq"],
  ]) {
    await choose(page, "AI provider", provider);
    await page.getByRole("button", { name: "Refine and save with AI" }).click();
    await expect(page.getByRole("status")).toContainText(
      "AI-assisted draft saved",
    );
    await page.getByRole("button", { name: /^Saved drafts/ }).click();
    await page.locator(".saved-drafts summary").first().click();
    await expect(page.locator(".saved-drafts")).toContainText(`${label} draft`);
    await expect(page.locator(".saved-drafts")).toContainText(
      "not live inference",
    );
    await page.getByRole("button", { name: "New draft", exact: true }).click();
  }
  expect(called).toEqual(["gemini", "groq"]);
});

import { _electron } from "playwright";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const executablePath = resolve("release/Wildcatter-win32-x64/Wildcatter.exe");
assert.ok(existsSync(executablePath), "Run npm run desktop:package first");
mkdirSync("output/screenshots", { recursive: true });
let token;
const desktopEnvironment = { ...process.env };
const profile = mkdtempSync(join(tmpdir(), "wildcatter-desktop-smoke-"));
const mainErrorLog = join(profile, "main-errors.log");
desktopEnvironment.AI_SETTINGS_DIR = join(profile, "providers");
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "AI_ACCESS_TOKEN",
  "OLLAMA_ENABLED",
])
  delete desktopEnvironment[key];
for (let launch = 0; launch < 2; launch++) {
  const electron = await _electron.launch({
    executablePath,
    args: ["--user-data-dir=" + profile],
    env: desktopEnvironment,
    timeout: 45_000,
  });
  try {
    await electron.evaluate(({ app }, path) => {
      const fs = process.getBuiltinModule("fs");
      process.on("uncaughtException", (error) => {
        fs.appendFileSync(path, error.stack + "\n");
        app.exit(1);
      });
    }, mainErrorLog);
    assert.equal(
      resolve(await electron.evaluate(({ app }) => app.getPath("userData"))),
      resolve(profile),
      "Desktop smoke checks must never write to the user's profile",
    );
    const page = await electron.firstWindow();
    if (launch === 0) {
      // A fresh install onboards before the workspace opens.
      await page.getByRole("button", { name: "Skip" }).click();
      await page.getByLabel("Display name").fill("Desktop smoke");
      await page.getByLabel("I am 18 or older.").check();
      await page.getByRole("checkbox", { name: /I agree/ }).check();
      await page
        .getByRole("button", { name: "Start with 5,000 credits" })
        .click();
    }
    await page.locator(".page h1").waitFor();
    const current = await page.evaluate(() =>
      localStorage.getItem("wildcatter.demo.token.v1"),
    );
    assert.ok(current, "Desktop initialized its demo account");
    if (launch === 0) token = current;
    else
      assert.equal(
        current,
        token,
        "Desktop session survives restart on its stable origin",
      );
    const preferences = await electron.evaluate(({ BrowserWindow }) => {
      const preferences =
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        nodeIntegration: preferences.nodeIntegration,
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
      };
    });
    assert.deepEqual(preferences, {
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true,
    });
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    assert.ok(await page.locator(".desktop-sidebar").isVisible());
    const api = await page.evaluate(async () =>
      (await fetch("/api/v1/capabilities")).json(),
    );
    assert.equal(api.mode, "demo");
    for (const [label, heading] of [
      [/^Portfolio$/, "Your portfolio"],
      [/^Draft studio/, "Draft studio"],
      [/^Developers$/, "Developer tools"],
      [/^Markets$/, "Markets"],
    ]) {
      await page
        .locator(".desktop-sidebar nav")
        .getByRole("button", { name: label })
        .click();
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    }
    if (launch === 0) {
      await electron.evaluate(({ shell }) => {
        globalThis.desktopSmokeLinks = [];
        shell.openExternal = async (url) => {
          globalThis.desktopSmokeLinks.push(url);
        };
      });
      const marketId = await page.evaluate(async () => {
        const headers = {
          "Content-Type": "application/json",
          Authorization:
            "Bearer " + localStorage.getItem("wildcatter.demo.token.v1"),
        };
        const post = async (url, body) => {
          const response = await fetch("/api/v1" + url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
          if (!response.ok) throw new Error("Desktop link fixture failed");
          return response.json();
        };
        const draft = await post("/drafts", {
          question:
            "Will the desktop link regression finish before its deadline?",
          sourceName: "Desktop test source",
          sourceUrl: "https://example.org/desktop-source",
          closesAt: new Date(Date.now() + 86_400_000).toISOString(),
          yesRule:
            "The declared source reports a qualifying result before the deadline.",
          noRule:
            "No qualifying result is recorded before the declared deadline.",
          invalidRule:
            "The declared source is missing or does not provide a complete record.",
        });
        const market = await post(`/drafts/${draft.id}/launch`, {
          category: "Science",
        });
        await post(`/markets/${market.id}/resolution`, {
          outcome: "YES",
          evidenceUrl: "https://example.org/desktop-evidence",
        });
        return market.id;
      });
      const origin = new URL(page.url()).origin;
      await page.goto(`${origin}/markets/${marketId}/rules`);
      await page.locator(".rules-section a").click();
      await page.waitForFunction(() => document.readyState === "complete");
      for (let attempt = 0; attempt < 30; attempt++) {
        if (
          (
            await electron.evaluate(() => globalThis.desktopSmokeLinks)
          ).includes("https://example.org/desktop-source")
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.deepEqual(
        await electron.evaluate(() => globalThis.desktopSmokeLinks),
        ["https://example.org/desktop-source"],
        "A creator's declared HTTPS source must open in the system browser",
      );
      await page.goto(`${origin}/markets/${marketId}`);
      await page.getByRole("link", { name: /Evidence/ }).click();
      for (let attempt = 0; attempt < 30; attempt++) {
        if (
          (await electron.evaluate(() => globalThis.desktopSmokeLinks))
            .length === 2
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.deepEqual(
        await electron.evaluate(() => globalThis.desktopSmokeLinks),
        [
          "https://example.org/desktop-source",
          "https://example.org/desktop-evidence",
        ],
        "Resolution evidence must open in the system browser",
      );
      await page.evaluate(() => {
        for (const url of [
          "https://example.org/unlisted",
          "https://user:pass@example.org/desktop-source",
          "http://example.org/desktop-source",
          "file:///C:/Windows/win.ini",
        ])
          window.open(url, "_blank");
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(
        (await electron.evaluate(() => globalThis.desktopSmokeLinks)).length,
        2,
        "Unlisted URLs, credentials, HTTP and file links remain blocked",
      );
      await page.goto(origin + "/markets");
      await page.screenshot({ path: "output/screenshots/windows-app.png" });
    }
    await page.evaluate(() => {
      for (let i = 0; i < 30; i++)
        void fetch(`/api/v1/capabilities?shutdown=${i}`).catch(() => {});
    });
  } finally {
    await electron.close();
  }
  assert.equal(
    existsSync(mainErrorLog) ? readFileSync(mainErrorLog, "utf8") : "",
    "",
    "Closing with background requests must not access destroyed windows",
  );
}
console.log(
  "Windows desktop passed: isolated packaged launch, navigation, local API, renderer isolation, creator source/evidence links, blocked unsafe links and session persistence across restart.",
);

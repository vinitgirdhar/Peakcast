import { _electron } from "playwright";
import { resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const executablePath = resolve("release/Wildcatter-win32-x64/Wildcatter.exe");
assert.ok(existsSync(executablePath), "Run npm run desktop:package first");
mkdirSync("output/screenshots", { recursive: true });
let token;
const desktopEnvironment = { ...process.env };
delete desktopEnvironment.ELECTRON_RUN_AS_NODE;
for (let launch = 0; launch < 2; launch++) {
  const electron = await _electron.launch({
    executablePath,
    env: desktopEnvironment,
    timeout: 45_000,
  });
  try {
    const page = await electron.firstWindow();
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
    if (launch === 0)
      await page.screenshot({ path: "output/screenshots/windows-app.png" });
  } finally {
    await electron.close();
  }
}
console.log(
  "Windows desktop passed: packaged launch, sidebar navigation, local API, renderer isolation and session persistence across restart.",
);

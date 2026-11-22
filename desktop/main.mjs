import { randomBytes } from "node:crypto";
import { app, BrowserWindow, dialog, session, shell } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../dist-server/server/app.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let api;
let origin;
let window;

async function openWindow() {
  window = new BrowserWindow({
    title: "Wildcatter",
    width: 1440,
    height: 960,
    minWidth: 375,
    minHeight: 640,
    backgroundColor: "#f7f8fa",
    autoHideMenuBar: true,
    icon: join(root, "dist/icon-512.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (URL.canParse(url)) {
      const target = new URL(url);
      if (target.protocol === "https:" && !target.username && !target.password)
        void api
          .inject({ method: "GET", url: "/api/v1/markets" })
          .then(async (response) => {
            // Include creator sources and resolution evidence, not just seed domains.
            if (
              response.statusCode === 200 &&
              response
                .json()
                .items.some((market) =>
                  [market.sourceUrl, market.resolution?.evidenceUrl].some(
                    (link) => link && new URL(link).href === target.href,
                  ),
                )
            )
              await shell.openExternal(target.href);
          })
          .catch(() =>
            dialog.showErrorBox(
              "Link could not open",
              "Please try opening this market's source or evidence in your browser.",
            ),
          );
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  await window.loadURL(origin + "/markets");
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback) =>
          callback(
            permission === "clipboard-sanitized-write" &&
              new URL(contents.getURL()).origin === origin,
          ),
      );
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission) =>
          permission === "clipboard-sanitized-write" &&
          Boolean(contents && new URL(contents.getURL()).origin === origin),
      );
      process.env.AI_ACCESS_TOKEN ||= randomBytes(32).toString("hex");
      process.env.AI_SETTINGS_DIR ||= join(
        app.getPath("userData"),
        "providers",
      );
      api = await buildApp({
        managedAI: true,
        databasePath: join(app.getPath("userData"), "wildcatter.sqlite"),
        staticRoot: join(root, "dist"),
      });
      // A stable loopback origin preserves the desktop session's browser storage across launches.
      origin = await api.listen({ host: "127.0.0.1", port: 43127 });
      session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ["http://127.0.0.1/*"] },
        (details, callback) => {
          const url = new URL(details.url);
          if (
            window &&
            !window.isDestroyed() &&
            !window.webContents.isDestroyed() &&
            details.webContentsId === window.webContents.id &&
            url.origin === origin &&
            (url.pathname.startsWith("/api/v1/settings/") ||
              url.pathname === "/api/v1/drafts/generate")
          )
            details.requestHeaders["X-AI-Access-Token"] =
              process.env.AI_ACCESS_TOKEN;
          callback({ requestHeaders: details.requestHeaders });
        },
      );
      await openWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void openWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox("Wildcatter could not start", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    if (api) void api.close();
  });
}

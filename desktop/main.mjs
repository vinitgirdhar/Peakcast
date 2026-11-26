import {
  app,
  BrowserWindow,
  dialog,
  net,
  protocol,
  session,
  shell,
} from "electron";
import { extname, join, dirname, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Peakcast runs entirely inside the window (src/local): the web build is served
// from a private app:// origin, and the user's data lives in that origin's
// browser storage under the app's user-data folder. No server, no network.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const origin = "app://peakcast";
// Node's URL reports "null" as the origin of custom schemes, so compare prefixes.
const inApp = (url) => url === origin || url.startsWith(origin + "/");
let window;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    // standard + secure: a real origin with IndexedDB, crypto.randomUUID and fetch.
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

/** A bundled file, or the app shell for client-side routes such as /markets/fed-rate. */
function serve(request) {
  const { pathname } = new URL(request.url);
  let file = normalize(join(dist, decodeURIComponent(pathname)));
  if (file !== dist && !file.startsWith(dist + sep))
    return new Response("Not found", { status: 404 });
  if (!extname(file)) file = join(dist, "index.html");
  return net.fetch(pathToFileURL(file).toString());
}

/** HTTPS links the user's own markets and drafts declare as sources or evidence. */
function declaredLinks(contents) {
  return contents.executeJavaScript(`(async () => {
    const token = localStorage.getItem("peakcast.token.v1");
    const get = async (path) => {
      const response = await fetch("/api/v1" + path, {
        headers: token ? { Authorization: "Bearer " + token } : {},
      });
      return response.ok ? (await response.json()).items : [];
    };
    const [markets, drafts] = await Promise.all([
      get("/markets"),
      token ? get("/drafts") : [],
    ]);
    return [
      ...markets.flatMap((market) => [market.sourceUrl, market.resolution?.evidenceUrl]),
      ...drafts.map((draft) => draft.sourceUrl),
    ].filter(Boolean);
  })()`);
}

async function openWindow() {
  window = new BrowserWindow({
    title: "Peakcast",
    width: 1440,
    height: 960,
    minWidth: 375,
    minHeight: 640,
    backgroundColor: "#f7f8fa",
    autoHideMenuBar: true,
    icon: join(dist, "icon-512.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (URL.canParse(url)) {
      const target = new URL(url);
      // Only a declared source or evidence link opens, and only in the browser.
      if (target.protocol === "https:" && !target.username && !target.password)
        void declaredLinks(contents)
          .then(async (links) => {
            if (links.some((link) => new URL(link).href === target.href))
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
  contents.on("will-navigate", (event, url) => {
    if (!inApp(url)) event.preventDefault();
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
      protocol.handle("app", serve);
      const allowed = (contents, permission) =>
        permission === "clipboard-sanitized-write" &&
        Boolean(contents && inApp(contents.getURL()));
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback) =>
          callback(allowed(contents, permission)),
      );
      session.defaultSession.setPermissionCheckHandler(allowed);
      await openWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void openWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox("Peakcast could not start", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

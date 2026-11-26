import { packager } from "@electron/packager";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const exclusions = [
  // Allowlist: only these top-level entries ship, so stray folders (video
  // renders, reports, worktrees) can never bloat the app.
  // The app runs in the window from dist/; main.mjs needs only Electron itself.
  /^\/(?!(?:dist|desktop)(?:\/|$)|package\.json$)/,
  /\.pdf$/i,
  /^\/\.env($|\.)/,
  /^\/\.(git|claude)(\/|$)/,
];
for (const path of [
  "/data/peakcast.sqlite",
  "/.env",
  "/.env.example",
  "/AI_Prediction_Market_Platform_RFP.pdf",
  "/release/old.exe",
  "/.claude/launch.json",
  "/brag-output-2026-11-16-192506/render.mp4",
  "/index.html",
  "/node_modules/fastify/package.json",
  "/dist-server/server/app.js",
])
  assert.ok(
    exclusions.some((pattern) => pattern.test(path)),
    `Packaging must exclude ${path}`,
  );
for (const path of ["/dist/index.html", "/desktop/main.mjs", "/package.json"])
  assert.ok(
    !exclusions.some((pattern) => pattern.test(path)),
    `Packaging must include ${path}`,
  );

const electronPackage = JSON.parse(
  readFileSync("node_modules/electron/package.json", "utf8"),
);
const archiveName = `electron-v${electronPackage.version}-win32-x64.zip`;
const localArchive = resolve("tmp/electron", archiveName);
if (existsSync(localArchive)) {
  const checksums = JSON.parse(
    readFileSync("node_modules/electron/checksums.json", "utf8"),
  );
  assert.equal(
    createHash("sha256").update(readFileSync(localArchive)).digest("hex"),
    checksums[archiveName],
    "Electron archive checksum must match the published package",
  );
}

const paths = await packager({
  dir: ".",
  name: "Peakcast",
  icon: resolve("public/icon.ico"),
  platform: "win32",
  arch: "x64",
  out: "release",
  overwrite: true,
  asar: true,
  prune: true,
  ignore: exclusions,
  ...(existsSync(localArchive)
    ? { electronZipDir: resolve("tmp/electron") }
    : {}),
});
console.log(`Windows desktop bundle: ${paths.join(", ")}`);

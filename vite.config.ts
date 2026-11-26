import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

const local = (file: string) =>
  fileURLToPath(new URL(`./src/local/${file}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  resolve: {
    // The shared server code (server/) runs inside the app on the device;
    // these stand in for the Node built-ins it imports. See src/local/.
    alias: [
      { find: /^node:sqlite$/, replacement: local("sqlite.ts") },
      { find: /^node:crypto$/, replacement: local("node-crypto.ts") },
      { find: /^node:(fs|path)$/, replacement: local("node-fs.ts") },
    ],
  },
  // The default CSS minifier keeps only -webkit-backdrop-filter, which Chromium
  // (and the Electron app) ignores, so every blur vanished from production builds.
  build: { cssMinify: "esbuild" },
  server: { port: 5173, strictPort: true },
});

import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

// The API only accepts same-origin browser requests, so the dev proxy must
// forward the browser's own Host header instead of the API's.
const api: ProxyOptions = {
  target: "http://127.0.0.1:3001",
  configure: (proxy) =>
    proxy.on("proxyReq", (proxyRequest, request) => {
      if (request.headers.host)
        proxyRequest.setHeader("host", request.headers.host);
    }),
};

export default defineConfig({
  plugins: [react()],
  // The default CSS minifier keeps only -webkit-backdrop-filter, which Chromium
  // (and the Electron app) ignores, so every blur vanished from production builds.
  build: { cssMinify: "esbuild" },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": api, "/api-docs": api },
  },
});

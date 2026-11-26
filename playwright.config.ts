import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  // The built web app (npm run build:web) on a static server: the app runs its
  // own on-device engine, so there is no API server. Each test gets fresh storage.
  webServer: {
    command: "npx vite preview --host 127.0.0.1 --port 3101 --strictPort",
    url: "http://127.0.0.1:3101/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

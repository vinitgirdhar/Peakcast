// Tests must never read values from the developer's .env; each test file sets
// exactly the environment it needs.
for (const name of [
  "OPERATOR_TOKEN",
  "DISPUTE_WINDOW_SECONDS",
  "WINDOWS_DOWNLOAD_URL",
  "ANDROID_DOWNLOAD_URL",
  "RENDER_EXTERNAL_URL",
  "PUBLIC_ORIGIN",
])
  delete process.env[name];

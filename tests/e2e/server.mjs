import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../../dist-server/server/app.js";

// Browser journeys are isolated from local data, paid AI credentials and per-IP rate counters.
for (const key of [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "AI_ACCESS_TOKEN",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "AI_DEFAULT_PROVIDER",
])
  delete process.env[key];
// Test-only value; the lifecycle journey rules a disputed market with it.
process.env.OPERATOR_TOKEN = "e2e-operator-test-token";
process.env.AI_SETTINGS_DIR = mkdtempSync(join(tmpdir(), "wildcatter-e2e-"));
const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
await app.listen({ host: "127.0.0.1", port: 3101 });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close();
  });

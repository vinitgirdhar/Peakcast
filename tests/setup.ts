import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests must never read the developer's saved provider keys in data/providers
// or the keys in .env; each test file sets exactly the environment it needs.
process.env.AI_SETTINGS_DIR = mkdtempSync(join(tmpdir(), "wildcatter-test-"));
for (const name of [
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "AI_ACCESS_TOKEN",
  "AI_DEFAULT_PROVIDER",
  "OLLAMA_ENABLED",
  "OPERATOR_TOKEN",
  "DISPUTE_WINDOW_SECONDS",
  "WINDOWS_DOWNLOAD_URL",
  "RENDER_EXTERNAL_URL",
])
  delete process.env[name];

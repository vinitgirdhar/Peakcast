import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AIProvider } from "../shared/types.js";
import { DomainError } from "./database.js";

export interface ProviderSettings {
  model: string;
  apiKey: string;
  enabled: boolean;
}
const ids = ["gemini", "groq", "openai", "ollama"];
function file(provider: AIProvider) {
  if (!ids.includes(provider)) throw new DomainError("Unknown AI provider.");
  return join(
    resolve(process.env.AI_SETTINGS_DIR ?? "data/providers"),
    `${provider}.json`,
  );
}
export function providerSettings(provider: AIProvider): ProviderSettings {
  const defaults = {
    gemini: "gemini-3.5-flash-lite",
    groq: "openai/gpt-oss-20b",
    openai: "",
    ollama: "llama3.2",
  };
  const path = file(provider);
  if (existsSync(path)) {
    try {
      const value = JSON.parse(readFileSync(path, "utf8"));
      if (
        typeof value.model !== "string" ||
        typeof value.apiKey !== "string" ||
        typeof value.enabled !== "boolean"
      )
        throw new Error();
      return value;
    } catch {
      throw new DomainError(
        "Saved provider configuration could not be read.",
        500,
      );
    }
  }
  return {
    model: process.env[`${provider.toUpperCase()}_MODEL`] || defaults[provider],
    apiKey: process.env[`${provider.toUpperCase()}_API_KEY`] ?? "",
    enabled: provider !== "ollama" || process.env.OLLAMA_ENABLED === "true",
  };
}
export function saveProvider(
  provider: AIProvider,
  input: { model: string; apiKey?: string },
  remove = false,
) {
  const previous = providerSettings(provider);
  const next = {
    model: input.model,
    apiKey: remove ? "" : input.apiKey || previous.apiKey,
    enabled: !remove,
  };
  if (!remove && provider !== "ollama" && !next.apiKey)
    throw new DomainError("Enter an API key to add this provider.");
  const path = file(provider);
  const directory = resolve(path, "..");
  mkdirSync(directory, { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
  renameSync(temporary, path);
}

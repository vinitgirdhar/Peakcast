import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../server/app.js";
import { generateDraft } from "../server/ai.js";
test("provider management requires workspace access, persists edits/removal and never returns a key", async () => {
  const directory = mkdtempSync(join(tmpdir(), "wildcatter-settings-"));
  const keys = [
    "AI_SETTINGS_DIR",
    "AI_ACCESS_TOKEN",
    "GEMINI_API_KEY",
    "OLLAMA_ENABLED",
    "OLLAMA_MODEL",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const original = globalThis.fetch;
  process.env.AI_SETTINGS_DIR = directory;
  process.env.AI_ACCESS_TOKEN = "settings-test-access-token";
  process.env.GEMINI_API_KEY = "env-key-that-must-stay-removed";
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    const session = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json();
    const headers = {
      authorization: `Bearer ${session.token}`,
      "x-ai-access-token": process.env.AI_ACCESS_TOKEN,
    };
    const payload = { model: "example-model", apiKey: "new-test-provider-key" };
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: "/api/v1/settings/providers/gemini",
          payload,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: "/api/v1/settings/providers/gemini",
          headers: { authorization: headers.authorization },
          payload,
        })
      ).statusCode,
      403,
    );
    const saved = await app.inject({
      method: "PUT",
      url: "/api/v1/settings/providers/gemini",
      headers,
      payload,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.ok(!saved.body.includes(payload.apiKey));
    assert.equal(
      saved.json().items.find((p: { id: string }) => p.id === "gemini").model,
      "example-model",
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: "/api/v1/settings/providers/gemini",
          headers,
          payload: { model: "next-model" },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/v1/settings/providers/gemini",
          headers,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject("/api/v1/capabilities"))
        .json()
        .aiProviders.find((p: { id: string }) => p.id === "gemini").configured,
      false,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: "/api/v1/settings/providers/unknown",
          headers,
          payload,
        })
      ).statusCode,
      400,
    );
    await app.inject({
      method: "PUT",
      url: "/api/v1/settings/providers/ollama",
      headers,
      payload: { model: "local-test" },
    });
    globalThis.fetch = async (url) => {
      assert.equal(String(url), "http://127.0.0.1:11434/api/tags");
      return Response.json({ models: [{ name: "local-test" }] });
    };
    assert.deepEqual(
      (await app.inject({ url: "/api/v1/settings/ollama", headers })).json(),
      { available: true, models: ["local-test"] },
    );
    const draft = {
      question: "Will a verifiable result occur by the deadline?",
      sourceName: "Official source",
      sourceUrl: "https://example.org/results",
      closesAt: "2099-01-01T00:00:00.000Z",
      yesRule:
        "The official source records a qualifying event before the deadline.",
      noRule:
        "The complete record contains no qualifying event before the deadline.",
      invalidRule:
        "Missing or ambiguous evidence requires human review before resolution.",
    };
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:11434/api/chat");
      assert.equal(JSON.parse(String(init?.body)).stream, false);
      return Response.json({
        done: true,
        message: { content: JSON.stringify(draft) },
      });
    };
    assert.deepEqual(await generateDraft(draft, "ollama"), draft);
    globalThis.fetch = async () => {
      throw new Error("unavailable");
    };
    assert.equal(
      (await app.inject({ url: "/api/v1/settings/ollama", headers })).json()
        .available,
      false,
    );
  } finally {
    await app.close();
    globalThis.fetch = original;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

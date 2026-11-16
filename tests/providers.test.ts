import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateDraft,
  getAIProviders,
  getDefaultAIProvider,
} from "../server/ai.js";
import { buildApp } from "../server/app.js";

const draft = {
  question: "Will the official source report a result above 10 by closing?",
  sourceName: "Official source",
  sourceUrl: "https://example.org/results",
  closesAt: "2099-01-01T00:00:00.000Z",
  yesRule:
    "The official source reports a result strictly above 10 before closing.",
  noRule: "The complete source record has no result above 10 before closing.",
  invalidRule:
    "If the source record is incomplete, hold the outcome for human review.",
};

test("multiple AI providers route explicitly, validate output and keep errors private", async (t) => {
  const keys = [
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "GEMINI_MODEL",
    "GROQ_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "AI_DEFAULT_PROVIDER",
    "AI_ACCESS_TOKEN",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const originalFetch = globalThis.fetch;
  for (const key of keys) delete process.env[key];
  process.env.GEMINI_API_KEY = "test-gemini-secret";
  process.env.GROQ_API_KEY = "test-groq-secret";
  process.env.AI_ACCESS_TOKEN = "test-workspace-access-token";
  process.env.AI_DEFAULT_PROVIDER = "groq";
  try {
    await t.test(
      "capabilities list configured providers without credentials",
      async () => {
        assert.equal(getDefaultAIProvider(), "groq");
        process.env.AI_DEFAULT_PROVIDER = "not-a-provider";
        assert.equal(getDefaultAIProvider(), "gemini");
        process.env.AI_DEFAULT_PROVIDER = "groq";
        const providers = getAIProviders();
        assert.equal(providers.filter((p) => p.configured).length, 2);
        assert.equal(
          providers.find((p) => p.id === "openai")?.configured,
          false,
        );
        const app = await buildApp({
          databasePath: ":memory:",
          rateLimiting: false,
        });
        try {
          const response = await app.inject("/api/v1/capabilities");
          assert.equal(response.json().aiConfigured, true);
          assert.equal(response.json().defaultAIProvider, "groq");
          assert.equal(response.json().aiProviders.length, 4);
          assert.ok(!response.body.includes("secret"));
          assert.ok(!response.body.includes(process.env.AI_ACCESS_TOKEN!));
        } finally {
          await app.close();
        }
      },
    );
    for (const provider of ["gemini", "groq"] as const) {
      await t.test(
        `${provider} uses its own HTTPS endpoint and validates a completed draft`,
        async () => {
          let calls = 0;
          globalThis.fetch = async (url, init) => {
            calls++;
            assert.equal(
              new URL(String(url)).hostname,
              provider === "gemini"
                ? "generativelanguage.googleapis.com"
                : "api.groq.com",
            );
            const body = JSON.parse(String(init?.body));
            assert.ok(String(init?.body).includes(draft.sourceUrl));
            if (provider === "gemini") {
              assert.equal(
                new Headers(init?.headers).get("x-goog-api-key"),
                "test-gemini-secret",
              );
              assert.equal(
                body.generationConfig.responseMimeType,
                "application/json",
              );
            } else {
              assert.equal(
                new Headers(init?.headers).get("authorization"),
                "Bearer test-groq-secret",
              );
              assert.equal(body.response_format.json_schema.strict, true);
            }
            return Response.json(
              provider === "gemini"
                ? {
                    candidates: [
                      {
                        finishReason: "STOP",
                        content: { parts: [{ text: JSON.stringify(draft) }] },
                      },
                    ],
                  }
                : {
                    choices: [
                      {
                        finish_reason: "stop",
                        message: { content: JSON.stringify(draft) },
                      },
                    ],
                  },
            );
          };
          assert.deepEqual(await generateDraft(draft, provider), draft);
          assert.equal(calls, 1);
        },
      );
      await t.test(
        `${provider} rejects refusal, incomplete output, invalid rules and changed sources`,
        async () => {
          for (const value of [
            null,
            "not JSON",
            { ...draft, yesRule: "" },
            { ...draft, sourceName: "Changed source" },
          ]) {
            globalThis.fetch = async () =>
              Response.json(
                provider === "gemini"
                  ? {
                      candidates: [
                        {
                          finishReason: value ? "STOP" : "MAX_TOKENS",
                          content: {
                            parts: value
                              ? [
                                  {
                                    text:
                                      typeof value === "string"
                                        ? value
                                        : JSON.stringify(value),
                                  },
                                ]
                              : [],
                          },
                        },
                      ],
                    }
                  : {
                      choices: [
                        {
                          finish_reason: value ? "stop" : "length",
                          message: {
                            content: value
                              ? typeof value === "string"
                                ? value
                                : JSON.stringify(value)
                              : null,
                          },
                        },
                      ],
                    },
              );
            await assert.rejects(
              generateDraft(draft, provider),
              (error: unknown) =>
                (error as { statusCode: number }).statusCode === 502,
            );
          }
        },
      );
      await t.test(
        `${provider} does not retry/fallback or leak provider errors`,
        async () => {
          for (const status of [401, 403, 429, 500]) {
            let calls = 0;
            globalThis.fetch = async () => {
              calls++;
              return Response.json(
                { error: { message: "PRIVATE_PROVIDER_DETAILS" } },
                { status },
              );
            };
            await assert.rejects(
              generateDraft(draft, provider),
              (error: unknown) =>
                (error as { statusCode: number }).statusCode === 502 &&
                !(error as Error).message.includes("PRIVATE_PROVIDER_DETAILS"),
            );
            assert.equal(calls, 1);
          }
          globalThis.fetch = async () => {
            throw new Error("PRIVATE_CONNECTION_DETAILS");
          };
          await assert.rejects(
            generateDraft(draft, provider),
            (error: unknown) =>
              !(error as Error).message.includes("PRIVATE_CONNECTION_DETAILS"),
          );
        },
      );
    }
    await t.test(
      "provider query is validated, authorized, recorded and private across accounts",
      async () => {
        let calls = 0;
        const app = await buildApp({
          databasePath: ":memory:",
          rateLimiting: false,
          draftGenerator: async (input, provider) => {
            calls++;
            assert.equal(provider, "groq");
            return input;
          },
        });
        try {
          const token = (
            await app.inject({ method: "POST", url: "/api/v1/sessions" })
          ).json().token;
          const headers = {
            authorization: `Bearer ${token}`,
            "x-ai-access-token": process.env.AI_ACCESS_TOKEN!,
          };
          for (const query of ["provider=unknown", "provider=groq&extra=bad"]) {
            assert.equal(
              (
                await app.inject({
                  method: "POST",
                  url: `/api/v1/drafts/generate?${query}`,
                  headers,
                  payload: draft,
                })
              ).statusCode,
              400,
            );
          }
          assert.equal(
            (
              await app.inject({
                method: "POST",
                url: "/api/v1/drafts/generate?provider=groq",
                headers: {
                  ...headers,
                  "x-ai-access-token": "incorrect-access-token",
                },
                payload: draft,
              })
            ).statusCode,
            403,
          );
          const saved = await app.inject({
            method: "POST",
            url: "/api/v1/drafts/generate?provider=groq",
            headers,
            payload: draft,
          });
          assert.equal(saved.statusCode, 201, saved.body);
          assert.equal(saved.json().mode, "groq");
          assert.equal(
            (await app.inject({ url: "/api/v1/drafts", headers })).json()
              .items[0].mode,
            "groq",
          );
          const other = (
            await app.inject({ method: "POST", url: "/api/v1/sessions" })
          ).json().token;
          assert.equal(
            (
              await app.inject({
                url: "/api/v1/drafts",
                headers: { authorization: `Bearer ${other}` },
              })
            ).json().items.length,
            0,
          );
          assert.equal(calls, 1);
        } finally {
          await app.close();
        }
      },
    );
    await t.test(
      "missing provider cannot silently use another provider",
      async () => {
        await assert.rejects(
          generateDraft(draft, "openai"),
          (error: unknown) =>
            (error as { statusCode: number }).statusCode === 503,
        );
        globalThis.fetch = async () => {
          throw new DOMException("PRIVATE_TIMEOUT_DETAILS", "TimeoutError");
        };
        await assert.rejects(
          generateDraft(draft, "gemini"),
          (error: unknown) =>
            (error as Error).message.includes("took too long") &&
            !(error as Error).message.includes("PRIVATE_TIMEOUT_DETAILS"),
        );
        delete process.env.GEMINI_API_KEY;
        delete process.env.GROQ_API_KEY;
        assert.equal(getDefaultAIProvider(), undefined);
        await assert.rejects(
          generateDraft(draft),
          (error: unknown) =>
            (error as { statusCode: number }).statusCode === 503,
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

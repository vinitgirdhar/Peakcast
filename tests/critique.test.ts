import { test } from "node:test";
import assert from "node:assert/strict";
import { critiqueDraft } from "../server/ai.js";
import { buildApp } from "../server/app.js";
import { DomainError } from "../server/database.js";
import type { DraftInput } from "../shared/types.js";

const draft: DraftInput = {
  question: "Will Bitcoin go above $100k in 2027?",
  sourceName: "Coinbase BTC-USD candles",
  sourceUrl: "https://www.coinbase.com/price/bitcoin",
  closesAt: "2099-01-01T00:00:00.000Z",
  yesRule:
    "Resolves YES if a Coinbase BTC-USD one-minute candle closes above 100,000 USD during 2027.",
  noRule: "Otherwise, resolves NO.",
  invalidRule:
    "If Coinbase does not publish candles for 2027 within 30 days, INVALID.",
};
const finding = {
  field: "yesRule",
  severity: "warn",
  message: "Closing price or intraday high is unclear.",
  suggestion: 'Say "closes above" or "trades above".',
  quote: "ONE-MINUTE CANDLE",
};
const critique = { summary: "One ambiguity remains.", findings: [finding] };

const completed = (value: unknown) => ({
  object: "response",
  status: "completed",
  output: [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: typeof value === "string" ? value : JSON.stringify(value),
        },
      ],
    },
  ],
});

test("AI critique is advisory, schema-checked and never saved", async (t) => {
  const keys = ["OPENAI_API_KEY", "OPENAI_MODEL", "AI_ACCESS_TOKEN"];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-placeholder-not-a-real-provider-key";
  process.env.OPENAI_MODEL = "test-structured-model";
  process.env.AI_ACCESS_TOKEN = "critique-test-access-token";
  let lastRequest: { input: string; text: { format: { name: string } } };
  const respond = (body: unknown, status = 200) => {
    globalThis.fetch = async (_url, init) => {
      lastRequest = JSON.parse(String(init?.body));
      return Response.json(body, { status });
    };
  };
  const isProviderError = (error: unknown) =>
    error instanceof DomainError && error.statusCode === 502;
  try {
    await t.test(
      "valid output returns; quotes not in their field are dropped",
      async () => {
        respond(
          completed({
            ...critique,
            findings: [
              finding,
              { ...finding, field: "noRule", quote: "one-minute candle" },
              { ...finding, quote: "" },
            ],
          }),
        );
        const result = await critiqueDraft(draft);
        assert.deepEqual(result, {
          provider: "openai",
          summary: critique.summary,
          findings: [finding],
        });
        assert.equal(lastRequest.text.format.name, "draft_critique");
        const sent = JSON.parse(lastRequest.input);
        assert.deepEqual(sent.draft, draft);
        assert.ok(Array.isArray(sent.deterministicFindings));
      },
    );
    await t.test(
      "too many findings, a block severity or malformed output is a provider error",
      async () => {
        for (const invalid of [
          { ...critique, findings: Array(9).fill(finding) },
          { ...critique, findings: [{ ...finding, severity: "block" }] },
          { ...critique, summary: "x".repeat(401) },
          { ...critique, extra: true },
          "not JSON",
        ]) {
          respond(completed(invalid));
          await assert.rejects(critiqueDraft(draft), isProviderError);
        }
      },
    );
    await t.test(
      "refusal, incomplete output and upstream errors return 502",
      async () => {
        for (const body of [
          { status: "incomplete", output: [] },
          {
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "refusal", refusal: "Cannot review." }],
              },
            ],
          },
        ]) {
          respond(body);
          await assert.rejects(critiqueDraft(draft), isProviderError);
        }
        respond({ error: { message: "PRIVATE_PROVIDER_DETAILS" } }, 500);
        await assert.rejects(
          critiqueDraft(draft),
          (error) =>
            isProviderError(error) &&
            !(error as Error).message.includes("PRIVATE_PROVIDER_DETAILS"),
        );
      },
    );
    await t.test(
      "the route is gated like generation and changes nothing",
      async () => {
        const app = await buildApp({
          databasePath: ":memory:",
          rateLimiting: false,
        });
        try {
          const token = (
            await app.inject({ method: "POST", url: "/api/v1/sessions" })
          ).json().token;
          const headers = {
            authorization: `Bearer ${token}`,
            "x-ai-access-token": process.env.AI_ACCESS_TOKEN!,
          };
          const saved = (
            await app.inject({
              method: "POST",
              url: "/api/v1/drafts",
              headers,
              payload: draft,
            })
          ).json();
          const critiqueRequest = (extra: Record<string, string> = {}) =>
            app.inject({
              method: "POST",
              url: "/api/v1/drafts/critique?provider=openai",
              headers: { ...headers, ...extra },
              payload: draft,
            });
          respond(completed(critique));
          assert.equal(
            (
              await critiqueRequest({
                "x-ai-access-token": "wrong-access-token-value",
              })
            ).statusCode,
            403,
          );
          const reviewed = await critiqueRequest();
          assert.equal(reviewed.statusCode, 200, reviewed.body);
          assert.deepEqual(reviewed.json(), {
            provider: "openai",
            ...critique,
          });
          respond(completed({ ...critique, findings: Array(9).fill(finding) }));
          assert.equal((await critiqueRequest()).statusCode, 502);
          assert.deepEqual(
            (await app.inject({ url: "/api/v1/drafts", headers })).json().items,
            [saved],
          );
          delete process.env.OPENAI_API_KEY;
          assert.equal((await critiqueRequest()).statusCode, 503);
          await assert.rejects(
            critiqueDraft(draft),
            (error) => error instanceof DomainError && error.statusCode === 503,
          );
        } finally {
          await app.close();
        }
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

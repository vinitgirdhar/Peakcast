import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDraft } from "../server/ai.js";
import { DomainError } from "../server/database.js";

const draft = {
  question: "Will the designated source publish a qualifying result?",
  sourceName: "Designated source",
  sourceUrl: "https://example.org/results",
  closesAt: "2099-01-01T00:00:00.000Z",
  yesRule:
    "The source publishes a result strictly above the defined threshold before closing.",
  noRule:
    "The complete source record contains no qualifying result before closing.",
  invalidRule:
    "Missing or incomplete source records require human review before resolution.",
};

test("AI adapter validates structured provider output and handles provider failure safely", async (t) => {
  const previous = {
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  };
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-placeholder-not-a-real-provider-key";
  process.env.OPENAI_MODEL = "test-structured-model";
  function respond(body: unknown, status = 200) {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.store, false);
      assert.equal(request.text.format.type, "json_schema");
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    };
  }
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
  const isProviderError = (error: unknown) =>
    error instanceof DomainError && error.statusCode === 502;
  try {
    await t.test(
      "valid structured output is returned without fetching the source",
      async () => {
        respond(completed(draft));
        assert.deepEqual(await generateDraft(draft), draft);
      },
    );
    await t.test(
      "invalid generated fields are a provider error, not a user validation error",
      async () => {
        respond(completed({ ...draft, yesRule: "" }));
        await assert.rejects(generateDraft(draft), isProviderError);
      },
    );
    await t.test(
      "changed sources/deadlines and malformed output are rejected",
      async () => {
        for (const invalid of [
          { ...draft, sourceUrl: "https://other.example.org/" },
          { ...draft, closesAt: "2098-01-01T00:00:00.000Z" },
          "not JSON",
        ]) {
          respond(completed(invalid));
          await assert.rejects(generateDraft(draft), isProviderError);
        }
      },
    );
    await t.test(
      "refusal, incomplete completion and upstream errors do not become saved drafts",
      async () => {
        for (const body of [
          { status: "incomplete", output: [] },
          {
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  { type: "refusal", refusal: "Cannot draft this event." },
                ],
              },
            ],
          },
        ]) {
          respond(body);
          await assert.rejects(generateDraft(draft), isProviderError);
        }
        respond(
          {
            error: {
              message: "Internal provider details must not reach the client.",
            },
          },
          500,
        );
        await assert.rejects(
          generateDraft(draft),
          (error) =>
            isProviderError(error) &&
            !(error as Error).message.includes("Internal provider details"),
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
    if (previous.model === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previous.model;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { WildcatterClient, ApiError } from "../shared/client.js";

test("SDK turns non-JSON gateway failures into useful status-preserving API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<html>Gateway unavailable</html>", {
      status: 503,
      headers: { "content-type": "text/html" },
    });
  try {
    await assert.rejects(
      new WildcatterClient("http://localhost").markets(),
      (error) =>
        error instanceof ApiError &&
        error.status === 503 &&
        !error.message.includes("<html>"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SDK passes the provider separately from the validated draft and keeps authorization in headers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "http://localhost/api/v1/drafts/generate?provider=groq",
    );
    assert.equal(
      new Headers(init?.headers).get("X-AI-Access-Token"),
      "workspace-test-token",
    );
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer account-test-token",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      question: "Request fixture",
    });
    return Response.json({ mode: "groq" });
  };
  try {
    const { mode } = await new WildcatterClient(
      "http://localhost",
      "account-test-token",
    ).generateDraft(
      { question: "Request fixture" } as Parameters<
        WildcatterClient["generateDraft"]
      >[0],
      "workspace-test-token",
      "groq",
    );
    assert.equal(mode, "groq");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

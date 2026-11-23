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

test("SDK encodes oEmbed lookups and sends size limits only when given", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return Response.json({ type: "rich" });
  };
  try {
    const api = new WildcatterClient("http://localhost");
    const link = "https://example.com/markets/a b?x=1&y=2";
    assert.equal((await api.oembed(link)).type, "rich");
    await api.oembed(link, 320, 180);
    assert.deepEqual(urls, [
      "http://localhost/api/v1/oembed?url=https%3A%2F%2Fexample.com%2Fmarkets%2Fa+b%3Fx%3D1%26y%3D2",
      "http://localhost/api/v1/oembed?url=https%3A%2F%2Fexample.com%2Fmarkets%2Fa+b%3Fx%3D1%26y%3D2&maxwidth=320&maxheight=180",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SDK workspace methods send the documented method, path and body", async () => {
  const originalFetch = globalThis.fetch;
  const calls: [string, string, unknown][] = [];
  globalThis.fetch = async (url, init) => {
    calls.push([
      init?.method ?? "GET",
      String(url).replace("http://localhost/api/v1", ""),
      init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    ]);
    return Response.json({});
  };
  const wid = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
  const token = "a".repeat(64);
  try {
    const api = new WildcatterClient("http://localhost", "account-token");
    await api.workspaces();
    await api.createWorkspace("Guild", "Ozzie");
    await api.workspace(wid);
    await api.renameWorkspace(wid, "Renamed");
    await api.createInvite(wid, { role: "resolver", maxUses: 3 });
    await api.invites(wid);
    await api.revokeInvite(wid, "inv/1");
    await api.previewInvite(token);
    await api.joinWorkspace(token, "Mona");
    await api.setMemberRole(wid, "mem 1", "admin");
    await api.removeMember(wid, "mem 1");
    await api.workspaceMarkets(wid);
    await api.workspaceMarkets(wid, "merger", "Economy");
    await api.workspacePortfolio(wid);
    await api.workspaceLeaderboard(wid);
    await api.workspaceRuling(wid, "ws-1", "NO");
    await api.launchDraft("draft-1", "Science");
    await api.launchDraft("draft-1", "Science", wid);
    assert.deepEqual(calls, [
      ["GET", "/workspaces", undefined],
      ["POST", "/workspaces", { name: "Guild", displayName: "Ozzie" }],
      ["GET", `/workspaces/${wid}`, undefined],
      ["PATCH", `/workspaces/${wid}`, { name: "Renamed" }],
      ["POST", `/workspaces/${wid}/invites`, { role: "resolver", maxUses: 3 }],
      ["GET", `/workspaces/${wid}/invites`, undefined],
      ["DELETE", `/workspaces/${wid}/invites/inv%2F1`, undefined],
      ["POST", "/workspaces/invites/preview", { token }],
      ["POST", "/workspaces/join", { token, displayName: "Mona" }],
      ["PATCH", `/workspaces/${wid}/members/mem%201`, { role: "admin" }],
      ["DELETE", `/workspaces/${wid}/members/mem%201`, undefined],
      ["GET", `/workspaces/${wid}/markets?search=&category=`, undefined],
      [
        "GET",
        `/workspaces/${wid}/markets?search=merger&category=Economy`,
        undefined,
      ],
      ["GET", `/workspaces/${wid}/portfolio`, undefined],
      ["GET", `/workspaces/${wid}/leaderboard`, undefined],
      ["POST", `/workspaces/${wid}/markets/ws-1/ruling`, { outcome: "NO" }],
      ["POST", "/drafts/draft-1/launch", { category: "Science" }],
      [
        "POST",
        "/drafts/draft-1/launch",
        { category: "Science", workspaceId: wid },
      ],
    ]);
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

test("SDK sends an advisory critique request with the AI access header", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "http://localhost/api/v1/drafts/critique?provider=gemini",
    );
    assert.equal(init?.method, "POST");
    assert.equal(
      new Headers(init?.headers).get("X-AI-Access-Token"),
      "workspace-test-token",
    );
    return Response.json({ provider: "gemini", summary: "", findings: [] });
  };
  try {
    const critique = await new WildcatterClient(
      "http://localhost",
      "account-test-token",
    ).critiqueDraft(
      { question: "Request fixture" } as Parameters<
        WildcatterClient["critiqueDraft"]
      >[0],
      "workspace-test-token",
      "gemini",
    );
    assert.equal(critique.provider, "gemini");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SDK asks for a market explainer with the AI access header and no body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "http://localhost/api/v1/markets/fed%2Frate/explain?provider=groq",
    );
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, undefined);
    assert.equal(
      new Headers(init?.headers).get("X-AI-Access-Token"),
      "workspace-test-token",
    );
    return Response.json({ provider: "groq", summary: "Plain words." });
  };
  try {
    const explained = await new WildcatterClient(
      "http://localhost",
      "account-test-token",
    ).explainMarket("fed/rate", "workspace-test-token", "groq");
    assert.equal(explained.summary, "Plain words.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

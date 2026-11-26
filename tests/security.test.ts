import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server/app.js";

test("HTTPS preview accepts only its configured host and matching origin", async () => {
  const publicOrigin = "https://preview.example";
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    publicOrigin,
  });
  try {
    for (const headers of [
      { host: "preview.example", origin: publicOrigin },
      { host: "localhost", origin: "http://localhost" },
    ]) {
      assert.equal(
        (await app.inject({ method: "POST", url: "/api/v1/sessions", headers }))
          .statusCode,
        201,
      );
    }
    for (const headers of [
      { host: "other.example", origin: "https://other.example" },
      { host: "preview.example", origin: "https://other.example" },
      { host: "preview.example", origin: "http://preview.example" },
      { host: "localhost", origin: publicOrigin },
      { host: "preview.example.evil", origin: publicOrigin },
    ]) {
      assert.equal(
        (await app.inject({ method: "POST", url: "/api/v1/sessions", headers }))
          .statusCode,
        403,
      );
    }
  } finally {
    await app.close();
  }
  for (const invalid of [
    "http://preview.example",
    "https://preview.example/",
    "https://user:pass@preview.example",
    "https://preview.example/path",
    "not-a-url",
  ]) {
    await assert.rejects(
      buildApp({ databasePath: ":memory:", publicOrigin: invalid }),
    );
  }
});

test("rate limits protect session creation and publish a JSON 429 response", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  try {
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await app.inject({ method: "POST", url: "/api/v1/sessions" }))
          .statusCode,
        201,
      );
    const limited = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
    });
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.json().message);
    assert.ok(limited.headers["retry-after"]);
  } finally {
    await app.close();
  }
});

test("protected routes require bearer scheme and reject oversized requests without leaking internals", async () => {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    const session = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json();
    assert.equal(
      (
        await app.inject({
          url: "/api/v1/portfolio",
          headers: { authorization: session.token },
        })
      ).statusCode,
      401,
    );
    for (const url of ["/api/v1/portfolio", "/api/v1/drafts"]) {
      const response = await app.inject(url);
      assert.equal(response.statusCode, 401);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(response.json().stack, undefined);
    }
    const tooLarge = await app.inject({
      method: "POST",
      url: "/api/v1/quotes",
      payload: { invalid: "x".repeat(17_000) },
    });
    assert.equal(tooLarge.statusCode, 413);
    assert.equal(tooLarge.json().stack, undefined);
  } finally {
    await app.close();
  }
});

test("OpenAPI includes failure contracts and the operator credential", async () => {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    const spec = (await app.inject("/api/v1/openapi.json")).json();
    assert.ok(spec.paths["/api/v1/trades"].post.responses["409"]);
    assert.ok(spec.paths["/api/v1/portfolio"].get.responses["401"]);
    assert.ok(spec.paths["/api/v1/markets/{id}/ruling"].post.responses["503"]);
    assert.equal(spec.paths["/api/v1/drafts/generate"], undefined);
    assert.equal(
      spec.components.securitySchemes.operatorToken.name,
      "X-Operator-Token",
    );
  } finally {
    await app.close();
  }
});

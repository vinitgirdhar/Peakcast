import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../server/app.js";
import { escapeHtml } from "../server/embed.js";

type App = Awaited<ReturnType<typeof buildApp>>;
const host = "127.0.0.1:3001";
const origin = `http://${host}`;
// `$'` also probes String.replace substitution patterns in the page shell.
const hostile = `<img src=x onerror=alert(1)> "quoted" & 'single' $'`;
// The CSP every route shares; only /embed/* may differ. 'wasm-unsafe-eval' lets the
// on-device engine compile sql.js, and still blocks eval().
const strictCsp =
  "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'none';img-src 'self' data:;object-src 'none';script-src 'self' 'wasm-unsafe-eval';script-src-attr 'none';style-src 'self' 'unsafe-inline';connect-src 'self'";
const indexHtml =
  "<!doctype html><html><head><title>Peakcast</title></head><body></body></html>";

const get = (app: App, url: string, headers: Record<string, string> = {}) =>
  app.inject({ url, headers: { host, ...headers } });
const oembed = (app: App, url: string, extra = "") =>
  get(app, `/api/v1/oembed?url=${encodeURIComponent(url)}${extra}`);

function staticRoot() {
  const root = mkdtempSync(join(tmpdir(), "peakcast-embed-"));
  writeFileSync(join(root, "index.html"), indexHtml);
  return root;
}

/** Launches a community market whose title is an XSS probe, through the public API. */
async function launchHostile(app: App) {
  const session = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    headers: { host },
  });
  const auth = { host, authorization: `Bearer ${session.json().token}` };
  const draft = await app.inject({
    method: "POST",
    url: "/api/v1/drafts",
    headers: auth,
    payload: {
      question: hostile,
      sourceName: "Example source",
      sourceUrl: "https://example.com/source",
      closesAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      yesRule: "Resolves YES when the source confirms it.",
      noRule: "Resolves NO when the source denies it.",
      invalidRule: "Resolves INVALID when the source is unclear.",
    },
  });
  const market = await app.inject({
    method: "POST",
    url: `/api/v1/drafts/${draft.json().id}/launch`,
    headers: auth,
    payload: { category: "World" },
  });
  assert.equal(market.statusCode, 201);
  return { market: market.json() as { id: string; title: string }, auth };
}

test("escapeHtml neutralises markup and both quote styles", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror=alert(1)> "a" & 'b'`),
    "&lt;img src=x onerror=alert(1)&gt; &quot;a&quot; &amp; &#39;b&#39;",
  );
});

test("embed renders a read-only widget with escaped market text", async () => {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    const market = (await get(app, "/api/v1/markets/fed-rate")).json();
    const widget = await get(app, "/embed/markets/fed-rate");
    assert.equal(widget.statusCode, 200);
    assert.match(String(widget.headers["content-type"]), /^text\/html/);
    assert.equal(widget.headers["cache-control"], "public, max-age=30");
    assert.equal(widget.headers["set-cookie"], undefined);
    assert.ok(widget.body.includes(`${Math.round(market.probability * 100)}%`));
    assert.ok(
      widget.body.includes(
        `href="${origin}/markets/fed-rate" target="_blank" rel="noopener noreferrer"`,
      ),
    );
    assert.match(widget.body, /<polyline points="[\d., ]+"/);
    assert.doesNotMatch(widget.body, /<script/i);

    const { market: probe, auth } = await launchHostile(app);
    const page = (await get(app, `/embed/markets/${probe.id}`)).body;
    assert.ok(
      !page.includes("<img"),
      "the hostile title must not become markup",
    );
    assert.ok(page.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(page.includes("&quot;quoted&quot; &amp; &#39;single&#39;"));
    assert.ok(!page.includes(auth.authorization.slice(7)));
  } finally {
    await app.close();
  }
});

test("only /embed/* may be framed; every other route keeps the strict CSP", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    staticRoot: staticRoot(),
  });
  try {
    const widget = await get(app, "/embed/markets/fed-rate");
    const csp = String(widget.headers["content-security-policy"]);
    assert.match(csp, /frame-ancestors \*/);
    assert.match(csp, /default-src 'none'/);
    assert.doesNotMatch(csp, /frame-ancestors 'none'|unsafe|script-src/);
    const style = /<style>([\s\S]*?)<\/style>/.exec(widget.body)?.[1] ?? "";
    const hash = createHash("sha256").update(style).digest("base64");
    assert.ok(csp.includes(`style-src 'sha256-${hash}'`));
    assert.equal(widget.headers["x-frame-options"], undefined);
    assert.equal(
      widget.headers["cross-origin-resource-policy"],
      "cross-origin",
    );
    for (const url of ["/", "/markets/fed-rate", "/api/v1/markets"]) {
      const response = await get(app, url);
      assert.equal(response.statusCode, 200, url);
      assert.equal(response.headers["content-security-policy"], strictCsp);
      assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
    }
  } finally {
    await app.close();
  }
});

test("unknown embeds get an HTML 404 page and the theme parameter is validated", async () => {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    const missing = await get(app, "/embed/markets/no-such-market");
    assert.equal(missing.statusCode, 404);
    assert.match(String(missing.headers["content-type"]), /^text\/html/);
    assert.match(missing.body, /Market not found/);
    assert.doesNotMatch(missing.body, /DomainError|stack|at Store/);
    assert.match(
      String(missing.headers["content-security-policy"]),
      /frame-ancestors \*/,
    );
    for (const [query, theme] of [
      ["", "auto"],
      ["?theme=auto", "auto"],
      ["?theme=light", "light"],
      ["?theme=dark", "dark"],
    ])
      assert.ok(
        (await get(app, `/embed/markets/fed-rate${query}`)).body.includes(
          `<html lang="en" data-theme="${theme}">`,
        ),
        query,
      );
    assert.equal(
      (await get(app, "/embed/markets/fed-rate?theme=neon")).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});

test("embed shows proposed and resolved outcomes", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    disputeWindowMs: 0,
  });
  try {
    const { market, auth } = await launchHostile(app);
    const url = `/embed/markets/${market.id}`;
    assert.match((await get(app, url)).body, />Open</);
    await app.inject({
      method: "POST",
      url: `/api/v1/markets/${market.id}/resolution`,
      headers: auth,
      payload: { outcome: "YES", evidenceUrl: "https://example.com/evidence" },
    });
    assert.match((await get(app, url)).body, />Outcome proposed</);
    const settled = await app.inject({
      method: "POST",
      url: `/api/v1/markets/${market.id}/settle`,
      headers: auth,
    });
    assert.equal(settled.statusCode, 200);
    assert.match((await get(app, url)).body, />Resolved YES</);
  } finally {
    await app.close();
  }
});

test("embeds are rate limited and load as cross-site iframe navigations", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  try {
    // Browsers send no Origin header on GET navigations, including iframes.
    const widget = await get(app, "/embed/markets/fed-rate", {
      "sec-fetch-dest": "iframe",
      "sec-fetch-site": "cross-site",
      referer: "https://blog.example/post",
    });
    assert.equal(widget.statusCode, 200);
    assert.equal(widget.headers["x-ratelimit-limit"], "300");
  } finally {
    await app.close();
  }
});

test("oEmbed returns a lazy iframe for this server's own market links", async () => {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    const market = (await get(app, "/api/v1/markets/fed-rate")).json();
    const response = await oembed(app, `${origin}/markets/fed-rate`);
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.deepEqual(
      {
        version: body.version,
        type: body.type,
        provider_name: body.provider_name,
        provider_url: body.provider_url,
        title: body.title,
        width: body.width,
        height: body.height,
      },
      {
        version: "1.0",
        type: "rich",
        provider_name: "Peakcast",
        provider_url: origin,
        title: market.title,
        width: 480,
        height: 200,
      },
    );
    assert.match(
      body.html,
      new RegExp(
        `^<iframe src="${origin}/embed/markets/fed-rate" width="480" height="200" title="Peakcast forecast: [^"]+" loading="lazy"`,
      ),
    );
    const sized = (
      await oembed(
        app,
        `${origin}/markets/fed-rate/rules`,
        "&maxwidth=320&maxheight=180&format=json",
      )
    ).json();
    assert.equal(sized.width, 320);
    assert.equal(sized.height, 180);
    assert.equal(
      (await oembed(app, `${origin}/markets/fed-rate`, "&maxwidth=900")).json()
        .width,
      480,
    );

    const { market: probe } = await launchHostile(app);
    const escaped = (await oembed(app, `${origin}/markets/${probe.id}`)).json();
    assert.equal(escaped.title, hostile);
    assert.ok(!escaped.html.includes("<img"));
    assert.ok(escaped.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  } finally {
    await app.close();
  }
});

test("oEmbed rejects foreign, malformed and unknown links", async () => {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    for (const url of [
      "https://evil.example/markets/fed-rate",
      `https://${host}/markets/fed-rate`,
      `http://user:secret@${host}/markets/fed-rate`,
      `${origin}/portfolio`,
      `${origin}/markets/fed-rate/trades`,
      `${origin}/markets/%E0%A4%A`,
      "not a url",
    ]) {
      const response = await oembed(app, url);
      assert.equal(response.statusCode, 400, url);
      assert.ok(response.json().message, url);
    }
    assert.equal(
      (await oembed(app, `${origin}/markets/no-such-market`)).statusCode,
      404,
    );
    for (const extra of ["&maxwidth=0", "&format=xml", "&callback=x"])
      assert.equal(
        (await oembed(app, `${origin}/markets/fed-rate`, extra)).statusCode,
        400,
        extra,
      );
    assert.equal((await get(app, "/api/v1/oembed")).statusCode, 400);
  } finally {
    await app.close();
  }
});

test("share origin follows the public origin, loopback host or local-only desktop", async () => {
  const hosted = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    publicOrigin: "https://preview.example",
  });
  try {
    const headers = { host: "preview.example" };
    assert.equal(
      (await hosted.inject({ url: "/api/v1/capabilities", headers })).json()
        .shareOrigin,
      "https://preview.example",
    );
    const response = await hosted.inject({
      url: `/api/v1/oembed?url=${encodeURIComponent("https://preview.example/markets/fed-rate")}`,
      headers,
    });
    assert.equal(response.statusCode, 200);
    assert.match(
      response.json().html,
      /src="https:\/\/preview\.example\/embed\/markets\/fed-rate"/,
    );
    assert.equal(
      (
        await hosted.inject({
          url: `/api/v1/oembed?url=${encodeURIComponent(`${origin}/markets/fed-rate`)}`,
          headers,
        })
      ).statusCode,
      400,
    );
    assert.ok(
      (
        await hosted.inject({ url: "/embed/markets/fed-rate", headers })
      ).body.includes('href="https://preview.example/markets/fed-rate"'),
    );
  } finally {
    await hosted.close();
  }
  const local = await buildApp({ databasePath: ":memory:" });
  const desktop = await buildApp({ databasePath: ":memory:", localOnly: true });
  try {
    assert.equal(
      (await get(local, "/api/v1/capabilities")).json().shareOrigin,
      origin,
    );
    assert.equal(
      (await local.inject("/api/v1/capabilities")).json().shareOrigin,
      "http://localhost",
    );
    assert.equal(
      (await get(desktop, "/api/v1/capabilities")).json().shareOrigin,
      null,
    );
  } finally {
    await local.close();
    await desktop.close();
  }
});

test("market pages carry escaped share previews and oEmbed discovery", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    staticRoot: staticRoot(),
  });
  try {
    const market = (await get(app, "/api/v1/markets/fed-rate")).json();
    const page = await get(app, "/markets/fed-rate/rules");
    assert.equal(page.statusCode, 200);
    assert.match(String(page.headers["content-type"]), /^text\/html/);
    assert.ok(
      page.body.includes(
        `<meta property="og:title" content="${escapeHtml(market.title)}">`,
      ),
    );
    assert.ok(
      page.body.includes(
        `<meta property="og:url" content="${origin}/markets/fed-rate">`,
      ),
    );
    assert.ok(
      page.body.includes('<meta name="twitter:card" content="summary">'),
    );
    assert.ok(
      page.body.includes(
        `<link rel="alternate" type="application/json+oembed" href="${origin}/api/v1/oembed?url=${encodeURIComponent(`${origin}/markets/fed-rate`)}"`,
      ),
    );
    assert.ok(page.body.endsWith("</head><body></body></html>"));

    const { market: probe } = await launchHostile(app);
    const hostilePage = (await get(app, `/markets/${probe.id}`)).body;
    assert.ok(!hostilePage.includes("<img"));
    assert.ok(hostilePage.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.equal(hostilePage.split("</head>").length, 2);
    assert.ok(hostilePage.endsWith("</head><body></body></html>"));

    for (const url of ["/markets/no-such-market", "/portfolio", "/markets"])
      assert.equal((await get(app, url)).body, indexHtml, url);
  } finally {
    await app.close();
  }
});

test("OpenAPI documents oEmbed with its failure codes but not the HTML widget", async () => {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    const spec = (await app.inject("/api/v1/openapi.json")).json();
    const responses = spec.paths["/api/v1/oembed"].get.responses;
    for (const code of ["200", "400", "404"]) assert.ok(responses[code], code);
    assert.ok(spec.paths["/api/v1/capabilities"].get.responses["200"]);
    assert.equal(spec.paths["/embed/markets/{id}"], undefined);
  } finally {
    await app.close();
  }
});

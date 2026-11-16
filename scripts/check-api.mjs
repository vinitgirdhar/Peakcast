import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildApp } from "../dist-server/server/app.js";
import { ApiError, WildcatterClient } from "../dist-server/shared/client.js";

const report = {
  checkedAt: new Date().toISOString(),
  transport: "HTTP over loopback; compiled backend and SDK",
  database: "isolated in-memory",
  status: "running",
  checks: [],
};
mkdirSync("output", { recursive: true });
const app = await buildApp({ databasePath: ":memory:" });
const base = await app.listen({ host: "127.0.0.1", port: 0 });
const publicApi = new WildcatterClient(base);
const rejectsStatus = (operation, status) =>
  assert.rejects(
    operation,
    (error) => error instanceof ApiError && error.status === status,
  );
async function check(name, operation) {
  try {
    await operation();
    report.checks.push({ name, status: "passed" });
  } catch (error) {
    report.checks.push({ name, status: "failed", message: error.message });
    throw error;
  }
}

try {
  let capabilities;
  let markets;
  await check(
    "Capabilities, public search, detail and observed history",
    async () => {
      capabilities = await publicApi.capabilities();
      assert.equal(capabilities.mode, "demo");
      markets = (await publicApi.markets()).items;
      assert.equal(markets.length, capabilities.marketCount);
      assert.equal(
        (await publicApi.markets("Bitcoin", "Crypto")).items.length,
        1,
      );
      assert.equal(
        (await publicApi.markets("nothing-matches-this-query")).items.length,
        0,
      );
      for (const market of markets) {
        const [detail, history] = await Promise.all([
          publicApi.market(market.id),
          publicApi.history(market.id),
        ]);
        assert.equal(detail.id, market.id);
        assert.equal(history.items.length, 1);
        assert.ok(detail.yesRule && detail.noRule && detail.invalidRule);
      }
      await rejectsStatus(() => publicApi.market("not-a-market"), 404);
    },
  );
  const session = await publicApi.createSession();
  const api = new WildcatterClient(base, session.token);
  await check(
    "Isolated demo session, bearer authorization and no-store responses",
    async () => {
      assert.match(session.token, /^[a-f0-9]{64}$/);
      assert.equal((await api.portfolio()).balanceMicros, 10_000_000_000);
      await rejectsStatus(() => publicApi.portfolio(), 401);
      await rejectsStatus(
        () => new WildcatterClient(base, "invalid").drafts(),
        401,
      );
      const response = await fetch(`${base}/api/v1/portfolio`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
    },
  );
  for (const outcome of ["YES", "NO"]) {
    await check(
      `Real quote, buy/retry, partial sell and close ${outcome} position`,
      async () => {
        const input = {
          marketId: markets[0].id,
          outcome,
          action: "buy",
          shares: 20,
        };
        const quote = await api.quote(input);
        const key = randomUUID();
        const order = { ...input, limitMicros: quote.amountMicros };
        const fill = await api.trade(order, key);
        assert.equal(fill.shares, 20);
        assert.deepEqual(await api.trade(order, key), fill);
        await rejectsStatus(
          () => api.trade({ ...order, shares: 21 }, key),
          409,
        );
        for (const shares of [7, 13]) {
          const sell = { ...input, action: "sell", shares };
          const sellQuote = await api.quote(sell);
          await api.trade(
            { ...sell, limitMicros: sellQuote.amountMicros },
            randomUUID(),
          );
        }
        assert.equal((await api.portfolio()).positions.length, 0);
      },
    );
  }
  await check(
    "Validation, insufficient holdings and price-limit errors",
    async () => {
      const input = {
        marketId: markets[0].id,
        outcome: "YES",
        action: "buy",
        shares: 10,
      };
      await rejectsStatus(() => api.quote({ ...input, shares: 1.5 }), 400);
      await rejectsStatus(
        () => api.trade({ ...input, limitMicros: 0 }, randomUUID()),
        409,
      );
      await rejectsStatus(
        () =>
          api.trade({ ...input, action: "sell", limitMicros: 0 }, randomUUID()),
        409,
      );
      const other = await publicApi.createSession();
      assert.equal(
        (await new WildcatterClient(base, other.token).portfolio()).trades
          .length,
        0,
      );
      assert.equal((await api.portfolio()).trades.length, 6);
    },
  );
  const draft = {
    question: "Will a verifiable source report a qualifying event?",
    sourceName: "Example primary source",
    sourceUrl: "https://example.org/data",
    closesAt: "2099-01-01T00:00:00.000Z",
    yesRule:
      "Resolve YES on a published qualifying measurement before the stated deadline.",
    noRule:
      "Resolve NO when the complete primary record has no qualifying measurement by closing.",
    invalidRule:
      "If the primary record is incomplete, hold for human review before any resolution.",
  };
  await check(
    "Private draft persistence and cross-account isolation",
    async () => {
      const saved = await api.saveDraft(draft);
      assert.equal(saved.mode, "manual");
      assert.equal(saved.status, "draft");
      assert.equal((await api.drafts()).items[0].id, saved.id);
      const other = await publicApi.createSession();
      assert.equal(
        (await new WildcatterClient(base, other.token).drafts()).items.length,
        0,
      );
    },
  );
  if (!capabilities.aiConfigured)
    await check("Unconfigured AI returns 503", () =>
      rejectsStatus(
        () => api.generateDraft(draft, "unconfigured-test-token"),
        503,
      ),
    );
  else
    report.checks.push({
      name: "Live AI inference",
      status: "not-run",
      reason:
        "Configured paid inference requires an explicit live-provider test.",
    });
  await check(
    "OpenAPI, Swagger, SPA, install assets and credential exclusions",
    async () => {
      const schema = await (await fetch(`${base}/api/v1/openapi.json`)).json();
      assert.ok(schema.paths["/api/v1/trades"].post.responses["409"]);
      writeFileSync("output/openapi.json", JSON.stringify(schema, null, 2));
      for (const path of [
        "/",
        "/portfolio",
        "/studio",
        "/developers",
        "/api-docs/",
        "/manifest.webmanifest",
        "/vendor/liquid-glass.js",
        "/icon-192.png",
        "/sw.js",
      ])
        assert.equal((await fetch(`${base}${path}`)).status, 200, path);
      for (const path of [
        "/.env",
        "/data/wildcatter.sqlite",
        "/api/v1/unknown",
      ])
        assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    },
  );
  report.status = "passed";
  report.liveAI =
    "not invoked; provider boundary tested separately with mocked responses";
} catch (error) {
  report.status = "failed";
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await app.close();
  mkdirSync("output", { recursive: true });
  writeFileSync(
    "output/api-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    `HTTP API verification ${report.status}: ${report.checks.filter((check) => check.status === "passed").length}/${report.checks.length} groups.`,
  );
}

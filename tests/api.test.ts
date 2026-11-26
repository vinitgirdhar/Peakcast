import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../server/app.js";
import { Store } from "../server/database.js";
import type { DraftInput } from "../shared/types.js";

async function setup() {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
  });
  assert.equal(response.statusCode, 201);
  const session = response.json();
  const headers = { authorization: `Bearer ${session.token}` };
  return { app, session, headers };
}

const order = {
  marketId: "fed-rate",
  outcome: "YES",
  action: "buy",
  shares: 10,
};
const draft: DraftInput = {
  question: "Will a measurable event occur before 2028?",
  sourceName: "Official source",
  sourceUrl: "https://example.org/data",
  closesAt: "2028-01-01T00:00:00.000Z",
  yesRule:
    "The official source publishes a qualifying measurement before the deadline.",
  noRule:
    "No qualifying measurement exists in the complete published record by the deadline.",
  invalidRule: "If the source is missing or incomplete, hold for human review.",
};

test("public APIs filter markets, expose rules/history and document protected endpoints", async () => {
  const { app } = await setup();
  try {
    const markets = await app.inject(
      "/api/v1/markets?category=Crypto&search=Bitcoin",
    );
    assert.equal(markets.statusCode, 200);
    assert.deepEqual(
      markets.json().items.map((item: { id: string }) => item.id),
      ["bitcoin-150k"],
    );
    const market = await app.inject("/api/v1/markets/fed-rate");
    assert.ok(
      market.json().yesRule.includes("Federal") ||
        market.json().yesRule.includes("federal"),
    );
    assert.equal(
      (await app.inject("/api/v1/markets/fed-rate/history")).json().items
        .length,
      1,
    );
    assert.equal((await app.inject("/api/v1/markets/missing")).statusCode, 404);
    const spec = (await app.inject("/api/v1/openapi.json")).json();
    assert.ok(spec.paths["/api/v1/trades"].post.security);
    assert.ok(spec.paths["/api/v1/trades"].post.requestBody);
    assert.equal(
      (await app.inject("/api/v1/capabilities")).json().mode,
      "demo",
    );
  } finally {
    await app.close();
  }
});

test("buy, retry and sell update balances/positions atomically without duplicate trades", async () => {
  const { app, session, headers } = await setup();
  try {
    const quote = (
      await app.inject({
        method: "POST",
        url: "/api/v1/quotes",
        payload: order,
      })
    ).json();
    const key = randomUUID();
    const request = {
      method: "POST" as const,
      url: "/api/v1/trades",
      headers: { ...headers, "idempotency-key": key },
      payload: { ...order, limitMicros: quote.amountMicros },
    };
    const [first, retry] = await Promise.all([
      app.inject(request),
      app.inject(request),
    ]);
    assert.equal(first.statusCode, 201, first.body);
    assert.deepEqual(retry.json(), first.json());
    const portfolio = (
      await app.inject({ url: "/api/v1/portfolio", headers })
    ).json();
    assert.equal(portfolio.positions[0].shares, 10);
    assert.equal(portfolio.trades.length, 1);
    assert.equal(
      portfolio.balanceMicros,
      session.balanceMicros - quote.amountMicros,
    );
    assert.equal(
      (await app.inject("/api/v1/markets/fed-rate/history")).json().items
        .length,
      2,
    );
    assert.ok(
      (await app.inject("/api/v1/markets/fed-rate")).json().probability > 0.68,
    );
    const conflict = await app.inject({
      ...request,
      payload: { ...request.payload, shares: 20 },
    });
    assert.equal(conflict.statusCode, 409);
    const sell = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { ...order, action: "sell", limitMicros: 0 },
    });
    assert.equal(sell.statusCode, 201, sell.body);
    const final = (
      await app.inject({ url: "/api/v1/portfolio", headers })
    ).json();
    assert.equal(final.positions.length, 0);
    assert.ok(final.balanceMicros <= session.balanceMicros);
    assert.ok(session.balanceMicros - final.balanceMicros <= 2);
    assert.equal(final.trades.length, 2);
  } finally {
    await app.close();
  }
});

test("auth isolation, expired/invalid sessions and unowned sales are enforced", async () => {
  const { app, headers } = await setup();
  try {
    for (const header of [undefined, { authorization: "Bearer not-valid" }])
      assert.equal(
        (await app.inject({ url: "/api/v1/portfolio", headers: header }))
          .statusCode,
        401,
      );
    const other = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json();
    const otherHeaders = { authorization: `Bearer ${other.token}` };
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/trades",
          headers: { ...headers, "idempotency-key": randomUUID() },
          payload: { ...order, action: "sell", limitMicros: 0 },
        })
      ).statusCode,
      409,
    );
    await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { ...order, limitMicros: 100_000_000 },
    });
    const otherPortfolio = (
      await app.inject({ url: "/api/v1/portfolio", headers: otherHeaders })
    ).json();
    assert.equal(otherPortfolio.positions.length, 0);
    assert.equal(otherPortfolio.trades.length, 0);
    assert.equal(otherPortfolio.balanceMicros, 5_000_000_000);
  } finally {
    await app.close();
  }
});

test("boundary validation rejects fractional shares, unknown fields and absent idempotency key", async () => {
  const { app, headers } = await setup();
  try {
    for (const shares of [0, -1, 1.5, 10001, "10"]) {
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/quotes",
            payload: { ...order, shares },
          })
        ).statusCode,
        400,
      );
    }
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/quotes",
          payload: { ...order, surprise: true },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/trades",
          headers,
          payload: { ...order, limitMicros: 10_000_000 },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/quotes",
          payload: { ...order, outcome: "MAYBE" },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});

test("changed prices, insufficient balance and sell limits roll back completely", async () => {
  const { app, headers, session } = await setup();
  try {
    const request = (payload: object) =>
      app.inject({
        method: "POST",
        url: "/api/v1/trades",
        headers: { ...headers, "idempotency-key": randomUUID() },
        payload,
      });
    const lowLimit = await request({ ...order, limitMicros: 1 });
    assert.equal(lowLimit.statusCode, 409);
    const noPosition = (
      await app.inject({ url: "/api/v1/portfolio", headers })
    ).json();
    assert.equal(noPosition.trades.length, 0);
    assert.equal(noPosition.balanceMicros, session.balanceMicros);
    for (let i = 0; i < 2; i++)
      await request({ ...order, shares: 9000, limitMicros: 10_000_000_000 });
    const before = (
      await app.inject({ url: "/api/v1/portfolio", headers })
    ).json();
    const insufficient = await request({
      ...order,
      shares: 9000,
      limitMicros: 10_000_000_000,
    });
    assert.equal(insufficient.statusCode, 409);
    assert.deepEqual(
      (await app.inject({ url: "/api/v1/portfolio", headers })).json(),
      before,
    );
    const sellLimit = await request({
      ...order,
      shares: 1,
      action: "sell",
      limitMicros: 10_000_000_000,
    });
    assert.equal(sellLimit.statusCode, 409);
    assert.deepEqual(
      (await app.inject({ url: "/api/v1/portfolio", headers })).json(),
      before,
    );
  } finally {
    await app.close();
  }
});

test("private drafts validate dates, sources and missing rules; no publishing route exists", async () => {
  const { app, headers } = await setup();
  try {
    const saved = await app.inject({
      method: "POST",
      url: "/api/v1/drafts",
      headers,
      payload: draft,
    });
    assert.equal(saved.statusCode, 201, saved.body);
    assert.equal(saved.json().mode, "manual");
    assert.equal(saved.json().status, "draft");
    assert.equal(
      (await app.inject({ url: "/api/v1/drafts", headers })).json().items
        .length,
      1,
    );
    const other = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json();
    assert.equal(
      (
        await app.inject({
          url: "/api/v1/drafts",
          headers: { authorization: `Bearer ${other.token}` },
        })
      ).json().items.length,
      0,
    );
    for (const input of [
      { ...draft, closesAt: "2020-01-01T00:00:00Z" },
      { ...draft, sourceUrl: "http://example.org" },
      { ...draft, yesRule: "vague" },
      { ...draft, sourceUrl: "https://user:password@example.org" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/drafts",
        headers,
        payload: input,
      });
      assert.equal(response.statusCode, 400, response.body);
    }
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/markets",
          headers,
          payload: draft,
        })
      ).statusCode,
      404,
    );
    const unavailable = await app.inject({
      method: "POST",
      url: "/api/v1/drafts/generate",
      headers: { ...headers, "x-ai-access-token": "not-configured-token" },
      payload: draft,
    });
    assert.equal(unavailable.statusCode, 503);
  } finally {
    await app.close();
  }
});

test("database restart preserves balances and retry identity; tokens are hashed and expire", () => {
  const folder = mkdtempSync(join(tmpdir(), "wildcatter-test-"));
  let store = new Store(join(folder, "state.sqlite"));
  try {
    const session = store.createSession();
    const account = store.account(session.token);
    const tokenRow = store.db
      .prepare("SELECT token_hash FROM accounts")
      .get() as { token_hash: string };
    assert.notEqual(tokenRow.token_hash, session.token);
    const input = {
      ...order,
      outcome: "NO" as const,
      action: "buy" as const,
      limitMicros: 100_000_000,
    };
    const fill = store.trade(account.id, input, "persisted-key");
    store.close();
    store = new Store(join(folder, "state.sqlite"));
    assert.equal(
      store.account(session.token).balance_micros,
      fill.balanceMicros,
    );
    assert.deepEqual(store.trade(account.id, input, "persisted-key"), fill);
    assert.equal(store.portfolio(account.id).trades.length, 1);
    store.db
      .prepare("UPDATE accounts SET expires_at=? WHERE id=?")
      .run("2020-01-01T00:00:00Z", account.id);
    assert.throws(() => store.account(session.token), /Start a demo session/);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("closed markets reject quotes and executions", () => {
  const store = new Store(":memory:");
  try {
    const row = store.row("fed-rate");
    const definition = {
      ...JSON.parse(row.definition),
      closesAt: "2020-01-01T00:00:00Z",
    };
    store.db
      .prepare("UPDATE markets SET definition=? WHERE id=?")
      .run(JSON.stringify(definition), "fed-rate");
    assert.throws(
      () => store.quote({ ...order, outcome: "YES", action: "buy" }),
      /closed/,
    );
  } finally {
    store.close();
  }
});

test("host/origin policy blocks DNS rebinding and cross-site requests", async () => {
  const { app } = await setup();
  try {
    assert.equal(
      (
        await app.inject({
          url: "/api/v1/markets",
          headers: { host: "evil.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/sessions",
          headers: { origin: "https://evil.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await app.inject("/api/v1/markets")).headers["cache-control"],
      "no-store",
    );
  } finally {
    await app.close();
  }
});

test("configured AI requires its own secret and validates output before saving", async () => {
  const previousToken = process.env.AI_ACCESS_TOKEN;
  process.env.AI_ACCESS_TOKEN = "only-for-test-ai-secret";
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    draftGenerator: async (input) => ({
      ...input,
      yesRule:
        "A refined measurable criterion with explicit units and a deadline.",
    }),
  });
  try {
    const token = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json().token;
    const headers = {
      authorization: `Bearer ${token}`,
      "x-ai-access-token": process.env.AI_ACCESS_TOKEN,
    };
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/drafts/generate",
      headers: { ...headers, "x-ai-access-token": "wrong-token-long-enough" },
      payload: draft,
    });
    assert.equal(denied.statusCode, 403);
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/drafts/generate",
      headers,
      payload: draft,
    });
    assert.equal(result.statusCode, 201, result.body);
    assert.equal(result.json().mode, "openai");
    assert.ok(result.json().yesRule.includes("refined"));
  } finally {
    await app.close();
    if (previousToken === undefined) delete process.env.AI_ACCESS_TOKEN;
    else process.env.AI_ACCESS_TOKEN = previousToken;
  }
});

test("draft deletion is owner-only and leaves no trace", async () => {
  const { app, headers } = await setup();
  try {
    const saved = (
      await app.inject({
        method: "POST",
        url: "/api/v1/drafts",
        headers,
        payload: draft,
      })
    ).json();
    const other = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json();
    const url = "/api/v1/drafts/" + saved.id;
    assert.equal((await app.inject({ method: "DELETE", url })).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url,
          headers: { authorization: "Bearer " + other.token },
        })
      ).statusCode,
      404,
    );
    const removed = await app.inject({ method: "DELETE", url, headers });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.deepEqual(removed.json(), { deleted: true });
    assert.equal(
      (await app.inject({ method: "DELETE", url, headers })).statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ url: "/api/v1/drafts", headers })).json().items
        .length,
      0,
    );
  } finally {
    await app.close();
  }
});

test("launching a draft stakes liquidity, opens a tradeable market and pays the creator 1% of each trade", async () => {
  const { app, headers } = await setup();
  try {
    const saved = (
      await app.inject({
        method: "POST",
        url: "/api/v1/drafts",
        headers,
        payload: draft,
      })
    ).json();
    const url = "/api/v1/drafts/" + saved.id + "/launch";
    const payload = { category: "Science" };
    const trader = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json();
    const traderHeaders = { authorization: "Bearer " + trader.token };
    assert.equal(
      (await app.inject({ method: "POST", url, payload })).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url,
          headers: traderHeaders,
          payload,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url,
          headers,
          payload: { category: "Gossip" },
        })
      ).statusCode,
      400,
    );
    const launched = await app.inject({
      method: "POST",
      url,
      headers,
      payload,
    });
    assert.equal(launched.statusCode, 201, launched.body);
    const market = launched.json();
    assert.equal(market.title, draft.question);
    assert.equal(market.probability, 0.5);
    assert.equal(market.feeBps, 100);
    assert.equal(market.status, "open");
    // The draft became the market; it cannot launch twice.
    assert.equal(
      (await app.inject({ method: "POST", url, headers, payload })).statusCode,
      404,
    );
    const listed = (
      await app.inject("/api/v1/markets?search=measurable")
    ).json();
    assert.deepEqual(
      listed.items.map((item: { id: string }) => item.id),
      [market.id],
    );
    const stake = 500_000_000;
    const before = (
      await app.inject({ url: "/api/v1/portfolio", headers })
    ).json();
    assert.equal(before.balanceMicros, 5_000_000_000 - stake);
    assert.equal(before.created[0].marketId, market.id);
    assert.equal(before.created[0].feesMicros, 0);

    const input = {
      marketId: market.id,
      outcome: "YES",
      action: "buy",
      shares: 100,
    };
    const quote = (
      await app.inject({
        method: "POST",
        url: "/api/v1/quotes",
        payload: input,
      })
    ).json();
    assert.ok(quote.feeMicros > 0);
    // The fee is 1% of the pool amount, charged on top and rounded up.
    assert.equal(
      quote.feeMicros,
      Math.ceil((quote.amountMicros - quote.feeMicros) / 100),
    );
    const fill = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: { ...traderHeaders, "idempotency-key": randomUUID() },
      payload: { ...input, limitMicros: quote.amountMicros },
    });
    assert.equal(fill.statusCode, 201, fill.body);
    assert.equal(fill.json().feeMicros, quote.feeMicros);
    assert.equal(
      fill.json().balanceMicros,
      5_000_000_000 - quote.amountMicros,
    );
    const sellInput = { ...input, action: "sell", shares: 40 };
    const sellQuote = (
      await app.inject({
        method: "POST",
        url: "/api/v1/quotes",
        payload: sellInput,
      })
    ).json();
    const sold = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: { ...traderHeaders, "idempotency-key": randomUUID() },
      payload: { ...sellInput, limitMicros: sellQuote.amountMicros },
    });
    assert.equal(sold.statusCode, 201, sold.body);
    const earned = quote.feeMicros + sellQuote.feeMicros;
    const after = (
      await app.inject({ url: "/api/v1/portfolio", headers })
    ).json();
    assert.equal(after.balanceMicros, 5_000_000_000 - stake + earned);
    assert.equal(after.created[0].feesMicros, earned);
    assert.equal(after.created[0].trades, 2);
    // House markets stay fee-free.
    const house = (
      await app.inject({
        method: "POST",
        url: "/api/v1/quotes",
        payload: order,
      })
    ).json();
    assert.equal(house.feeMicros, 0);
  } finally {
    await app.close();
  }
});

test("launch refuses expired deadlines and accounts that cannot cover the stake", async () => {
  const { app, headers } = await setup();
  try {
    const save = async (closesAt: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/drafts",
          headers,
          payload: { ...draft, closesAt },
        })
      ).json();
    const launch = (id: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/drafts/" + id + "/launch",
        headers,
        payload: { category: "World" },
      });
    const soon = await save(new Date(Date.now() + 1500).toISOString());
    await new Promise((resolve) => setTimeout(resolve, 1600));
    assert.equal((await launch(soon.id)).statusCode, 409);
    // 5,000 credits cover exactly ten 500-credit stakes.
    for (let index = 0; index < 10; index++)
      assert.equal(
        (await launch((await save(draft.closesAt)).id)).statusCode,
        201,
      );
    const broke = await launch((await save(draft.closesAt)).id);
    assert.equal(broke.statusCode, 409);
    assert.match(broke.json().message, /credits/);
  } finally {
    await app.close();
  }
});

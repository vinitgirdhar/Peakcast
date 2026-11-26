import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/app.js";

const CREDIT = 1_000_000;
const START = 5_000 * CREDIT;
const OPERATOR = "operator-secret-for-tests";
const draft = {
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
const evidenceUrl = "https://example.org/data/result";

async function setup() {
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    disputeWindowMs: 60,
  });
  const session = async () => ({
    authorization:
      "Bearer " +
      (await app.inject({ method: "POST", url: "/api/v1/sessions" })).json()
        .token,
  });
  const post = (
    url: string,
    headers: Record<string, string>,
    payload?: object,
  ) => app.inject({ method: "POST", url: "/api/v1" + url, headers, payload });
  const portfolio = async (headers: Record<string, string>) =>
    (await app.inject({ url: "/api/v1/portfolio", headers })).json();
  const buy = async (
    headers: Record<string, string>,
    marketId: string,
    outcome: string,
    shares: number,
  ) => {
    const input = { marketId, outcome, action: "buy", shares };
    const quote = (await post("/quotes", {}, input)).json();
    const fill = await post(
      "/trades",
      { ...headers, "idempotency-key": randomUUID() },
      { ...input, limitMicros: quote.amountMicros },
    );
    assert.equal(fill.statusCode, 201, fill.body);
  };
  const creator = await session();
  const saved = (await post("/drafts", creator, draft)).json();
  const market = (
    await post("/drafts/" + saved.id + "/launch", creator, {
      category: "Science",
    })
  ).json();
  const wait = () => new Promise((resolve) => setTimeout(resolve, 90));
  return { app, session, post, portfolio, buy, creator, market, wait };
}

test("creator proposal, challenge window and settlement pay winners and return leftover liquidity", async () => {
  const { app, session, post, portfolio, buy, creator, market, wait } =
    await setup();
  try {
    const bull = await session();
    const bear = await session();
    await buy(bull, market.id, "YES", 100);
    await buy(bear, market.id, "NO", 50);
    const base = "/markets/" + market.id;
    const proposal = { outcome: "YES", evidenceUrl };
    assert.equal(
      (await post(base + "/resolution", {}, proposal)).statusCode,
      401,
    );
    assert.equal(
      (await post(base + "/resolution", bull, proposal)).statusCode,
      403,
    );
    assert.equal(
      (
        await post(base + "/resolution", creator, {
          outcome: "MAYBE",
          evidenceUrl,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await post(base + "/resolution", creator, {
          outcome: "YES",
          evidenceUrl: "http://insecure.example.org",
        })
      ).statusCode,
      400,
    );
    const proposed = await post(base + "/resolution", creator, proposal);
    assert.equal(proposed.statusCode, 201, proposed.body);
    assert.equal(proposed.json().status, "proposed");
    assert.equal(proposed.json().resolution.outcome, "YES");
    assert.equal(proposed.json().resolution.evidenceUrl, evidenceUrl);
    assert.equal(
      (await post(base + "/resolution", creator, proposal)).statusCode,
      409,
    );
    // Trading halts the moment an outcome is proposed.
    assert.equal(
      (
        await post(
          "/quotes",
          {},
          { marketId: market.id, outcome: "YES", action: "buy", shares: 1 },
        )
      ).statusCode,
      409,
    );
    assert.equal((await post(base + "/settle", bull)).statusCode, 409);
    await wait();
    const beforeBull = (await portfolio(bull)).balanceMicros;
    const beforeBear = (await portfolio(bear)).balanceMicros;
    const settled = await post(base + "/settle", bear);
    assert.equal(settled.statusCode, 200, settled.body);
    assert.equal(settled.json().status, "resolved");
    assert.ok(settled.json().resolution.resolvedAt);
    assert.equal((await post(base + "/settle", bear)).statusCode, 409);
    assert.equal((await post(base + "/dispute", bear)).statusCode, 409);

    const bullAfter = await portfolio(bull);
    const bearAfter = await portfolio(bear);
    const creatorAfter = await portfolio(creator);
    assert.equal(bullAfter.balanceMicros, beforeBull + 100 * CREDIT);
    assert.equal(bearAfter.balanceMicros, beforeBear);
    assert.equal(bullAfter.positions.length, 0);
    assert.equal(bearAfter.positions.length, 0);
    assert.equal(bullAfter.ledger[0].kind, "payout");
    assert.equal(bullAfter.ledger[0].amountMicros, 100 * CREDIT);
    assert.equal(bullAfter.ledger[0].balanceMicros, bullAfter.balanceMicros);
    assert.ok(
      creatorAfter.ledger.some(
        (entry: { kind: string; amountMicros: number }) =>
          entry.kind === "stake_return" && entry.amountMicros > 0,
      ),
    );
    assert.equal(creatorAfter.created[0].status, "resolved");
    // Stake, trades, fees and payouts only move credits between accounts.
    assert.equal(
      bullAfter.balanceMicros +
        bearAfter.balanceMicros +
        creatorAfter.balanceMicros,
      3 * START,
    );
  } finally {
    await app.close();
  }
});

test("a disputed proposal waits for the operator; an overturned creator pays the disputer", async () => {
  const { app, session, post, portfolio, buy, creator, market, wait } =
    await setup();
  delete process.env.OPERATOR_TOKEN;
  try {
    const bull = await session();
    const bear = await session();
    await buy(bull, market.id, "YES", 100);
    await buy(bear, market.id, "NO", 50);
    const base = "/markets/" + market.id;
    assert.equal((await post(base + "/dispute", bear)).statusCode, 409);
    await post(base + "/resolution", creator, { outcome: "YES", evidenceUrl });
    assert.equal((await post(base + "/dispute", creator)).statusCode, 403);
    const beforeBear = (await portfolio(bear)).balanceMicros;
    const disputed = await post(base + "/dispute", bear);
    assert.equal(disputed.statusCode, 201, disputed.body);
    assert.equal(disputed.json().status, "disputed");
    assert.equal(
      (await portfolio(bear)).balanceMicros,
      beforeBear - 100 * CREDIT,
    );
    assert.equal((await post(base + "/dispute", bull)).statusCode, 409);
    await wait();
    assert.equal((await post(base + "/settle", bull)).statusCode, 409);

    const ruling = { outcome: "NO" };
    const token = { "x-operator-token": OPERATOR };
    assert.equal((await post(base + "/ruling", token, ruling)).statusCode, 503);
    process.env.OPERATOR_TOKEN = OPERATOR;
    assert.equal(
      (
        await post(
          base + "/ruling",
          { "x-operator-token": "wrong-operator-token-value" },
          ruling,
        )
      ).statusCode,
      403,
    );
    const ruled = await post(base + "/ruling", token, ruling);
    assert.equal(ruled.statusCode, 200, ruled.body);
    assert.equal(ruled.json().status, "resolved");
    assert.equal(ruled.json().resolution.outcome, "NO");
    assert.equal((await post(base + "/ruling", token, ruling)).statusCode, 409);

    const bearAfter = await portfolio(bear);
    // Bond back, 50 winning shares, plus the creator's 100-credit penalty.
    assert.equal(bearAfter.balanceMicros, beforeBear + 150 * CREDIT);
    const kinds = bearAfter.ledger.map((entry: { kind: string }) => entry.kind);
    assert.ok(kinds.includes("bond_return"));
    assert.ok(kinds.includes("dispute_reward"));
    assert.equal(
      bearAfter.balanceMicros +
        (await portfolio(bull)).balanceMicros +
        (await portfolio(creator)).balanceMicros,
      3 * START,
    );
  } finally {
    delete process.env.OPERATOR_TOKEN;
    await app.close();
  }
});

test("an upheld INVALID proposal pays half a credit per share and awards the bond to the creator", async () => {
  const { app, session, post, portfolio, buy, creator, market } = await setup();
  process.env.OPERATOR_TOKEN = OPERATOR;
  try {
    const bull = await session();
    const bear = await session();
    await buy(bull, market.id, "YES", 100);
    await buy(bear, market.id, "NO", 50);
    const base = "/markets/" + market.id;
    await post(base + "/resolution", creator, {
      outcome: "INVALID",
      evidenceUrl,
    });
    await post(base + "/dispute", bear);
    const beforeBull = (await portfolio(bull)).balanceMicros;
    const beforeBear = (await portfolio(bear)).balanceMicros;
    const ruled = await post(
      base + "/ruling",
      { "x-operator-token": OPERATOR },
      { outcome: "INVALID" },
    );
    assert.equal(ruled.statusCode, 200, ruled.body);
    assert.equal(
      (await portfolio(bull)).balanceMicros,
      beforeBull + 50 * CREDIT,
    );
    assert.equal(
      (await portfolio(bear)).balanceMicros,
      beforeBear + 25 * CREDIT,
    );
    const creatorAfter = await portfolio(creator);
    assert.ok(
      creatorAfter.ledger.some(
        (entry: { kind: string; amountMicros: number }) =>
          entry.kind === "bond_award" && entry.amountMicros === 100 * CREDIT,
      ),
    );
    assert.equal(
      creatorAfter.balanceMicros +
        (await portfolio(bull)).balanceMicros +
        (await portfolio(bear)).balanceMicros,
      3 * START,
    );
  } finally {
    delete process.env.OPERATOR_TOKEN;
    await app.close();
  }
});

test("house markets resolve only by operator ruling, and the ledger records every credit movement", async () => {
  const { app, session, post, portfolio, buy } = await setup();
  process.env.OPERATOR_TOKEN = OPERATOR;
  try {
    const trader = await session();
    await buy(trader, "fed-rate", "YES", 10);
    const afterBuy = await portfolio(trader);
    assert.equal(afterBuy.ledger.length, 1);
    assert.equal(afterBuy.ledger[0].kind, "trade");
    assert.equal(
      afterBuy.ledger[0].amountMicros,
      afterBuy.balanceMicros - START,
    );
    assert.equal(afterBuy.ledger[0].marketId, "fed-rate");
    assert.equal(
      (
        await post("/markets/fed-rate/resolution", trader, {
          outcome: "YES",
          evidenceUrl,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await post(
          "/markets/missing/ruling",
          { "x-operator-token": OPERATOR },
          { outcome: "YES" },
        )
      ).statusCode,
      404,
    );
    const ruled = await post(
      "/markets/fed-rate/ruling",
      { "x-operator-token": OPERATOR },
      { outcome: "YES" },
    );
    assert.equal(ruled.statusCode, 200, ruled.body);
    assert.equal(ruled.json().status, "resolved");
    assert.equal(
      (await portfolio(trader)).balanceMicros,
      afterBuy.balanceMicros + 10 * CREDIT,
    );
  } finally {
    delete process.env.OPERATOR_TOKEN;
    await app.close();
  }
});

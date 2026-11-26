import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../server/app.js";
import { ApiError, WildcatterClient } from "../shared/client.js";

const CREDIT = 1_000_000;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const OPERATOR = "operator-secret-for-tests";
const evidenceUrl = "https://example.org/data/result";
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
const noStats = {
  tradeCount: 0,
  volumeMicros: 0,
  resolvedMarkets: 0,
  wins: 0,
  winRate: 0,
  creatorFeesMicros: 0,
  payoutsMicros: 0,
};

type Auth = Record<string, string>;
interface Item {
  kind: string;
  marketId?: string;
  text: string;
  read: boolean;
}

async function setup(databasePath = ":memory:") {
  const app = await buildApp({
    databasePath,
    rateLimiting: false,
    disputeWindowMs: 40,
    autoSettleMs: 0,
  });
  const session = async (): Promise<Auth> => ({
    authorization:
      "Bearer " +
      (await app.inject({ method: "POST", url: "/api/v1/sessions" })).json()
        .token,
  });
  const post = (url: string, headers: Auth, payload?: object) =>
    app.inject({ method: "POST", url: "/api/v1" + url, headers, payload });
  const get = (url: string, headers: Auth = {}) =>
    app.inject({ url: "/api/v1" + url, headers });
  const buy = async (
    headers: Auth,
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
  const inbox = async (headers: Auth) =>
    (await get("/notifications", headers)).json() as {
      items: Item[];
      unread: number;
    };
  const portfolio = async (headers: Auth) =>
    (await get("/portfolio", headers)).json();
  const creator = await session();
  const saved = (await post("/drafts", creator, draft)).json();
  const market = (
    await post("/drafts/" + saved.id + "/launch", creator, {
      category: "Science",
    })
  ).json();
  return { app, session, post, get, buy, inbox, portfolio, creator, market };
}

/** Freezes Date at `iso`; the returned function moves it to `iso + ms`. */
function freezeClock(t: TestContext, iso: string) {
  const start = Date.parse(iso);
  t.mock.timers.enable({ apis: ["Date"], now: start });
  return (ms: number) => t.mock.timers.setTime(start + ms);
}

const kinds = (box: { items: Item[] }) => box.items.map((item) => item.kind);
const assertClose = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("notifications reach the right accounts for orders, proposals, disputes, outcomes and comments", async () => {
  const { app, session, post, get, buy, inbox, creator, market } =
    await setup();
  process.env.OPERATOR_TOKEN = OPERATOR;
  try {
    const bull = await session();
    const patient = await session();
    const mover = await session();
    const base = "/markets/" + market.id;
    const order = {
      marketId: market.id,
      outcome: "YES",
      action: "buy",
      shares: 50,
    };
    // A resting bid that fills when someone else moves the price.
    await post("/orders", patient, { ...order, limitPrice: 0.4 });
    await buy(mover, market.id, "NO", 400);
    // An order the owner cancels themselves is not announced.
    const own = (
      await post("/orders", patient, { ...order, limitPrice: 0.06 })
    ).json();
    const cancelled = await app.inject({
      method: "DELETE",
      url: "/api/v1/orders/" + own.id,
      headers: patient,
    });
    assert.equal(cancelled.statusCode, 200);
    await post("/orders", patient, { ...order, limitPrice: 0.05 });
    await post("/orders", mover, {
      ...order,
      action: "sell",
      limitPrice: 0.01,
    });
    await buy(bull, market.id, "YES", 100);
    await post(base + "/comments", bull, { body: "The source is solid." });
    await post(base + "/comments", creator, { body: "Thanks for trading." });
    await post(base + "/resolution", creator, { outcome: "YES", evidenceUrl });
    assert.equal((await post(base + "/dispute", mover)).statusCode, 201);
    const ruled = await post(
      base + "/ruling",
      { "x-operator-token": OPERATOR },
      { outcome: "YES" },
    );
    assert.equal(ruled.statusCode, 200, ruled.body);

    const creatorBox = await inbox(creator);
    assert.deepEqual(kinds(creatorBox), [
      "market_resolved",
      "dispute_filed",
      "comment",
    ]);
    assert.match(creatorBox.items[2].text, /^Trader [0-9A-F]{4} commented on/);
    const bullBox = await inbox(bull);
    assert.deepEqual(kinds(bullBox), [
      "market_resolved",
      "payout",
      "outcome_proposed",
    ]);
    assert.match(bullBox.items[1].text, /You received 100 credits/);
    assert.match(bullBox.items[0].text, /resolved YES/);
    const patientBox = await inbox(patient);
    assert.deepEqual(kinds(patientBox), [
      "market_resolved",
      "payout",
      "order_cancelled",
      "outcome_proposed",
      "order_filled",
    ]);
    assert.match(patientBox.items[2].text, /was cancelled\. Market resolved/);
    assert.match(
      patientBox.items[4].text,
      /^Your order to buy 50 YES on ".+" filled\.$/,
    );
    const moverBox = await inbox(mover);
    assert.deepEqual(kinds(moverBox), [
      "market_resolved",
      "outcome_proposed",
      "order_cancelled",
    ]);
    assert.match(moverBox.items[2].text, /enough shares/);
    for (const box of [creatorBox, bullBox, patientBox, moverBox])
      assert.ok(box.items.every((item) => item.marketId === market.id));

    assert.equal(bullBox.unread, 3);
    assert.ok(bullBox.items.every((item) => !item.read));
    assert.equal((await get("/notifications")).statusCode, 401);
    assert.equal((await post("/notifications/read", {})).statusCode, 401);
    assert.equal(
      (await post("/notifications/read", bull, { all: true })).statusCode,
      400,
    );
    const read = await post("/notifications/read", bull, {});
    assert.equal(read.statusCode, 200, read.body);
    assert.deepEqual(read.json(), { unread: 0 });
    const after = await inbox(bull);
    assert.equal(after.unread, 0);
    assert.ok(after.items.every((item) => item.read));
    // Reading is per account.
    assert.equal((await inbox(creator)).unread, 3);
  } finally {
    delete process.env.OPERATOR_TOKEN;
    await app.close();
  }
});

test("daily bonus pays once per UTC day and grows with the streak up to 100 credits", async (t) => {
  const advance = freezeClock(t, "2026-03-01T23:59:00.000Z");
  const { app, session, post, portfolio } = await setup();
  try {
    const claimer = await session();
    const claim = () => post("/bonus/claim", claimer);
    assert.deepEqual((await portfolio(claimer)).bonus, {
      available: true,
      streak: 0,
      nextAmountMicros: 50 * CREDIT,
    });
    assert.equal((await post("/bonus/claim", {})).statusCode, 401);
    assert.equal(
      (await post("/bonus/claim", claimer, { amountMicros: 100 * CREDIT }))
        .statusCode,
      400,
    );
    const first = await claim();
    assert.equal(first.statusCode, 200, first.body);
    assert.deepEqual(first.json(), {
      amountMicros: 50 * CREDIT,
      balanceMicros: 5_050 * CREDIT,
      bonus: { available: false, streak: 1, nextAmountMicros: 60 * CREDIT },
    });
    const again = await claim();
    assert.equal(again.statusCode, 409);
    assert.match(again.json().message, /already claimed/);
    const entry = (await portfolio(claimer)).ledger[0];
    assert.equal(entry.kind, "daily_bonus");
    assert.equal(entry.amountMicros, 50 * CREDIT);
    assert.ok(!("marketId" in entry));

    // Two minutes later it is a new UTC day and the streak carries on.
    advance(2 * 60_000);
    assert.deepEqual((await portfolio(claimer)).bonus, {
      available: true,
      streak: 1,
      nextAmountMicros: 60 * CREDIT,
    });
    const amounts = [(await claim()).json().amountMicros];
    for (let day = 1; day <= 5; day += 1) {
      advance(2 * 60_000 + day * DAY);
      amounts.push((await claim()).json().amountMicros);
    }
    assert.deepEqual(
      amounts.map((micros) => micros / CREDIT),
      [60, 70, 80, 90, 100, 100],
    );
    assert.deepEqual((await portfolio(claimer)).bonus, {
      available: false,
      streak: 7,
      nextAmountMicros: 100 * CREDIT,
    });
    // Skipping a day resets the streak.
    advance(2 * 60_000 + 7 * DAY);
    assert.deepEqual((await portfolio(claimer)).bonus, {
      available: true,
      streak: 0,
      nextAmountMicros: 50 * CREDIT,
    });
    assert.equal((await claim()).statusCode, 200);
    assert.equal(
      (await portfolio(claimer)).balanceMicros,
      (5_000 + 50 + 60 + 70 + 80 + 90 + 100 + 100 + 50) * CREDIT,
    );
    const spec = (await app.inject("/api/v1/openapi.json")).json();
    const route = spec.paths["/api/v1/bonus/claim"].post;
    assert.ok(route.responses["401"] && route.responses["409"]);
  } finally {
    await app.close();
  }
});

test("markets report the YES probability change over the last 24 hours", async (t) => {
  const advance = freezeClock(t, "2026-03-01T12:00:00.000Z");
  const { app, session, get, buy, market } = await setup();
  try {
    const read = async () => (await get("/markets/" + market.id)).json();
    assert.equal((await read()).change24h, 0);
    assert.equal((await get("/markets/fed-rate")).json().change24h, 0);
    await buy(await session(), market.id, "YES", 100);
    const early = await read();
    // No trade is a day old yet, so the baseline is the opening probability.
    assert.ok(early.change24h > 0);
    assertClose(early.change24h, early.probability - 0.5);

    advance(25 * HOUR);
    await buy(await session(), market.id, "NO", 300);
    const later = await read();
    assert.ok(later.change24h < 0);
    assertClose(later.change24h, later.probability - early.probability);
    const listed = (await get("/markets"))
      .json()
      .items.find((item: { id: string }) => item.id === market.id);
    assert.equal(listed.change24h, later.change24h);

    // A day after the last trade nothing has moved.
    advance(50 * HOUR);
    assertClose((await read()).change24h, 0);
  } finally {
    await app.close();
  }
});

test("portfolio stats count trades, volume, resolved markets, wins, fees and payouts", async (t) => {
  const advance = freezeClock(t, "2026-03-01T12:00:00.000Z");
  const { app, session, post, buy, portfolio, creator, market } = await setup();
  process.env.OPERATOR_TOKEN = OPERATOR;
  try {
    assert.deepEqual((await portfolio(await session())).stats, noStats);
    const trader = await session();
    await buy(trader, market.id, "YES", 100);
    await buy(trader, "fed-rate", "NO", 10);
    await post("/markets/" + market.id + "/resolution", creator, {
      outcome: "YES",
      evidenceUrl,
    });
    advance(60_000);
    assert.equal(
      (await post("/markets/" + market.id + "/settle", trader)).statusCode,
      200,
    );
    const ruled = await post(
      "/markets/fed-rate/ruling",
      { "x-operator-token": OPERATOR },
      { outcome: "YES" },
    );
    assert.equal(ruled.statusCode, 200, ruled.body);

    const mine = await portfolio(trader);
    assert.deepEqual(mine.stats, {
      tradeCount: 2,
      volumeMicros: mine.trades.reduce(
        (sum: number, trade: { amountMicros: number }) =>
          sum + trade.amountMicros,
        0,
      ),
      resolvedMarkets: 2,
      wins: 1,
      winRate: 0.5,
      creatorFeesMicros: 0,
      payoutsMicros: 100 * CREDIT,
    });
    const made = await portfolio(creator);
    assert.ok(made.created[0].feesMicros > 0);
    assert.deepEqual(made.stats, {
      ...noStats,
      creatorFeesMicros: made.created[0].feesMicros,
    });
  } finally {
    delete process.env.OPERATOR_TOKEN;
    await app.close();
  }
});

test("engagement responses never contain account ids", async (t) => {
  const advance = freezeClock(t, "2026-03-01T12:00:00.000Z");
  const dir = mkdtempSync(join(tmpdir(), "wildcatter-engagement-"));
  const path = join(dir, "privacy.sqlite");
  const { app, session, post, get, buy, inbox, creator, market } =
    await setup(path);
  try {
    const bull = await session();
    await buy(bull, market.id, "YES", 20);
    await post("/markets/" + market.id + "/comments", bull, {
      body: "The source is solid.",
    });
    await post("/markets/" + market.id + "/resolution", creator, {
      outcome: "YES",
      evidenceUrl,
    });
    advance(60_000);
    await post("/markets/" + market.id + "/settle", bull);
    assert.equal((await inbox(creator)).items.length, 2);
    assert.equal((await inbox(bull)).items.length, 3);
    const bodies = [(await post("/bonus/claim", bull)).body];
    for (const url of ["/notifications", "/portfolio"])
      for (const headers of [creator, bull])
        bodies.push((await get(url, headers)).body);
    bodies.push((await get("/markets")).body);
    const db = new DatabaseSync(path);
    const ids = (
      db.prepare("SELECT id FROM accounts").all() as { id: string }[]
    ).map((row) => row.id);
    db.close();
    assert.equal(ids.length, 2);
    for (const body of bodies)
      for (const id of ids) assert.ok(!body.includes(id), "account id leaked");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the SDK claims the bonus and reads and clears notifications over HTTP", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    autoSettleMs: 0,
  });
  try {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const { token } = await new WildcatterClient(base).createSession();
    const api = new WildcatterClient(base, token);
    const claim = await api.claimBonus();
    assert.equal(claim.amountMicros, 50 * CREDIT);
    assert.equal(claim.bonus.available, false);
    await assert.rejects(
      api.claimBonus(),
      (error) => error instanceof ApiError && error.status === 409,
    );
    const order = await api.placeOrder({
      marketId: "fed-rate",
      outcome: "YES",
      action: "sell",
      shares: 1,
      limitPrice: 0.01,
    });
    assert.equal(order.status, "cancelled");
    const box = await api.notifications();
    assert.equal(box.unread, 1);
    assert.equal(box.items[0].kind, "order_cancelled");
    assert.deepEqual(await api.markNotificationsRead(), { unread: 0 });
    assert.equal((await api.notifications()).unread, 0);
    const portfolio = await api.portfolio();
    assert.equal(portfolio.bonus.available, false);
    assert.deepEqual(portfolio.stats, noStats);
    assert.equal((await api.market("fed-rate")).change24h, 0);
  } finally {
    await app.close();
  }
});

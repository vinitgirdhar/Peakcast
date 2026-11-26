import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../server/app.js";
import {
  marketForecasts,
  rankForecasters,
  scoreForecasts,
  type ResolvedTrade,
} from "../server/calibration.js";
import { PeakcastClient } from "../shared/client.js";
import type {
  Calibration,
  Leaderboard,
  ResolutionOutcome,
} from "../shared/types.js";

const assertClose = (actual: number | null | undefined, expected: number) =>
  assert.ok(
    typeof actual === "number" && Math.abs(actual - expected) < 1e-9,
    `${actual} != ${expected}`,
  );
const trade = (
  marketId: string,
  outcome: ResolutionOutcome,
  weightMicros: number,
  probabilityBefore: number,
  probabilityAfter: number,
): ResolvedTrade => ({
  marketId,
  outcome,
  weightMicros,
  probabilityBefore,
  probabilityAfter,
});

test("per-market forecasts are size-weighted and only YES or NO resolutions count", () => {
  const forecasts = marketForecasts([
    trade("a", "YES", 3_000_000, 0.5, 0.6),
    trade("b", "NO", 2_000_000, 0.4, 0.2),
    trade("a", "YES", 1_000_000, 0.6, 0.8),
    trade("c", "INVALID", 5_000_000, 0.5, 0.9),
    // A trade that moved no credits carries no weight.
    trade("d", "YES", 0, 0.5, 0.7),
  ]);
  assert.equal(forecasts.length, 2);
  // (3 × 0.6 + 1 × 0.8) / 4 = 0.65; an unweighted mean would be 0.7.
  assertClose(forecasts[0].forecast, 0.65);
  // (3 × 0.5 + 1 × 0.6) / 4 = 0.525
  assertClose(forecasts[0].baseline, 0.525);
  assert.equal(forecasts[0].outcome, 1);
  assertClose(forecasts[1].forecast, 0.2);
  assertClose(forecasts[1].baseline, 0.4);
  assert.equal(forecasts[1].outcome, 0);
});

test("Brier score, crowd-baseline skill and buckets match hand-computed values", () => {
  const score = scoreForecasts([
    { forecast: 0.65, baseline: 0.525, outcome: 1 },
    { forecast: 0.2, baseline: 0.4, outcome: 0 },
  ]);
  assert.equal(score.resolvedMarkets, 2);
  // Mean over markets: (0.35² + 0.2²) / 2 = (0.1225 + 0.04) / 2
  assertClose(score.brier, 0.08125);
  // Baseline (0.475² + 0.4²) / 2 = 0.1928125, so skill = 0.1928125 − 0.08125.
  assertClose(score.skill, 0.1115625);
  assert.equal(score.buckets.length, 10);
  assert.deepEqual(
    score.buckets.map((bucket) => [bucket.from, bucket.to, bucket.count]),
    Array.from({ length: 10 }, (_, index) => [
      index / 10,
      (index + 1) / 10,
      index === 2 || index === 6 ? 1 : 0,
    ]),
  );
  assertClose(score.buckets[6].meanForecast, 0.65);
  assert.equal(score.buckets[6].observedRate, 1);
  assertClose(score.buckets[2].meanForecast, 0.2);
  assert.equal(score.buckets[2].observedRate, 0);
  assert.equal(score.buckets[0].meanForecast, null);
  assert.equal(score.buckets[0].observedRate, null);
});

test("a certain forecast lands in the top bucket and buckets average their markets", () => {
  const score = scoreForecasts([
    { forecast: 1, baseline: 0.5, outcome: 1 },
    { forecast: 0.95, baseline: 0.5, outcome: 0 },
    { forecast: 0, baseline: 0.5, outcome: 0 },
  ]);
  // (0² + 0.95² + 0²) / 3
  assertClose(score.brier, 0.9025 / 3);
  assertClose(score.skill, 0.25 - 0.9025 / 3);
  assert.equal(score.buckets[9].count, 2);
  assertClose(score.buckets[9].meanForecast, 0.975);
  assertClose(score.buckets[9].observedRate, 0.5);
  assert.equal(score.buckets[0].count, 1);
});

test("no resolved markets: Brier is null, skill is absent and every bucket is empty", () => {
  const score = scoreForecasts(marketForecasts([]));
  assert.equal(score.resolvedMarkets, 0);
  assert.equal(score.brier, null);
  assert.ok(!("skill" in score));
  assert.ok(score.buckets.every((bucket) => bucket.count === 0));
});

test("forecasters rank by lowest Brier with 3 resolved markets, top 20 plus the viewer", () => {
  const accounts = [
    // Perfect but too few markets to qualify.
    { id: "few", resolvedMarkets: 2, brier: 0 },
    { id: "none", resolvedMarkets: 0, brier: null },
    ...Array.from({ length: 25 }, (_, index) => ({
      id: `a${index}`,
      resolvedMarkets: 3,
      brier: 0.01 * (25 - index),
    })),
    // Same score as a24: more resolved markets ranks first.
    { id: "tie", resolvedMarkets: 5, brier: 0.01 },
  ];
  const ranked = rankForecasters(accounts, "a3");
  assert.deepEqual(
    ranked.slice(0, 3).map((row) => [row.rank, row.id]),
    [
      [1, "tie"],
      [2, "a24"],
      [3, "a23"],
    ],
  );
  assert.equal(ranked.length, 21);
  assert.deepEqual(ranked.at(-1), {
    id: "a3",
    rank: 23,
    resolvedMarkets: 3,
    brier: 0.01 * 22,
  });
  assert.ok(!ranked.some((row) => row.id === "few" || row.id === "none"));
  assert.equal(rankForecasters(accounts).length, 20);
});

// API integration: real trades, then markets resolved through propose/settle.

type Auth = Record<string, string>;
interface Fill {
  marketId: string;
  amountMicros: number;
  probabilityAfter: number;
}
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
const outcomes: ResolutionOutcome[] = ["YES", "NO", "YES", "INVALID"];

async function resolvedScenario(t: TestContext, databasePath = ":memory:") {
  const start = Date.parse("2026-03-01T12:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: start });
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
  const fills: { who: Auth; fill: Fill }[] = [];
  const buy = async (
    who: Auth,
    marketId: string,
    outcome: string,
    shares: number,
  ) => {
    const input = { marketId, outcome, action: "buy", shares };
    const quote = (await post("/quotes", {}, input)).json();
    const response = await post(
      "/trades",
      { ...who, "idempotency-key": randomUUID() },
      { ...input, limitMicros: quote.amountMicros },
    );
    assert.equal(response.statusCode, 201, response.body);
    fills.push({ who, fill: response.json() });
  };
  const calibration = async (who: Auth) =>
    (await get("/portfolio/calibration", who)).json() as Calibration;

  const creator = await session();
  const markets: string[] = [];
  while (markets.length < outcomes.length) {
    const saved = (await post("/drafts", creator, draft)).json();
    const launched = await post("/drafts/" + saved.id + "/launch", creator, {
      category: "Science",
    });
    assert.equal(launched.statusCode, 201, launched.body);
    markets.push(launched.json().id);
  }
  const [m1, m2, m3, m4] = markets;
  const sharp = await session();
  const dull = await session();
  const casual = await session();
  await buy(sharp, m1, "YES", 100);
  await buy(dull, m1, "NO", 60);
  // Its pre-trade price is the price dull's trade left behind.
  await buy(sharp, m1, "YES", 50);
  await buy(sharp, m2, "NO", 100);
  await buy(dull, m2, "YES", 60);
  await buy(sharp, m3, "YES", 100);
  await buy(dull, m3, "NO", 60);
  await buy(sharp, m4, "YES", 100);
  await buy(casual, m1, "YES", 10);

  const before = await calibration(sharp);
  for (const [index, id] of markets.entries()) {
    const proposed = await post("/markets/" + id + "/resolution", creator, {
      outcome: outcomes[index],
      evidenceUrl,
    });
    assert.equal(proposed.statusCode, 201, proposed.body);
  }
  const proposed = await calibration(sharp);
  t.mock.timers.setTime(start + 60_000);
  for (const id of markets)
    assert.equal(
      (await post("/markets/" + id + "/settle", creator)).statusCode,
      200,
    );

  /** What the pure scoring gives for one account's fills, prices read from the fills. */
  const expected = (who: Auth) => {
    const last = new Map<string, number>();
    const rows: ResolvedTrade[] = [];
    for (const { who: owner, fill } of fills) {
      // Launched markets open at 50%; each fill sets the next trade's price.
      const row = trade(
        fill.marketId,
        outcomes[markets.indexOf(fill.marketId)],
        fill.amountMicros,
        last.get(fill.marketId) ?? 0.5,
        fill.probabilityAfter,
      );
      last.set(fill.marketId, fill.probabilityAfter);
      if (owner === who) rows.push(row);
    }
    return scoreForecasts(marketForecasts(rows));
  };
  return {
    app,
    get,
    calibration,
    expected,
    before,
    proposed,
    creator,
    sharp,
    dull,
    casual,
  };
}

test("calibration scores own resolved YES/NO markets and the accuracy board ranks forecasters", async (t) => {
  const s = await resolvedScenario(t);
  try {
    for (const early of [s.before, s.proposed]) {
      // Nothing counts until a market is resolved, not merely proposed.
      assert.equal(early.resolvedMarkets, 0);
      assert.equal(early.brier, null);
      assert.ok(!("skill" in early));
      assert.equal(early.buckets.length, 10);
    }
    assert.equal((await s.get("/portfolio/calibration")).statusCode, 401);

    const sharp = await s.calibration(s.sharp);
    const dull = await s.calibration(s.dull);
    // m4 resolved INVALID and is excluded.
    assert.equal(sharp.resolvedMarkets, 3);
    assert.equal(dull.resolvedMarkets, 3);
    for (const [actual, wanted] of [
      [sharp, s.expected(s.sharp)],
      [dull, s.expected(s.dull)],
    ]) {
      assertClose(actual.brier, wanted.brier!);
      assertClose(actual.skill, wanted.skill!);
      assert.deepEqual(
        actual.buckets.map((bucket) => bucket.count),
        wanted.buckets.map((bucket) => bucket.count),
      );
    }
    assert.ok(sharp.brier! < 0.25 && sharp.skill! > 0);
    assert.ok(dull.brier! > sharp.brier! && dull.skill! < 0);
    assert.equal(
      sharp.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      3,
    );
    assert.equal((await s.calibration(s.casual)).resolvedMarkets, 1);
    assert.equal((await s.calibration(s.creator)).brier, null);

    const board = (await s.get("/leaderboard", s.sharp)).json() as Leaderboard;
    // casual has one resolved market and the creator never traded.
    assert.deepEqual(
      board.forecasters.map((row) => [row.rank, row.you, row.resolvedMarkets]),
      [
        [1, true, 3],
        [2, false, 3],
      ],
    );
    assertClose(board.forecasters[0].brier, sharp.brier!);
    assertClose(board.forecasters[1].brier, dull.brier!);
    assert.match(board.forecasters[0].trader, /^Trader [0-9A-F]{4}$/);
    assert.notEqual(board.forecasters[0].trader, board.forecasters[1].trader);
    const anonymous = (await s.get("/leaderboard")).json() as Leaderboard;
    assert.ok(anonymous.forecasters.every((row) => !row.you));
  } finally {
    await s.app.close();
  }
});

test("accuracy board and calibration responses never contain account ids", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "peakcast-calibration-"));
  const path = join(dir, "privacy.sqlite");
  const s = await resolvedScenario(t, path);
  try {
    const bodies = [(await s.get("/leaderboard")).body];
    for (const who of [s.creator, s.sharp, s.dull, s.casual]) {
      bodies.push((await s.get("/leaderboard", who)).body);
      bodies.push((await s.get("/portfolio/calibration", who)).body);
    }
    assert.ok(
      (JSON.parse(bodies[0]) as Leaderboard).forecasters.length > 0,
      "the board under test is not empty",
    );
    const db = new DatabaseSync(path);
    const ids = (
      db.prepare("SELECT id FROM accounts").all() as { id: string }[]
    ).map((row) => row.id);
    db.close();
    assert.equal(ids.length, 4);
    for (const body of bodies)
      for (const id of ids) assert.ok(!body.includes(id), "account id leaked");
  } finally {
    await s.app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the SDK reads calibration and the accuracy board over HTTP", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    autoSettleMs: 0,
  });
  try {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const { token } = await new PeakcastClient(base).createSession();
    const api = new PeakcastClient(base, token);
    const mine = await api.calibration();
    assert.equal(mine.brier, null);
    assert.equal(mine.buckets.length, 10);
    assert.deepEqual((await api.leaderboard()).forecasters, []);
    const spec = (await app.inject("/api/v1/openapi.json")).json();
    assert.ok(spec.paths["/api/v1/portfolio/calibration"].get.responses["401"]);
  } finally {
    await app.close();
  }
});

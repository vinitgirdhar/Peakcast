import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { buildApp } from "../server/app.js";

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

async function setup(autoSettleMs = 0) {
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    disputeWindowMs: 40,
    autoSettleMs,
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
  const get = (url: string, headers: Record<string, string> = {}) =>
    app.inject({ url: "/api/v1" + url, headers });
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
  return { app, session, post, get, buy, creator, market };
}

test("undisputed proposals are paid out automatically after the challenge window", async () => {
  const { app, session, post, get, buy, creator, market } = await setup(20);
  try {
    const bull = await session();
    await buy(bull, market.id, "YES", 100);
    const proposed = await post(
      "/markets/" + market.id + "/resolution",
      creator,
      { outcome: "YES", evidenceUrl: "https://example.org/data/result" },
    );
    assert.equal(proposed.statusCode, 201, proposed.body);
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Nobody called /settle: the sweeper finished the job.
    assert.equal(
      (await get("/markets/" + market.id)).json().status,
      "resolved",
    );
    const ledger = (await get("/portfolio", bull)).json().ledger;
    assert.ok(
      ledger.some(
        (entry: { kind: string; amountMicros: number }) =>
          entry.kind === "payout" && entry.amountMicros === 100_000_000,
      ),
    );
  } finally {
    await app.close();
  }
});

test("market trade feed is public, newest first and hides account ids", async () => {
  const { app, session, get, buy, market } = await setup();
  try {
    const bull = await session();
    const bear = await session();
    await buy(bull, market.id, "YES", 10);
    await buy(bear, market.id, "NO", 5);
    const feed = await get("/markets/" + market.id + "/trades");
    assert.equal(feed.statusCode, 200, feed.body);
    const items = feed.json().items;
    assert.equal(items.length, 2);
    assert.deepEqual(
      items.map((item: { outcome: string; shares: number }) => [
        item.outcome,
        item.shares,
      ]),
      [
        ["NO", 5],
        ["YES", 10],
      ],
    );
    assert.match(items[0].trader, /^Trader [0-9A-F]{4}$/);
    assert.notEqual(items[0].trader, items[1].trader);
    assert.ok(!("accountId" in items[0]));
    assert.equal((await get("/markets/unknown/trades")).statusCode, 404);
  } finally {
    await app.close();
  }
});

test("leaderboard ranks traders by profit and creators by fees, and flags the viewer", async () => {
  const { app, session, get, buy, creator, market } = await setup();
  try {
    const early = await session();
    const late = await session();
    // Both buyers are marked above cost once the price has moved up.
    await buy(early, market.id, "YES", 100);
    await buy(late, market.id, "YES", 300);
    const board = (await get("/leaderboard", early)).json();
    assert.equal(board.traders.length, 3);
    assert.deepEqual(
      board.traders.map((row: { rank: number }) => row.rank),
      [1, 2, 3],
    );
    const mine = board.traders.filter((row: { you: boolean }) => row.you);
    assert.equal(mine.length, 1);
    assert.ok(mine[0].pnlMicros > 0);
    assert.equal(mine[0].trades, 1);
    assert.ok(board.traders[0].pnlMicros >= board.traders[1].pnlMicros);
    assert.ok(board.traders[1].pnlMicros >= board.traders[2].pnlMicros);
    assert.equal(board.creators.length, 1);
    assert.equal(board.creators[0].markets, 1);
    assert.ok(board.creators[0].feesMicros > 0);
    assert.equal(board.creators[0].you, false);
    assert.equal(
      (await get("/leaderboard", creator)).json().creators[0].you,
      true,
    );
    // Signed-out and bad-token viewers still get the public ranking.
    const anonymous = await get("/leaderboard");
    assert.equal(anonymous.statusCode, 200, anonymous.body);
    assert.ok(
      anonymous.json().traders.every((row: { you: boolean }) => !row.you),
    );
    assert.equal(
      (await get("/leaderboard", { authorization: "Bearer nope" })).statusCode,
      200,
    );
  } finally {
    await app.close();
  }
});

test("limit orders rest, fill when the price arrives, cancel and expire on resolution", async () => {
  const { app, session, post, get, buy, creator, market } = await setup();
  try {
    const patient = await session();
    const mover = await session();
    const order = {
      marketId: market.id,
      outcome: "YES",
      action: "buy",
      shares: 50,
    };
    assert.equal(
      (await post("/orders", {}, { ...order, limitPrice: 0.4 })).statusCode,
      401,
    );
    assert.equal(
      (await post("/orders", patient, { ...order, limitPrice: 1.5 }))
        .statusCode,
      400,
    );
    // The market opens at 50%, so a 40-cent bid rests.
    const resting = await post("/orders", patient, {
      ...order,
      limitPrice: 0.4,
    });
    assert.equal(resting.statusCode, 201, resting.body);
    assert.equal(resting.json().status, "open");
    // Someone else pushes YES down; the bid fills without the owner acting.
    await buy(mover, market.id, "NO", 400);
    const after = (await get("/portfolio", patient)).json();
    assert.equal(after.orders[0].status, "filled");
    assert.equal(after.positions[0].shares, 50);
    assert.ok(after.positions[0].costMicros <= 50 * 0.4 * 1_000_000);
    // An order already inside its limit fills immediately.
    const instant = await post("/orders", patient, {
      ...order,
      shares: 5,
      limitPrice: 0.99,
    });
    assert.equal(instant.json().status, "filled");
    // Selling shares the account does not hold is cancelled with a reason.
    const uncovered = await post("/orders", mover, {
      ...order,
      action: "sell",
      limitPrice: 0.01,
    });
    assert.equal(uncovered.json().status, "cancelled");
    assert.match(uncovered.json().note, /enough shares/);

    const low = (
      await post("/orders", patient, { ...order, limitPrice: 0.05 })
    ).json();
    const cancel = (headers: Record<string, string>) =>
      app.inject({
        method: "DELETE",
        url: "/api/v1/orders/" + low.id,
        headers,
      });
    assert.equal((await cancel(mover)).statusCode, 404);
    assert.equal((await cancel(patient)).statusCode, 200);
    assert.equal((await cancel(patient)).statusCode, 404);

    // Resolution cancels whatever is still resting.
    await post("/orders", patient, { ...order, limitPrice: 0.05 });
    await post("/markets/" + market.id + "/resolution", creator, {
      outcome: "YES",
      evidenceUrl: "https://example.org/data/result",
    });
    assert.equal(
      (await post("/orders", patient, { ...order, limitPrice: 0.05 }))
        .statusCode,
      409,
    );
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(
      (await post("/markets/" + market.id + "/settle", patient)).statusCode,
      200,
    );
    const final = (await get("/portfolio", patient)).json().orders[0];
    assert.equal(final.status, "cancelled");
    assert.match(final.note, /resolved/);
  } finally {
    await app.close();
  }
});

test("comments are public, show which side the commenter holds, and are rate limited", async () => {
  const { app, session, post, get, buy, market } = await setup();
  try {
    const author = await session();
    const reader = await session();
    const url = "/markets/" + market.id + "/comments";
    assert.equal((await post(url, {}, { body: "Hello" })).statusCode, 401);
    assert.equal((await post(url, author, { body: "   " })).statusCode, 400);
    assert.equal(
      (await post(url, author, { body: "x".repeat(501) })).statusCode,
      400,
    );
    assert.equal(
      (await post("/markets/unknown/comments", author, { body: "Hello" }))
        .statusCode,
      404,
    );
    await buy(author, market.id, "YES", 10);
    const posted = await post(url, author, {
      body: "  The source publishes on Friday.  ",
    });
    assert.equal(posted.statusCode, 201, posted.body);
    assert.equal(posted.json().body, "The source publishes on Friday.");
    assert.equal(posted.json().holds, "YES");
    assert.equal((await post(url, author, { body: "Again" })).statusCode, 429);
    const mine = (await get(url, author)).json().items;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].you, true);
    assert.match(mine[0].trader, /^Trader [0-9A-F]{4}$/);
    assert.equal((await get(url, reader)).json().items[0].you, false);
    assert.equal((await get(url)).json().items[0].you, false);
  } finally {
    await app.close();
  }
});

test("watchlist adds and removes markets idempotently", async () => {
  const { app, session, get, market } = await setup();
  try {
    const viewer = await session();
    const watch = (
      method: "PUT" | "DELETE",
      id: string,
      headers: Record<string, string> = viewer,
    ) => app.inject({ method, url: "/api/v1/watchlist/" + id, headers });
    assert.equal((await watch("PUT", market.id, {})).statusCode, 401);
    assert.equal((await watch("PUT", "unknown")).statusCode, 404);
    assert.deepEqual((await watch("PUT", market.id)).json(), {
      watching: true,
    });
    assert.equal((await watch("PUT", market.id)).statusCode, 200);
    assert.deepEqual((await get("/portfolio", viewer)).json().watchlist, [
      market.id,
    ]);
    assert.deepEqual((await watch("DELETE", market.id)).json(), {
      watching: false,
    });
    assert.deepEqual((await get("/portfolio", viewer)).json().watchlist, []);
  } finally {
    await app.close();
  }
});

test("daily bonus credits are not counted as trading profit", async () => {
  const { app, session, post, get } = await setup();
  try {
    const viewer = await session();
    assert.equal((await post("/bonus/claim", viewer)).statusCode, 200);
    const portfolio = (await get("/portfolio", viewer)).json();
    assert.equal(portfolio.balanceMicros, 5_050_000_000);
    assert.equal(portfolio.pnlMicros, 0);
    const mine = (await get("/leaderboard", viewer))
      .json()
      .traders.find((row: { you: boolean }) => row.you);
    assert.equal(mine.pnlMicros, 0);
  } finally {
    await app.close();
  }
});

test("hosted deployments redirect the Windows download to its release asset", async () => {
  const { app } = await setup();
  const home = process.cwd();
  // A folder without release/downloads stands in for the hosted server.
  process.chdir(tmpdir());
  try {
    const download = () =>
      app.inject({ url: "/downloads/Peakcast-Windows.zip" });
    assert.equal((await download()).statusCode, 404);
    process.env.WINDOWS_DOWNLOAD_URL = "http://insecure.example.org/app.zip";
    assert.equal((await download()).statusCode, 404);
    process.env.WINDOWS_DOWNLOAD_URL = "https://example.org/app.zip";
    const redirect = await download();
    assert.equal(redirect.statusCode, 302);
    assert.equal(redirect.headers.location, "https://example.org/app.zip");
    const apk = () => app.inject({ url: "/downloads/Peakcast-Android.apk" });
    assert.equal((await apk()).statusCode, 404);
    process.env.ANDROID_DOWNLOAD_URL = "https://example.org/app.apk";
    assert.equal((await apk()).headers.location, "https://example.org/app.apk");
  } finally {
    delete process.env.WINDOWS_DOWNLOAD_URL;
    delete process.env.ANDROID_DOWNLOAD_URL;
    process.chdir(home);
    await app.close();
  }
});

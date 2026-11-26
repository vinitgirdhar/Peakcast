import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import initSqlJs from "sql.js";
import { createEngine } from "../src/local/engine.js";
import { sha256 } from "../src/local/node-crypto.js";
import { SqlJsDatabase } from "../src/local/sqlite.js";

const SQL = await initSqlJs();
const origin = "https://appassets.androidplatform.net";

function client(engine: ReturnType<typeof createEngine>) {
  return async (path: string, init: RequestInit = {}) => {
    const response = await engine.handle(
      new Request(origin + "/api/v1" + path, {
        ...init,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      }),
    );
    return { status: response.status, body: await response.json() };
  };
}

test("on-device SHA-256 matches node:crypto", () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 200, 1000]) {
    const bytes = new Uint8Array(randomBytes(length));
    assert.equal(
      Buffer.from(sha256(bytes)).toString("hex"),
      createHash("sha256").update(bytes).digest("hex"),
      `length ${length}`,
    );
  }
});

test("the on-device engine trades, saves and reopens with the account intact", async () => {
  let writes = 0;
  const first = createEngine(SQL, undefined, () => writes++);
  const api = client(first);

  const capabilities = await api("/capabilities");
  assert.equal(capabilities.status, 200);
  assert.deepEqual(
    { teams: capabilities.body.teams, share: capabilities.body.shareOrigin },
    { teams: false, share: null },
  );
  assert.ok(capabilities.body.marketCount > 0, "seed markets exist");

  const session = await api("/sessions", { method: "POST" });
  assert.equal(session.status, 201);
  const auth = { Authorization: `Bearer ${session.body.token}` };
  const onboarded = await api("/account", {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({
      displayName: "Device Check",
      acceptTerms: true,
      confirmAdult: true,
    }),
  });
  assert.equal(onboarded.status, 200, JSON.stringify(onboarded.body));

  const order = {
    marketId: "fed-rate",
    outcome: "YES",
    action: "buy",
    shares: 10,
  };
  const quote = await api("/quotes", {
    method: "POST",
    body: JSON.stringify(order),
  });
  assert.equal(quote.status, 200);
  const trade = await api("/trades", {
    method: "POST",
    headers: { ...auth, "Idempotency-Key": "device-check-0001" },
    body: JSON.stringify({ ...order, limitMicros: quote.body.amountMicros }),
  });
  assert.equal(trade.status, 201, JSON.stringify(trade.body));
  assert.ok(writes > 0, "writes are reported so the app can save");

  // Same validation and errors as the Node server.
  const badTrade = await api("/trades", {
    method: "POST",
    headers: auth,
    body: JSON.stringify(order),
  });
  assert.equal(badTrade.status, 400);
  assert.equal((await api("/markets/nope")).status, 404);
  assert.equal((await api("/portfolio")).status, 401);
  assert.equal((await api("/nothing-here")).status, 404);

  // Reopen from the saved bytes, as the app does on its next launch.
  const reopened = client(createEngine(SQL, first.export(), () => undefined));
  const account = await reopened("/account", { headers: auth });
  assert.equal(account.status, 200);
  assert.equal(account.body.displayName, "Device Check");
  const portfolio = await reopened("/portfolio", { headers: auth });
  assert.equal(portfolio.body.positions[0].shares, 10);

  // Saving keeps the running engine usable.
  first.export();
  assert.equal((await api("/account", { headers: auth })).status, 200);
});

test("export keeps foreign keys enforced on the reopened connection", () => {
  const database = new SqlJsDatabase(SQL);
  database.export();
  assert.deepEqual(
    { ...database.prepare("PRAGMA foreign_keys").get() },
    { foreign_keys: 1 },
  );
});

test("a new install opens with sample players on every leaderboard, seeded once", async () => {
  const engine = createEngine(SQL, undefined, () => undefined);
  engine.seedSamples();
  const board = (await client(engine)("/leaderboard")).body as {
    traders: unknown[];
    creators: unknown[];
    forecasters: unknown[];
  };
  assert.ok(board.traders.length >= 10, `traders: ${board.traders.length}`);
  assert.ok(board.creators.length >= 4, `creators: ${board.creators.length}`);
  assert.ok(
    board.forecasters.length >= 3,
    `forecasters: ${board.forecasters.length}`,
  );
  const markets = (await client(engine)("/markets")).body.items as {
    status: string;
    volumeMicros: number;
  }[];
  assert.ok(markets.some((market) => market.status === "resolved"));
  assert.ok(markets.filter((market) => market.volumeMicros > 0).length >= 8);

  const second = createEngine(SQL, engine.export(), () => undefined);
  second.seedSamples();
  const reopened = client(second);
  const again = (await reopened("/leaderboard")).body as { traders: unknown[] };
  assert.equal(again.traders.length, board.traders.length, "seeded only once");
});

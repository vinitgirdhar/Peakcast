import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashToken } from "../server/database.js";
import {
  HOST,
  START,
  teamsApp,
  type Headers,
  type Method,
} from "./teams-fixture.js";

// Tenant isolation: a private market must be invisible to everyone outside
// its workspace, on every route, and must never leak into public responses.
const OPERATOR = "operator-secret-for-isolation";
const evidenceUrl = "https://example.org/data/result";

function staticRoot() {
  const root = mkdtempSync(join(tmpdir(), "peakcast-isolation-"));
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><html><head><title>Peakcast</title></head><body></body></html>",
  );
  return root;
}

/** A workspace with an open private market, a resting order, a comment and three resolved markets. */
async function privateWorld() {
  const t = await teamsApp({ staticRoot: staticRoot(), disputeWindowMs: 0 });
  const owner = await t.session();
  const member = await t.session();
  const outsider = await t.session();
  const workspace = await t.createWorkspace(
    owner,
    "Secret Guild",
    "Ozzie Owner",
  );
  await t.join(owner, workspace.id, member, "Mona Member");
  const open = await t.launch(
    owner,
    "Will the secret merger close this quarter?",
    workspace.id,
  );
  await t.buy(member, open.id, "YES", 20);
  const order = await t.ok(
    "POST",
    "/orders",
    member,
    {
      marketId: open.id,
      outcome: "NO",
      action: "buy",
      shares: 5,
      limitPrice: 0.01,
    },
    201,
  );
  assert.equal(order.status, "open");
  await t.ok(
    "POST",
    `/markets/${open.id}/comments`,
    member,
    { body: "Mona thinks the merger closes." },
    201,
  );
  await t.ok("PUT", `/watchlist/${open.id}`, member);
  const resolved = [];
  for (const index of [1, 2, 3]) {
    const market = await t.launch(
      owner,
      `Will secret project ${index} ship on time?`,
      workspace.id,
    );
    await t.buy(member, market.id, "YES", 10);
    await t.ok(
      "POST",
      `/markets/${market.id}/resolution`,
      owner,
      { outcome: "YES", evidenceUrl },
      201,
    );
    await t.ok("POST", `/markets/${market.id}/settle`, member);
    resolved.push(market);
  }
  // Public activity, so public feeds have something in them.
  await t.buy(outsider, "fed-rate", "YES", 5);
  await t.ok(
    "POST",
    "/markets/fed-rate/comments",
    outsider,
    { body: "Public view." },
    201,
  );
  const inviteToken = await t.invite(owner, workspace.id);
  const invites = await t.ok(
    "GET",
    `/workspaces/${workspace.id}/invites`,
    owner,
  );
  const secrets = [
    workspace.id,
    workspace.name,
    "Ozzie Owner",
    "Mona Member",
    ...[open, ...resolved].flatMap((market) => [market.id, market.title]),
  ];
  return {
    t,
    owner,
    member,
    outsider,
    workspace,
    open,
    order,
    inviteToken,
    inviteId: invites.items[0].id as string,
    memberId: await t.memberId(owner, workspace.id, "Mona Member"),
    secrets,
  };
}

interface Ids {
  market: string;
  order: string;
  wid: string;
  invite: string;
  member: string;
}
interface Call {
  query?: string;
  payload?: object;
  headers?: Headers;
}
const tradeInput = (ids: Ids) => ({
  marketId: ids.market,
  outcome: "YES",
  action: "buy",
  shares: 1,
});
/**
 * Every market- or workspace-scoped route with a minimal valid request. The
 * sweep fails when the OpenAPI document gains a route missing from this table.
 */
const cases: Record<string, (ids: Ids) => Call> = {
  "GET /api/v1/markets/{id}": () => ({}),
  "GET /api/v1/markets/{id}/history": () => ({}),
  "GET /api/v1/markets/{id}/trades": () => ({}),
  "GET /api/v1/markets/{id}/comments": () => ({}),
  "POST /api/v1/markets/{id}/comments": () => ({ payload: { body: "Hello" } }),
  "POST /api/v1/markets/{id}/resolution": () => ({
    payload: { outcome: "YES", evidenceUrl },
  }),
  "POST /api/v1/markets/{id}/dispute": () => ({}),
  "POST /api/v1/markets/{id}/settle": () => ({}),
  "POST /api/v1/markets/{id}/ruling": () => ({
    headers: { "x-operator-token": OPERATOR },
    payload: { outcome: "YES" },
  }),
  "POST /api/v1/quotes": (ids) => ({ payload: tradeInput(ids) }),
  "POST /api/v1/trades": (ids) => ({
    headers: { "idempotency-key": randomUUID() },
    payload: { ...tradeInput(ids), limitMicros: START },
  }),
  "POST /api/v1/orders": (ids) => ({
    payload: { ...tradeInput(ids), limitPrice: 0.5 },
  }),
  "DELETE /api/v1/orders/{id}": () => ({}),
  "PUT /api/v1/watchlist/{id}": () => ({}),
  "DELETE /api/v1/watchlist/{id}": () => ({}),
  "GET /api/v1/oembed": (ids) => ({
    query: `?url=${encodeURIComponent(`http://${HOST}/markets/${ids.market}`)}`,
  }),
  "GET /api/v1/workspaces/{wid}": () => ({}),
  "PATCH /api/v1/workspaces/{wid}": () => ({ payload: { name: "Renamed" } }),
  "GET /api/v1/workspaces/{wid}/invites": () => ({}),
  "POST /api/v1/workspaces/{wid}/invites": () => ({
    payload: { role: "member" },
  }),
  "DELETE /api/v1/workspaces/{wid}/invites/{inviteId}": () => ({}),
  "PATCH /api/v1/workspaces/{wid}/members/{memberId}": () => ({
    payload: { role: "resolver" },
  }),
  "DELETE /api/v1/workspaces/{wid}/members/{memberId}": () => ({}),
  "GET /api/v1/workspaces/{wid}/markets": () => ({}),
  "GET /api/v1/workspaces/{wid}/portfolio": () => ({}),
  "GET /api/v1/workspaces/{wid}/leaderboard": () => ({}),
  "POST /api/v1/workspaces/{wid}/markets/{id}/ruling": () => ({
    payload: { outcome: "YES" },
  }),
};
const scoped =
  /\/markets\/\{id\}|\/quotes|\/trades|\/orders|\/watchlist\/\{id\}|\/oembed|\/workspaces\/\{wid\}/;

const url = (path: string, ids: Ids, query = "") =>
  path
    .replace(
      "{id}",
      path.startsWith("/api/v1/orders/") ? ids.order : ids.market,
    )
    .replace("{wid}", ids.wid)
    .replace("{inviteId}", ids.invite)
    .replace("{memberId}", ids.member) + query;

test("isolation sweep: every scoped route answers a non-member exactly like an unknown id", async () => {
  process.env.OPERATOR_TOKEN = OPERATOR;
  const world = await privateWorld();
  const { t, outsider, member } = world;
  try {
    const spec = (await t.call("GET", "/openapi.json")).json() as {
      paths: Record<string, Record<string, unknown>>;
    };
    const routes = Object.entries(spec.paths)
      .flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
      )
      .filter((route) => scoped.test(route))
      .sort();
    assert.deepEqual(routes, Object.keys(cases).sort());

    const hidden: Ids = {
      market: world.open.id,
      order: world.order.id,
      wid: world.workspace.id,
      invite: world.inviteId,
      member: world.memberId,
    };
    const unknown: Ids = {
      market: "no-such-market",
      order: randomUUID(),
      wid: randomUUID(),
      invite: randomUUID(),
      member: randomUUID(),
    };
    const send = (route: string, ids: Ids, caller: Headers) => {
      const [method, path] = route.split(" ") as [Method, string];
      const request = cases[route](ids);
      return t.call(
        method,
        url(path, ids, request.query),
        { ...caller, ...request.headers },
        request.payload,
      );
    };
    const outsiderBalance = (await t.ok("GET", "/portfolio", outsider))
      .balanceMicros;
    const matrix: string[] = [];
    for (const route of routes)
      for (const [who, caller] of [
        ["outsider", outsider],
        ["anonymous", {}],
      ] as const) {
        const seen = await send(route, hidden, caller);
        const baseline = await send(route, unknown, caller);
        assert.equal(seen.statusCode, baseline.statusCode, `${who} ${route}`);
        assert.equal(seen.body, baseline.body, `${who} ${route}`);
        if (who === "outsider") assert.equal(seen.statusCode, 404, route);
        matrix.push(`${who} ${route} -> ${seen.statusCode}`);
      }
    assert.equal(matrix.length, 2 * Object.keys(cases).length);

    // The private ids are real: a member reaches the same market.
    assert.equal(
      (await t.call("GET", `/markets/${world.open.id}`, member)).statusCode,
      200,
    );
    // Nothing the sweep sent changed private state.
    const wallet = await t.ok(
      "GET",
      `/workspaces/${world.workspace.id}/portfolio`,
      member,
    );
    assert.equal(
      wallet.orders.find((o: { id: string }) => o.id === world.order.id).status,
      "open",
    );
    assert.equal(
      (await t.ok("GET", `/markets/${world.open.id}`, member)).trades,
      1,
    );
    assert.equal(
      (await t.ok("GET", "/portfolio", outsider)).balanceMicros,
      outsiderBalance,
    );
  } finally {
    delete process.env.OPERATOR_TOKEN;
    await t.close();
  }
});

test("embeds, oEmbed and link previews treat a private market as unknown", async () => {
  const world = await privateWorld();
  const { t } = world;
  const get = (path: string) =>
    t.app.inject({ url: path, headers: { host: HOST } });
  try {
    for (const path of [
      "/embed/markets/{id}",
      "/embed/markets/{id}?theme=dark",
      "/markets/{id}",
      "/markets/{id}/rules",
    ]) {
      const seen = await get(path.replace("{id}", world.open.id));
      const baseline = await get(path.replace("{id}", "no-such-market"));
      assert.equal(seen.statusCode, baseline.statusCode, path);
      assert.equal(seen.body, baseline.body, path);
      assert.ok(!seen.body.includes(world.open.title), path);
      assert.ok(!seen.body.includes("og:title"), path);
    }
    // Control: a public market page does unfurl.
    assert.ok((await get("/markets/fed-rate")).body.includes("og:title"));
    assert.equal((await get("/embed/markets/fed-rate")).statusCode, 200);
  } finally {
    await t.close();
  }
});

test("leak scan: public responses never contain private ids, titles, workspace or member names", async () => {
  const world = await privateWorld();
  const { t, owner, member, outsider, workspace, secrets } = world;
  try {
    const reads: [string, Headers][] = [];
    for (const viewer of [{}, outsider, owner, member])
      reads.push(
        ["/markets", viewer],
        ["/markets?search=secret", viewer],
        ["/leaderboard", viewer],
        ["/capabilities", viewer],
        ["/markets/fed-rate", viewer],
        ["/markets/fed-rate/trades", viewer],
        ["/markets/fed-rate/comments", viewer],
        ["/markets/fed-rate/history", viewer],
      );
    for (const viewer of [outsider, owner, member])
      reads.push(["/portfolio", viewer], ["/portfolio/calibration", viewer]);
    reads.push(["/notifications", outsider], ["/drafts", member]);
    for (const [path, viewer] of reads) {
      const response = await t.call("GET", path, viewer);
      assert.equal(response.statusCode, 200, path);
      for (const secret of secrets)
        assert.ok(!response.body.includes(secret), `${path} leaks ${secret}`);
    }
    const publicMarkets = (await t.ok("GET", "/markets", {})).items;
    assert.equal(
      (await t.ok("GET", "/capabilities", {})).marketCount,
      publicMarkets.length,
    );
    assert.ok(
      publicMarkets.every((m: { workspaceId?: string }) => !m.workspaceId),
    );

    // Controls: the same data is visible inside the workspace, so the scan
    // above would have caught a leak.
    const board = await t.ok(
      "GET",
      `/workspaces/${workspace.id}/leaderboard`,
      member,
    );
    const names = (rows: { trader: string }[]) => rows.map((row) => row.trader);
    assert.ok(names(board.traders).includes("Mona Member"));
    assert.ok(names(board.creators).includes("Ozzie Owner"));
    assert.deepEqual(names(board.forecasters), ["Mona Member"]);
    assert.equal(board.forecasters[0].you, true);
    const inbox = await t.ok("GET", "/notifications", owner);
    const comment = inbox.items.find(
      (item: { kind: string }) => item.kind === "comment",
    );
    assert.equal(comment.workspaceId, workspace.id);
    assert.equal(comment.marketId, world.open.id);
    assert.match(comment.text, /^Mona Member commented/);
    const feed = await t.ok("GET", `/markets/${world.open.id}/trades`, owner);
    assert.equal(feed.items[0].trader, "Mona Member");
    const markets = await t.ok(
      "GET",
      `/workspaces/${workspace.id}/markets`,
      member,
    );
    assert.equal(markets.items.length, 4);
    assert.ok(
      markets.items.every(
        (m: { workspaceId?: string }) => m.workspaceId === workspace.id,
      ),
    );
  } finally {
    await t.close();
  }
});

test("wallets cannot authenticate and account ids never reach a member", async () => {
  const world = await privateWorld();
  const { t, owner, member, workspace } = world;
  try {
    const wallets = t.db
      .prepare(
        "SELECT id,token_hash FROM accounts WHERE workspace_id IS NOT NULL",
      )
      .all() as { id: string; token_hash: string }[];
    assert.equal(wallets.length, 2);
    for (const wallet of wallets) {
      assert.equal(wallet.token_hash, `wallet:${wallet.id}`);
      for (const bearer of [
        `wallet:${wallet.id}`,
        hashToken(`wallet:${wallet.id}`),
        wallet.id,
      ])
        for (const path of ["/portfolio", "/workspaces"])
          assert.equal(
            (
              await t.call("GET", path, {
                authorization: `Bearer ${bearer}`,
              })
            ).statusCode,
            401,
            path,
          );
    }
    const accountIds = (
      t.db.prepare("SELECT id FROM accounts").all() as { id: string }[]
    ).map((row) => row.id);
    for (const path of [
      "/workspaces",
      `/workspaces/${workspace.id}`,
      `/workspaces/${workspace.id}/invites`,
      `/workspaces/${workspace.id}/portfolio`,
      `/workspaces/${workspace.id}/leaderboard`,
      `/workspaces/${workspace.id}/markets`,
      `/markets/${world.open.id}/comments`,
      "/notifications",
    ])
      for (const viewer of path.endsWith("/invites")
        ? [owner]
        : [owner, member]) {
        const response = await t.call("GET", path, viewer);
        assert.equal(response.statusCode, 200, path);
        for (const id of accountIds)
          assert.ok(!response.body.includes(id), `${path} leaks an account id`);
      }
    // Invite tokens are stored only as hashes and never listed.
    const stored = t.db
      .prepare("SELECT token_hash FROM workspace_invites")
      .all() as { token_hash: string }[];
    assert.ok(stored.every((row) => row.token_hash !== world.inviteToken));
    assert.ok(
      stored.some((row) => row.token_hash === hashToken(world.inviteToken)),
    );
    const listed = await t.call(
      "GET",
      `/workspaces/${workspace.id}/invites`,
      owner,
    );
    assert.ok(!listed.body.includes(world.inviteToken));
    assert.ok(!listed.body.includes("token"));
  } finally {
    await t.close();
  }
});

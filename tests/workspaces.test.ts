import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../server/app.js";
import { hashToken } from "../server/database.js";
import {
  CREDIT,
  START,
  draftInput,
  teamsApp,
  type Headers,
} from "./teams-fixture.js";

const evidenceUrl = "https://example.org/data/result";
const OPERATOR = "operator-secret-for-workspaces";
const HOUR = 3_600_000;

test("creating a workspace funds an owner wallet and leaves the person account alone", async () => {
  const t = await teamsApp();
  try {
    const owner = await t.session();
    assert.equal(
      (
        await t.call(
          "POST",
          "/workspaces",
          {},
          { name: "No auth", displayName: "Nobody" },
        )
      ).statusCode,
      401,
    );
    for (const body of [
      { name: "x", displayName: "Ozzie" },
      { name: "Guild", displayName: "O" },
      { name: "Guild", displayName: "Bad\u0007name" },
      { name: "   ", displayName: "Ozzie" },
      { name: "Guild", displayName: "  " },
      { name: "Guild", displayName: "Ozzie", extra: true },
    ])
      assert.equal(
        (await t.call("POST", "/workspaces", owner, body)).statusCode,
        400,
        JSON.stringify(body),
      );
    const workspace = await t.createWorkspace(
      owner,
      "  Padded Guild  ",
      " Ozzie ",
    );
    assert.match(workspace.id, /^[0-9a-f-]{36}$/);
    assert.equal(workspace.name, "Padded Guild");
    assert.equal(workspace.role, "owner");
    assert.equal(workspace.memberCount, 1);
    const person = await t.ok("GET", "/portfolio", owner);
    assert.equal(person.balanceMicros, START);
    assert.equal(person.ledger.length, 0);
    const wallet = await t.ok(
      "GET",
      `/workspaces/${workspace.id}/portfolio`,
      owner,
    );
    assert.equal(wallet.balanceMicros, START);
    assert.equal(wallet.pnlMicros, 0);
    assert.deepEqual(wallet.bonus, {
      available: false,
      streak: 0,
      nextAmountMicros: 0,
    });
    assert.deepEqual((await t.ok("GET", "/workspaces", owner)).items, [
      workspace,
    ]);
    const detail = await t.ok("GET", `/workspaces/${workspace.id}`, owner);
    assert.equal(detail.name, "Padded Guild");
    assert.deepEqual(
      detail.members.map(
        (m: { displayName: string; role: string; you: boolean }) => [
          m.displayName,
          m.role,
          m.you,
        ],
      ),
      [["Ozzie", "owner", true]],
    );
    const renamed = await t.ok("PATCH", `/workspaces/${workspace.id}`, owner, {
      name: "Renamed Guild",
    });
    assert.equal(renamed.name, "Renamed Guild");
    assert.equal(
      (
        await t.call("PATCH", `/workspaces/${workspace.id}`, owner, {
          name: "Renamed",
          role: "x",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await t.call("GET", "/workspaces/not-a-uuid", owner)).statusCode,
      400,
    );
    // A person may own at most five workspaces.
    for (const index of [2, 3, 4, 5])
      await t.createWorkspace(owner, `Guild ${index}`, "Ozzie");
    const sixth = await t.call("POST", "/workspaces", owner, {
      name: "Guild 6",
      displayName: "Ozzie",
    });
    assert.equal(sixth.statusCode, 409);
    assert.equal((await t.ok("GET", "/workspaces", owner)).items.length, 5);
  } finally {
    await t.close();
  }
});

test("invites: create, preview and join; expired, revoked, used-up and unknown invites look identical", async () => {
  const t = await teamsApp();
  try {
    const owner = await t.session();
    const bea = await t.session();
    const carl = await t.session();
    const { id: wid } = await t.createWorkspace(owner);
    const created = await t.ok(
      "POST",
      `/workspaces/${wid}/invites`,
      owner,
      { role: "resolver", expiresInHours: 2, maxUses: 1 },
      201,
    );
    assert.match(created.token, /^[a-f0-9]{64}$/);
    assert.deepEqual(
      {
        role: created.role,
        maxUses: created.maxUses,
        uses: created.uses,
        revoked: created.revoked,
      },
      { role: "resolver", maxUses: 1, uses: 0, revoked: false },
    );
    assert.ok(
      Math.abs(Date.parse(created.expiresAt) - Date.now() - 2 * HOUR) < 60_000,
    );
    const defaults = await t.ok(
      "POST",
      `/workspaces/${wid}/invites`,
      owner,
      { role: "member" },
      201,
    );
    assert.equal(defaults.maxUses, 25);
    assert.ok(
      Math.abs(Date.parse(defaults.expiresAt) - Date.now() - 168 * HOUR) <
        60_000,
    );
    for (const body of [
      { role: "owner" },
      { role: "admin" },
      { role: "member", expiresInHours: 0 },
      { role: "member", expiresInHours: 721 },
      { role: "member", maxUses: 501 },
    ])
      assert.equal(
        (await t.call("POST", `/workspaces/${wid}/invites`, owner, body))
          .statusCode,
        400,
        JSON.stringify(body),
      );

    assert.equal(
      (
        await t.call(
          "POST",
          "/workspaces/invites/preview",
          {},
          { token: created.token },
        )
      ).statusCode,
      401,
    );
    assert.deepEqual(
      await t.ok("POST", "/workspaces/invites/preview", bea, {
        token: created.token,
      }),
      {
        workspaceName: "Secret Guild",
        role: "resolver",
        expiresAt: created.expiresAt,
      },
    );
    const joined = await t.ok(
      "POST",
      "/workspaces/join",
      bea,
      { token: created.token, displayName: "Bea Resolver" },
      201,
    );
    assert.deepEqual(
      [joined.id, joined.role, joined.memberCount],
      [wid, "resolver", 2],
    );
    const listed = await t.ok("GET", `/workspaces/${wid}/invites`, owner);
    assert.equal(
      listed.items.find((i: { id: string }) => i.id === created.id).uses,
      1,
    );

    const revoked = await t.ok(
      "POST",
      `/workspaces/${wid}/invites`,
      owner,
      { role: "member" },
      201,
    );
    assert.deepEqual(
      await t.ok("DELETE", `/workspaces/${wid}/invites/${revoked.id}`, owner),
      { revoked: true },
    );
    assert.deepEqual(
      await t.ok("DELETE", `/workspaces/${wid}/invites/${revoked.id}`, owner),
      { revoked: true },
    );
    assert.equal(
      (await t.ok("GET", `/workspaces/${wid}/invites`, owner)).items.find(
        (i: { id: string }) => i.id === revoked.id,
      ).revoked,
      true,
    );
    const expired = await t.ok(
      "POST",
      `/workspaces/${wid}/invites`,
      owner,
      { role: "member" },
      201,
    );
    t.db
      .prepare("UPDATE workspace_invites SET expires_at=? WHERE id=?")
      .run(new Date(Date.now() - 1000).toISOString(), expired.id);
    const unknown = randomBytes(32).toString("hex");
    const failures = [];
    for (const token of [
      created.token,
      revoked.token,
      expired.token,
      unknown,
    ]) {
      const preview = await t.call(
        "POST",
        "/workspaces/invites/preview",
        carl,
        { token },
      );
      const join = await t.call("POST", "/workspaces/join", carl, {
        token,
        displayName: "Carl",
      });
      assert.equal(preview.statusCode, 404);
      assert.equal(join.statusCode, 404);
      failures.push(preview.body, join.body);
    }
    assert.equal(new Set(failures).size, 1);
    assert.equal(
      (
        await t.call("POST", "/workspaces/invites/preview", carl, {
          token: "abc",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await t.call(
          "DELETE",
          `/workspaces/${wid}/invites/${randomUUID()}`,
          owner,
        )
      ).statusCode,
      404,
    );

    // Only owners and admins manage invites.
    for (const [method, path, body] of [
      ["POST", `/workspaces/${wid}/invites`, { role: "member" }],
      ["GET", `/workspaces/${wid}/invites`, undefined],
      ["DELETE", `/workspaces/${wid}/invites/${defaults.id}`, undefined],
    ] as const)
      assert.equal(
        (await t.call(method, path, bea, body)).statusCode,
        403,
        `${method} ${path}`,
      );

    // At most 20 usable invites at a time; revoked and expired ones do not count.
    let active = 1; // Only "defaults" is still usable.
    while (
      (
        await t.call("POST", `/workspaces/${wid}/invites`, owner, {
          role: "member",
        })
      ).statusCode === 201
    )
      active += 1;
    assert.equal(active, 20);
    const full = await t.call("POST", `/workspaces/${wid}/invites`, owner, {
      role: "member",
    });
    assert.equal(full.statusCode, 409);
  } finally {
    await t.close();
  }
});

test("joining: taken names, double joins and the 200-member cap are 409", async () => {
  const t = await teamsApp();
  try {
    const owner = await t.session();
    const bea = await t.session();
    const { id: wid } = await t.createWorkspace(owner);
    const token = (
      await t.ok(
        "POST",
        `/workspaces/${wid}/invites`,
        owner,
        { role: "member", maxUses: 500 },
        201,
      )
    ).token;
    const join = (person: Headers, displayName: string) =>
      t.call("POST", "/workspaces/join", person, { token, displayName });
    assert.equal((await join(bea, "ozzie OWNER")).statusCode, 409);
    assert.equal((await join(bea, "Bea")).statusCode, 201);
    assert.equal((await join(bea, "Bea Again")).statusCode, 409);
    for (let index = 3; index <= 200; index += 1)
      assert.equal(
        (await join(await t.session(), `Member ${index}`)).statusCode,
        201,
      );
    assert.equal(
      (await t.ok("GET", `/workspaces/${wid}`, owner)).memberCount,
      200,
    );
    const late = await join(await t.session(), "Member 201");
    assert.equal(late.statusCode, 409);
    const invite = (await t.ok("GET", `/workspaces/${wid}/invites`, owner))
      .items[0];
    assert.equal(invite.uses, 199);
  } finally {
    await t.close();
  }
});

/** Owner O plus admins A and A2, resolver R and members M and M2 ("Team O" and so on). */
async function team(t: Awaited<ReturnType<typeof teamsApp>>) {
  const people: Record<string, Headers> = {};
  for (const name of ["O", "A", "A2", "R", "M", "M2"])
    people[name] = await t.session();
  const { id: wid } = await t.createWorkspace(
    people.O,
    "Secret Guild",
    "Team O",
  );
  for (const name of ["A", "A2", "M", "M2"])
    await t.join(people.O, wid, people[name], `Team ${name}`);
  await t.join(people.O, wid, people.R, "Team R", "resolver");
  const ids: Record<string, string> = {};
  for (const name of Object.keys(people))
    ids[name] = await t.memberId(people.O, wid, `Team ${name}`);
  for (const name of ["A", "A2"])
    await t.ok("PATCH", `/workspaces/${wid}/members/${ids[name]}`, people.O, {
      role: "admin",
    });
  const roles = async () =>
    Object.fromEntries(
      (await t.ok("GET", `/workspaces/${wid}`, people.O)).members.map(
        (m: { displayName: string; role: string }) => [
          m.displayName.replace("Team ", ""),
          m.role,
        ],
      ),
    );
  return { people, ids, wid, roles };
}

test("role changes follow the role matrix and ownership transfer is atomic", async () => {
  const t = await teamsApp();
  try {
    const { people, ids, wid, roles } = await team(t);
    const steps: [string, string, string, number][] = [
      ["M", "M2", "resolver", 403],
      ["R", "M", "resolver", 403],
      ["A", "M", "resolver", 200],
      ["A", "M", "member", 200],
      ["A", "M", "admin", 403],
      ["A", "M", "owner", 403],
      ["A", "A2", "member", 403],
      ["A", "O", "member", 403],
      ["A", "A", "member", 403],
      ["O", "O", "admin", 403],
      ["O", "A2", "member", 200],
      ["O", "A2", "admin", 200],
      ["O", "R", "admin", 200],
      ["O", "R", "resolver", 200],
      ["O", "M", "member", 200],
    ];
    for (const [actor, target, role, status] of steps) {
      const response = await t.call(
        "PATCH",
        `/workspaces/${wid}/members/${ids[target]}`,
        people[actor],
        { role },
      );
      assert.equal(
        response.statusCode,
        status,
        `${actor} sets ${target} to ${role}: ${response.body}`,
      );
      if (status === 200)
        assert.deepEqual(
          [response.json().role, response.json().you],
          [role, actor === target],
        );
    }
    assert.deepEqual(await roles(), {
      O: "owner",
      A: "admin",
      A2: "admin",
      R: "resolver",
      M: "member",
      M2: "member",
    });
    assert.equal(
      (
        await t.call(
          "PATCH",
          `/workspaces/${wid}/members/${randomUUID()}`,
          people.A,
          { role: "member" },
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await t.call("PATCH", `/workspaces/${wid}/members/${ids.M}`, people.O, {
          role: "boss",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await t.call("PATCH", `/workspaces/${wid}`, people.A, {
          name: "Admin rename",
        })
      ).statusCode,
      403,
    );

    const transfer = await t.ok(
      "PATCH",
      `/workspaces/${wid}/members/${ids.A}`,
      people.O,
      { role: "owner" },
    );
    assert.equal(transfer.role, "owner");
    assert.deepEqual(await roles(), {
      O: "admin",
      A: "owner",
      A2: "admin",
      R: "resolver",
      M: "member",
      M2: "member",
    });
    assert.equal(
      (await t.ok("GET", "/workspaces", people.O)).items[0].role,
      "admin",
    );
    assert.equal(
      (
        await t.call("PATCH", `/workspaces/${wid}`, people.O, {
          name: "Old owner",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await t.ok("PATCH", `/workspaces/${wid}`, people.A, {
          name: "New owner",
        })
      ).name,
      "New owner",
    );
    assert.equal(
      (
        await t.call("PATCH", `/workspaces/${wid}/members/${ids.A}`, people.O, {
          role: "member",
        })
      ).statusCode,
      403,
    );
  } finally {
    await t.close();
  }
});

test("removal follows the role matrix and the owner cannot leave", async () => {
  const t = await teamsApp();
  try {
    const { people, ids, wid, roles } = await team(t);
    const remove = (actor: string, target: string) =>
      t.call(
        "DELETE",
        `/workspaces/${wid}/members/${ids[target]}`,
        people[actor],
      );
    const steps: [string, string, number][] = [
      ["O", "O", 409],
      ["A", "O", 403],
      ["A", "A2", 403],
      ["M", "R", 403],
      ["R", "M", 403],
      ["M", "M2", 403],
      ["A", "M", 200],
      ["R", "R", 200],
      ["A2", "A2", 200],
      ["O", "A", 200],
      ["O", "A", 404],
    ];
    for (const [actor, target, status] of steps) {
      const response = await remove(actor, target);
      assert.equal(
        response.statusCode,
        status,
        `${actor} removes ${target}: ${response.body}`,
      );
      if (status === 200) assert.deepEqual(response.json(), { removed: true });
    }
    assert.deepEqual(await roles(), { O: "owner", M2: "member" });
    for (const name of ["A", "A2", "R", "M"]) {
      assert.equal(
        (await t.call("GET", `/workspaces/${wid}`, people[name])).statusCode,
        404,
      );
      assert.deepEqual(
        (await t.ok("GET", "/workspaces", people[name])).items,
        [],
      );
    }
    assert.equal(
      (await t.ok("GET", `/workspaces/${wid}`, people.O)).memberCount,
      2,
    );
  } finally {
    await t.close();
  }
});

test("removal cancels open orders and hides private notifications; rejoining reuses the wallet", async () => {
  const t = await teamsApp();
  try {
    const owner = await t.session();
    const mona = await t.session();
    const { id: wid } = await t.createWorkspace(owner);
    await t.join(owner, wid, mona, "Mona");
    const market = await t.launch(
      owner,
      "Will the private pilot launch on time?",
      wid,
    );
    await t.buy(mona, market.id, "YES", 10);
    const order = (limitPrice: number) =>
      t.ok(
        "POST",
        "/orders",
        mona,
        {
          marketId: market.id,
          outcome: "NO",
          action: "buy",
          shares: 5,
          limitPrice,
        },
        201,
      );
    assert.equal((await order(0.99)).status, "filled");
    const resting = await order(0.01);
    assert.equal(resting.status, "open");
    // A member cancels their own private order through the public route.
    const own = await order(0.02);
    assert.deepEqual(await t.ok("DELETE", `/orders/${own.id}`, mona), {
      cancelled: true,
    });
    assert.equal(
      (await t.call("DELETE", `/orders/${resting.id}`, owner)).statusCode,
      404,
    );
    const inbox = await t.ok("GET", "/notifications", mona);
    assert.equal(inbox.unread, 1);
    assert.equal(inbox.items[0].kind, "order_filled");
    assert.equal(inbox.items[0].workspaceId, wid);
    const before = await t.ok("GET", `/workspaces/${wid}/portfolio`, mona);
    assert.equal(before.positions.length, 2);

    const monaId = await t.memberId(owner, wid, "Mona");
    await t.ok("DELETE", `/workspaces/${wid}/members/${monaId}`, owner);
    assert.deepEqual(await t.ok("GET", "/notifications", mona), {
      items: [],
      unread: 0,
    });
    assert.equal(
      (await t.call("GET", `/markets/${market.id}`, mona)).statusCode,
      404,
    );
    assert.equal(
      (await t.call("GET", `/workspaces/${wid}/portfolio`, mona)).statusCode,
      404,
    );
    // The removed member stays on the board; their forecasts happened.
    const board = await t.ok("GET", `/workspaces/${wid}/leaderboard`, owner);
    assert.ok(
      board.traders.some((row: { trader: string }) => row.trader === "Mona"),
    );

    await t.join(owner, wid, mona, "Mona Again");
    const after = await t.ok("GET", `/workspaces/${wid}/portfolio`, mona);
    assert.equal(after.balanceMicros, before.balanceMicros);
    assert.deepEqual(after.positions, before.positions);
    const cancelled = after.orders.find(
      (o: { id: string }) => o.id === resting.id,
    );
    assert.equal(cancelled.status, "cancelled");
    assert.equal(
      (
        t.db
          .prepare("SELECT COUNT(*) AS n FROM accounts WHERE workspace_id=?")
          .get(wid) as { n: number }
      ).n,
      2,
    );
    assert.equal((await t.ok("GET", "/notifications", mona)).unread, 1);
    assert.deepEqual(await t.ok("POST", "/notifications/read", mona, {}), {
      unread: 0,
    });
    assert.equal(
      (await t.ok("GET", "/notifications", mona)).items[0].read,
      true,
    );
  } finally {
    await t.close();
  }
});

test("launching to a workspace stakes wallet credits and opens an unlisted private market", async () => {
  const t = await teamsApp();
  try {
    const owner = await t.session();
    const outsider = await t.session();
    const { id: wid } = await t.createWorkspace(owner);
    const market = await t.launch(
      owner,
      "Will the private merger close in Q3?",
      wid,
    );
    assert.match(market.id, /^ws-[0-9a-f-]{36}$/);
    assert.equal(market.workspaceId, wid);
    assert.equal((await t.ok("GET", "/portfolio", owner)).balanceMicros, START);
    const wallet = await t.ok("GET", `/workspaces/${wid}/portfolio`, owner);
    assert.equal(wallet.balanceMicros, START - 500 * CREDIT);
    assert.equal(wallet.created[0].marketId, market.id);
    assert.equal(wallet.ledger[0].kind, "launch_stake");
    const listed = (path: string) =>
      t
        .ok("GET", path, owner)
        .then((body) => body.items.map((m: { id: string }) => m.id));
    assert.ok(!(await listed("/markets")).includes(market.id));
    assert.deepEqual(await listed(`/workspaces/${wid}/markets`), [market.id]);
    assert.deepEqual(
      await listed(`/workspaces/${wid}/markets?search=MERGER&category=Science`),
      [market.id],
    );
    assert.deepEqual(
      await listed(`/workspaces/${wid}/markets?category=Economy`),
      [],
    );
    const publicMarket = await t.launch(
      owner,
      "Will the public merger close in Q3?",
    );
    assert.equal(publicMarket.workspaceId, undefined);
    assert.match(publicMarket.id, /^will-the-public-merger/);

    const draft = await t.ok(
      "POST",
      "/drafts",
      outsider,
      draftInput("Can an outsider launch here?"),
      201,
    );
    for (const [workspaceId, status] of [
      [wid, 404],
      [randomUUID(), 404],
      ["not-a-uuid", 400],
    ] as const)
      assert.equal(
        (
          await t.call("POST", `/drafts/${draft.id}/launch`, outsider, {
            category: "Science",
            workspaceId,
          })
        ).statusCode,
        status,
      );
    assert.equal((await t.ok("GET", "/drafts", outsider)).items.length, 1);
    assert.equal(
      (await t.ok("GET", "/portfolio", outsider)).balanceMicros,
      START,
    );
  } finally {
    await t.close();
  }
});

test("member rulings: roles, conflicts of interest and rulable states; credits stay inside the workspace", async () => {
  process.env.OPERATOR_TOKEN = OPERATOR;
  const t = await teamsApp({ disputeWindowMs: 60_000 });
  try {
    const { people, ids, wid } = await team(t);
    const outsider = await t.session();
    await t.ok("PATCH", `/workspaces/${wid}/members/${ids.M2}`, people.O, {
      role: "resolver",
    });
    const market = await t.launch(
      people.O,
      "Will the team ship its private release?",
      wid,
    );
    await t.buy(people.M, market.id, "YES", 50);
    await t.buy(people.R, market.id, "NO", 10);
    const rule = (who: Headers, outcome = "NO", id = market.id) =>
      t.call("POST", `/workspaces/${wid}/markets/${id}/ruling`, who, {
        outcome,
      });
    assert.equal((await rule(people.A)).statusCode, 409);
    await t.ok(
      "POST",
      `/markets/${market.id}/resolution`,
      people.O,
      { outcome: "YES", evidenceUrl },
      201,
    );
    assert.equal((await rule(people.A)).statusCode, 409);
    // The member's wallet, not the person, posts the dispute bond.
    const disputed = await t.ok(
      "POST",
      `/markets/${market.id}/dispute`,
      people.M2,
      undefined,
      201,
    );
    assert.equal(disputed.status, "disputed");
    assert.equal(
      (await t.ok("GET", "/portfolio", people.M2)).balanceMicros,
      START,
    );
    // Private disputes stay in the workspace, and the wording says so.
    assert.match(
      (await t.ok("GET", "/notifications", people.O)).items[0].text,
      /was disputed\. A workspace resolver will rule\.$/,
    );
    const waiting = await t.call(
      "POST",
      `/markets/${market.id}/settle`,
      people.M,
    );
    assert.equal(waiting.statusCode, 409);
    assert.equal(
      waiting.json().message,
      "This outcome is disputed and waits for a workspace resolver's ruling.",
    );

    assert.equal((await rule(people.M)).statusCode, 403);
    for (const conflicted of [people.O, people.M2, people.R])
      assert.equal((await rule(conflicted)).statusCode, 409);
    assert.equal((await rule(outsider)).statusCode, 404);
    assert.equal((await rule(people.A, "NO", "fed-rate")).statusCode, 404);
    assert.equal(
      (
        await t.call(
          "POST",
          `/markets/${market.id}/ruling`,
          { "x-operator-token": OPERATOR },
          { outcome: "NO" },
        )
      ).statusCode,
      404,
    );
    const ruled = await rule(people.A);
    assert.equal(ruled.statusCode, 200, ruled.body);
    assert.deepEqual(
      [ruled.json().status, ruled.json().resolution.outcome],
      ["resolved", "NO"],
    );
    assert.equal((await rule(people.A)).statusCode, 409);
    const wallet = (who: Headers) =>
      t.ok("GET", `/workspaces/${wid}/portfolio`, who);
    const disputer = await wallet(people.M2);
    assert.equal(disputer.balanceMicros, START + 100 * CREDIT);
    assert.ok(
      disputer.ledger.some(
        (entry: { kind: string }) => entry.kind === "dispute_reward",
      ),
    );

    // A closed market nobody proposed can be ruled too.
    const silent = await t.launch(
      people.O,
      "Will the silent creator ever answer?",
      wid,
    );
    t.db
      .prepare(
        "UPDATE markets SET definition=json_set(definition,'$.closesAt',?) WHERE id=?",
      )
      .run("2020-01-01T00:00:00.000Z", silent.id);
    assert.equal(
      (await rule(people.A, "YES", silent.id)).json().status,
      "resolved",
    );

    // Every credit that moved stayed inside the workspace.
    let total = 0;
    for (const who of Object.values(people)) {
      total += (await wallet(who)).balanceMicros;
      assert.equal((await t.ok("GET", "/portfolio", who)).balanceMicros, START);
    }
    assert.equal(total, Object.keys(people).length * START);
    const publicBoard = await t.ok("GET", "/leaderboard", people.A);
    assert.deepEqual(
      [publicBoard.traders, publicBoard.creators, publicBoard.forecasters],
      [[], [], []],
    );
  } finally {
    delete process.env.OPERATOR_TOKEN;
    await t.close();
  }
});

test("the Windows app build leaves Teams unregistered", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
    teams: false,
  });
  const hosted = await buildApp({
    databasePath: ":memory:",
    rateLimiting: false,
  });
  try {
    assert.equal(
      (await app.inject("/api/v1/capabilities")).json().teams,
      false,
    );
    assert.equal(
      (await hosted.inject("/api/v1/capabilities")).json().teams,
      true,
    );
    const token = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json().token;
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Desk Guild", displayName: "Desk" },
    });
    assert.equal(created.statusCode, 404);
    const paths = Object.keys(
      (await app.inject("/api/v1/openapi.json")).json().paths,
    );
    assert.ok(!paths.some((path) => path.includes("/workspaces")));
  } finally {
    await app.close();
    await hosted.close();
  }
});

test("a pre-Teams database file upgrades in place without losing data", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "wildcatter-upgrade-")),
    "old.sqlite",
  );
  const old = new DatabaseSync(path);
  // The schema the constructor created before workspaces existed.
  old.exec(`
    CREATE TABLE markets (id TEXT PRIMARY KEY, definition TEXT NOT NULL, q_yes REAL NOT NULL, q_no REAL NOT NULL, liquidity REAL NOT NULL, volume_micros INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, creator_id TEXT REFERENCES accounts(id), creator_fees_micros INTEGER NOT NULL DEFAULT 0, pool_micros INTEGER NOT NULL DEFAULT 0, resolution TEXT);
    CREATE TABLE accounts (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, balance_micros INTEGER NOT NULL CHECK(balance_micros >= 0), expires_at TEXT NOT NULL);
    CREATE TABLE positions (account_id TEXT NOT NULL REFERENCES accounts(id), market_id TEXT NOT NULL REFERENCES markets(id), outcome TEXT NOT NULL CHECK(outcome IN ('YES','NO')), shares INTEGER NOT NULL CHECK(shares >= 0), cost_micros INTEGER NOT NULL CHECK(cost_micros >= 0), PRIMARY KEY(account_id,market_id,outcome));
    CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL REFERENCES accounts(id), kind TEXT NOT NULL, market_id TEXT, amount_micros INTEGER NOT NULL, balance_micros INTEGER NOT NULL, created_at TEXT NOT NULL);
  `);
  const token = randomBytes(32).toString("hex");
  const closesAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  old
    .prepare("INSERT INTO accounts VALUES (?,?,?,?)")
    .run("legacy-account", hashToken(token), 9_000 * CREDIT, closesAt);
  old
    .prepare(
      "INSERT INTO markets (id,definition,q_yes,q_no,liquidity,created_at,creator_id) VALUES (?,?,0,0,1000,?,?)",
    )
    .run(
      "legacy-market",
      JSON.stringify({
        id: "legacy-market",
        title: "Legacy market survives the upgrade",
        description: "Created before Teams.",
        category: "World",
        symbol: "◆",
        color: "#eef0f6",
        sourceName: "Source",
        sourceUrl: "https://example.org",
        closesAt,
        yesRule: "Resolves YES when the source says so.",
        noRule: "Resolves NO when the source says no.",
        invalidRule: "Resolves INVALID when unclear.",
        initialProbability: 0.5,
      }),
      new Date().toISOString(),
      "legacy-account",
    );
  old
    .prepare("INSERT INTO positions VALUES (?,?,?,?,?)")
    .run("legacy-account", "legacy-market", "YES", 7, 3 * CREDIT);
  old.close();

  const app = await buildApp({
    databasePath: path,
    rateLimiting: false,
    autoSettleMs: 0,
  });
  try {
    const markets = (await app.inject("/api/v1/markets")).json().items;
    assert.deepEqual(
      markets.map((m: { id: string }) => m.id),
      ["legacy-market"],
    );
    const portfolio = (
      await app.inject({
        url: "/api/v1/portfolio",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
    assert.equal(portfolio.balanceMicros, 9_000 * CREDIT);
    assert.equal(portfolio.positions[0].shares, 7);
    assert.equal(portfolio.created[0].marketId, "legacy-market");
    // createSession no longer inserts positionally into the wider accounts table.
    assert.equal(
      (await app.inject({ method: "POST", url: "/api/v1/sessions" }))
        .statusCode,
      201,
    );
  } finally {
    await app.close();
  }
  const upgraded = new DatabaseSync(path);
  try {
    const columns = (table: string) =>
      (
        upgraded.prepare(`PRAGMA table_info(${table})`).all() as {
          name: string;
        }[]
      ).map((c) => c.name);
    assert.ok(columns("markets").includes("workspace_id"));
    assert.ok(columns("accounts").includes("workspace_id"));
    const indexes = (
      upgraded
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as { name: string }[]
    ).map((row) => row.name);
    for (const index of [
      "markets_workspace",
      "accounts_workspace",
      "workspace_members_name",
      "workspace_invites_workspace",
    ])
      assert.ok(indexes.includes(index), index);
    assert.equal(
      (
        upgraded
          .prepare("SELECT workspace_id FROM markets WHERE id='legacy-market'")
          .get() as { workspace_id: null }
      ).workspace_id,
      null,
    );
  } finally {
    upgraded.close();
  }
});

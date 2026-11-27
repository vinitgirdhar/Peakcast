import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server/app.js";
import { TERMS_VERSION } from "../shared/legal.js";

async function setup() {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  const session = (
    await app.inject({ method: "POST", url: "/api/v1/sessions" })
  ).json();
  const headers = { authorization: `Bearer ${session.token}` };
  return { app, session, headers };
}

test("new accounts start with 5,000 practice credits and zero P&L", async () => {
  const { app, session, headers } = await setup();
  try {
    assert.equal(session.balanceMicros, 5_000_000_000);
    const portfolio = (
      await app.inject({ url: "/api/v1/portfolio", headers })
    ).json();
    assert.equal(portfolio.balanceMicros, 5_000_000_000);
    assert.equal(portfolio.pnlMicros, 0);
  } finally {
    await app.close();
  }
});

test("onboarding records consent and requires both confirmations", async () => {
  const { app, headers } = await setup();
  try {
    const before = (
      await app.inject({ url: "/api/v1/account", headers })
    ).json();
    assert.equal(before.termsAcceptedAt, null);
    assert.equal(before.playground, true);
    const put = (body: object) =>
      app.inject({
        method: "PUT",
        url: "/api/v1/account",
        headers,
        payload: body,
      });
    assert.equal(
      (
        await put({
          displayName: "Ada",
          acceptTerms: true,
          confirmAdult: false,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await put({ displayName: "<b>", acceptTerms: true, confirmAdult: true }))
        .statusCode,
      400,
    );
    const done = await put({
      displayName: "  Ada   Lovelace ",
      acceptTerms: true,
      confirmAdult: true,
    });
    assert.equal(done.statusCode, 200);
    assert.equal(done.json().displayName, "Ada Lovelace");
    assert.equal(done.json().termsVersion, TERMS_VERSION);
  } finally {
    await app.close();
  }
});

test("Playground mode cannot be turned off until real money is enabled", async () => {
  const { app, headers } = await setup();
  const mode = (playground: boolean) =>
    app.inject({
      method: "PUT",
      url: "/api/v1/account/mode",
      headers,
      payload: { playground },
    });
  try {
    const off = await mode(false);
    assert.equal(off.statusCode, 409);
    assert.equal((await mode(true)).json().playground, true);
    process.env.REAL_MONEY_ENABLED = "1";
    assert.equal((await mode(false)).json().playground, false);
  } finally {
    delete process.env.REAL_MONEY_ENABLED;
    await app.close();
  }
});

test("deleting an account revokes its token and removes personal data", async () => {
  const { app, headers } = await setup();
  try {
    const posted = await app.inject({
      method: "POST",
      url: "/api/v1/markets/fed-rate/comments",
      headers,
      payload: { body: "I think YES." },
    });
    assert.ok(posted.statusCode < 300, posted.body);
    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/v1/account",
      headers,
    });
    assert.deepEqual(deleted.json(), { deleted: true });
    assert.equal(
      (await app.inject({ url: "/api/v1/portfolio", headers })).statusCode,
      401,
    );
    const comments = (
      await app.inject({ url: "/api/v1/markets/fed-rate/comments" })
    ).json();
    assert.equal(comments.items.length, 0);
  } finally {
    await app.close();
  }
});

test("deleting a workspace owner hands the workspace on and removes their name", async () => {
  const { teamsApp } = await import("./teams-fixture.js");
  const t = await teamsApp();
  try {
    const owner = await t.session();
    const colleague = await t.session();
    const { id: wid } = await t.createWorkspace(owner, "Guild", "Ozzie");
    await t.join(owner, wid, colleague, "Cleo");
    const pending = await t.invite(owner, wid);
    await t.ok("DELETE", "/account", owner);

    const detail = await t.ok("GET", `/workspaces/${wid}`, colleague);
    const members = detail.members as { displayName: string; role: string }[];
    assert.deepEqual(
      members.map((m) => [m.displayName, m.role]),
      [["Cleo", "owner"]],
    );
    const join = await t.call("POST", "/workspaces/join", await t.session(), {
      token: pending,
      displayName: "Late",
    });
    assert.notEqual(
      join.statusCode,
      201,
      "the deleted owner's invite is revoked",
    );
  } finally {
    await t.close();
  }
});

test("display names must be real names", async () => {
  const { isValidDisplayName } = await import("../shared/names.js");
  for (const ok of ["Ada", "Ada Lovelace", "Mary-Jane O'Neil", "J. R. Tolkien", "José", "विनीत", "  Ada   Lovelace "])
    assert.equal(isValidDisplayName(ok), true, ok);
  for (const bad of ["A", "Ada123", "12345", "<b>", "Ada!!", "-Ada", "Ada--Lee", "a".repeat(41), "   "])
    assert.equal(isValidDisplayName(bad), false, bad);
});

test("the live name hint explains what is wrong", async () => {
  const { displayNameProblem } = await import("../shared/names.js");
  assert.equal(displayNameProblem(""), null);
  assert.equal(displayNameProblem("Ada Lovelace"), null);
  assert.match(displayNameProblem("Ada1")!, /Numbers/);
  assert.match(displayNameProblem("Ada@")!, /Only letters/);
  assert.match(displayNameProblem("A")!, /at least 2/);
  assert.match(displayNameProblem("-Ada")!, /Start your name/);
});

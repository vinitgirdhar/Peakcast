import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../server/app.js";

// Shared setup for the Teams tests: an app on a throwaway SQLite file, so a
// test can also read rows the API never returns (account and wallet ids).
export const CREDIT = 1_000_000;
export const START = 10_000 * CREDIT;
export const HOST = "127.0.0.1:3001";
export type Headers = Record<string, string>;
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type BuildOptions = NonNullable<Parameters<typeof buildApp>[0]>;

export const draftInput = (question: string) => ({
  question,
  sourceName: "Official source",
  sourceUrl: "https://example.org/data",
  closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  yesRule: "The official source confirms the event before the deadline.",
  noRule: "The official source shows the event did not happen by the deadline.",
  invalidRule: "If the source is missing or unclear, resolve INVALID.",
});

export async function teamsApp(options: BuildOptions = {}) {
  const path = joinPath(
    mkdtempSync(joinPath(tmpdir(), "wildcatter-teams-")),
    "teams.sqlite",
  );
  const app = await buildApp({
    databasePath: path,
    rateLimiting: false,
    autoSettleMs: 0,
    ...options,
  });
  const db = new DatabaseSync(path);
  const call = (
    method: Method,
    url: string,
    headers: Headers = {},
    payload?: object,
  ) =>
    app.inject({
      method,
      url: url.startsWith("/api/") ? url : "/api/v1" + url,
      headers: { host: HOST, ...headers },
      ...(payload && { payload }),
    });
  /** Calls the API and asserts the status; returns the parsed body. */
  const ok = async (
    method: Method,
    url: string,
    headers: Headers,
    payload?: object,
    status = 200,
  ) => {
    const response = await call(method, url, headers, payload);
    assert.equal(
      response.statusCode,
      status,
      `${method} ${url}: ${response.body}`,
    );
    return response.json();
  };
  const session = async (): Promise<Headers> => ({
    authorization:
      "Bearer " + (await ok("POST", "/sessions", {}, undefined, 201)).token,
  });
  const createWorkspace = async (
    owner: Headers,
    name = "Secret Guild",
    displayName = "Ozzie Owner",
  ) =>
    (await ok("POST", "/workspaces", owner, { name, displayName }, 201)) as {
      id: string;
      name: string;
      role: string;
      memberCount: number;
    };
  const invite = async (
    admin: Headers,
    wid: string,
    role = "member",
  ): Promise<string> =>
    (await ok("POST", `/workspaces/${wid}/invites`, admin, { role }, 201))
      .token;
  const join = async (
    admin: Headers,
    wid: string,
    person: Headers,
    displayName: string,
    role = "member",
  ) =>
    ok(
      "POST",
      "/workspaces/join",
      person,
      { token: await invite(admin, wid, role), displayName },
      201,
    );
  const memberId = async (viewer: Headers, wid: string, displayName: string) =>
    (
      (await ok("GET", `/workspaces/${wid}`, viewer)).members as {
        id: string;
        displayName: string;
      }[]
    ).find((member) => member.displayName === displayName)!.id;
  const launch = async (
    person: Headers,
    question: string,
    workspaceId?: string,
  ) => {
    const draft = await ok(
      "POST",
      "/drafts",
      person,
      draftInput(question),
      201,
    );
    return (await ok(
      "POST",
      `/drafts/${draft.id}/launch`,
      person,
      { category: "Science", ...(workspaceId && { workspaceId }) },
      201,
    )) as { id: string; title: string; workspaceId?: string };
  };
  const buy = async (
    person: Headers,
    marketId: string,
    outcome: "YES" | "NO",
    shares: number,
  ) => {
    const input = { marketId, outcome, action: "buy", shares };
    const quote = await ok("POST", "/quotes", person, input);
    return ok(
      "POST",
      "/trades",
      { ...person, "idempotency-key": randomUUID() },
      { ...input, limitMicros: quote.amountMicros },
      201,
    );
  };
  const close = async () => {
    db.close();
    await app.close();
  };
  return {
    app,
    db,
    path,
    call,
    ok,
    session,
    createWorkspace,
    invite,
    join,
    memberId,
    launch,
    buy,
    close,
  };
}

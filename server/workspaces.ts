import { randomBytes, randomUUID } from "node:crypto";
import { MICRO } from "./amm.js";
import { forecasterBoard } from "./calibration.js";
import { watchlist } from "./community.js";
import { DomainError, hashToken, type Store } from "./database.js";
import { accountStats } from "./engagement.js";
import { listOrders } from "./orders.js";
import { rule } from "./resolution.js";
import type {
  CreatedInvite,
  InviteInput,
  InvitePreview,
  InviteRole,
  Leaderboard,
  Market,
  Portfolio,
  ResolutionOutcome,
  Workspace,
  WorkspaceDetail,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from "../shared/types.js";

// Wildcatter for Teams. Each membership owns a wallet: an ordinary accounts
// row tagged with workspace_id. Trading, orders, payouts, comments and
// notifications all key on an account id, so they stay per-tenant unchanged.
// marketActor() is the one gate every market route goes through.

/** Same grant as Store.createSession; portfolio and leaderboard P&L assume it. */
const WALLET_GRANT_MICROS = 10_000 * MICRO;
// ponytail: a wallet's token_hash is 'wallet:' + id, which can never equal a
// SHA-256 hex digest, so no bearer token authenticates as a wallet; it never expires.
const WALLET_EXPIRES_AT = "9999-12-31T23:59:59.999Z";
const MAX_OWNED = 5;
const MAX_MEMBERS = 200;
const MAX_USABLE_INVITES = 20;
const INVITE_HOURS = 168;
const INVITE_USES = 25;
const HOUR_MS = 3_600_000;
const PRIVILEGED: WorkspaceRole[] = ["owner", "admin", "resolver"];
const ADJUSTABLE: WorkspaceRole[] = ["member", "resolver"];
const MARKET_NOT_FOUND = "Market not found.";
const WORKSPACE_NOT_FOUND = "Workspace not found.";
const INVITE_GONE = "This invite link is invalid or has expired.";
/** The daily bonus is paid to the person account only, never to a wallet. */
const NO_BONUS = { available: false, streak: 0, nextAmountMicros: 0 };

interface MemberRow {
  id: string;
  workspace_id: string;
  account_id: string;
  wallet_id: string;
  role: WorkspaceRole;
  display_name: string;
  joined_at: string;
  removed_at: string | null;
}
interface InviteRow {
  id: string;
  workspace_id: string;
  role: InviteRole;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
}

const now = () => new Date().toISOString();

function activeMember(
  store: Store,
  workspaceId: string,
  personId: string,
): MemberRow | undefined {
  return store.db
    .prepare(
      "SELECT * FROM workspace_members WHERE workspace_id=? AND account_id=? AND removed_at IS NULL",
    )
    .get(workspaceId, personId) as MemberRow | undefined;
}

/** The caller's active membership; anyone else gets the unknown-workspace 404. */
function membership(
  store: Store,
  workspaceId: string,
  personId: string,
): MemberRow {
  const member = activeMember(store, workspaceId, personId);
  if (!member) throw new DomainError(WORKSPACE_NOT_FOUND, 404);
  return member;
}

function requireRole(
  member: MemberRow,
  roles: WorkspaceRole[],
  action: string,
): void {
  if (!roles.includes(member.role))
    throw new DomainError(`Your role cannot ${action}.`, 403);
}

/**
 * The account that acts on this market for this person: the person's own
 * account for a public market (undefined for anonymous public reads), their
 * active wallet for a private one. Non-members get the same 404 as an
 * unknown market, so ids cannot be probed.
 */
export function marketActor(
  store: Store,
  personId: string,
  marketId: string,
): string;
export function marketActor(
  store: Store,
  personId: string | undefined,
  marketId: string,
): string | undefined;
export function marketActor(
  store: Store,
  personId: string | undefined,
  marketId: string,
): string | undefined {
  const { workspace_id: workspaceId } = store.row(marketId);
  if (!workspaceId) return personId;
  const member = personId && activeMember(store, workspaceId, personId);
  if (!member) throw new DomainError(MARKET_NOT_FOUND, 404);
  return member.wallet_id;
}

/**
 * The account that may cancel this order. A non-member falls back to their
 * own account, which owns no such order, so they see the unknown-order 404.
 */
export function orderActor(
  store: Store,
  personId: string,
  orderId: string,
): string {
  const order = store.db
    .prepare(
      "SELECT m.workspace_id FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.id=?",
    )
    .get(orderId) as { workspace_id: string | null } | undefined;
  return (
    (order?.workspace_id &&
      activeMember(store, order.workspace_id, personId)?.wallet_id) ||
    personId
  );
}

/** Where a private launch stakes from; 404 unless the person is a member. */
export function launchTarget(
  store: Store,
  personId: string,
  workspaceId: string,
): { walletId: string; workspaceId: string } {
  return {
    walletId: membership(store, workspaceId, personId).wallet_id,
    workspaceId,
  };
}

function clean(value: string, what: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2)
    throw new DomainError(`${what} needs at least 2 visible characters.`, 400);
  return trimmed;
}

const activeCount = (store: Store, workspaceId: string): number =>
  (
    store.db
      .prepare(
        "SELECT COUNT(*) AS total FROM workspace_members WHERE workspace_id=? AND removed_at IS NULL",
      )
      .get(workspaceId) as { total: number }
  ).total;

function toWorkspace(store: Store, member: MemberRow): Workspace {
  const row = store.db
    .prepare("SELECT name,created_at FROM workspaces WHERE id=?")
    .get(member.workspace_id) as { name: string; created_at: string };
  return {
    id: member.workspace_id,
    name: row.name,
    role: member.role,
    memberCount: activeCount(store, member.workspace_id),
    createdAt: row.created_at,
  };
}

const toMember = (row: MemberRow, personId: string): WorkspaceMember => ({
  id: row.id,
  displayName: row.display_name,
  role: row.role,
  joinedAt: row.joined_at,
  you: row.account_id === personId,
});

const toInvite = (row: InviteRow): WorkspaceInvite => ({
  id: row.id,
  role: row.role,
  expiresAt: row.expires_at,
  maxUses: row.max_uses,
  uses: row.uses,
  revoked: row.revoked_at !== null,
});

/** Adds a membership with a fresh, funded wallet; call inside a transaction. */
function addMember(
  store: Store,
  workspaceId: string,
  personId: string,
  role: WorkspaceRole,
  displayName: string,
): void {
  const walletId = randomUUID();
  store.db
    .prepare(
      "INSERT INTO accounts (id,token_hash,balance_micros,expires_at,workspace_id) VALUES (?,?,?,?,?)",
    )
    .run(
      walletId,
      `wallet:${walletId}`,
      WALLET_GRANT_MICROS,
      WALLET_EXPIRES_AT,
      workspaceId,
    );
  store.db
    .prepare(
      "INSERT INTO workspace_members (id,workspace_id,account_id,wallet_id,role,display_name,joined_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      workspaceId,
      personId,
      walletId,
      role,
      displayName,
      now(),
    );
}

export function createWorkspace(
  store: Store,
  personId: string,
  name: string,
  displayName: string,
): Workspace {
  const title = clean(name, "A workspace name");
  const alias = clean(displayName, "Your display name");
  return store.transaction(() => {
    const { owned } = store.db
      .prepare(
        "SELECT COUNT(*) AS owned FROM workspace_members WHERE account_id=? AND role='owner' AND removed_at IS NULL",
      )
      .get(personId) as { owned: number };
    if (owned >= MAX_OWNED)
      throw new DomainError(
        `You can own at most ${MAX_OWNED} workspaces.`,
        409,
      );
    const id = randomUUID();
    store.db
      .prepare(
        "INSERT INTO workspaces (id,name,created_by,created_at) VALUES (?,?,?,?)",
      )
      .run(id, title, personId, now());
    addMember(store, id, personId, "owner", alias);
    return toWorkspace(store, membership(store, id, personId));
  });
}

export function listWorkspaces(store: Store, personId: string): Workspace[] {
  return (
    store.db
      .prepare(
        "SELECT * FROM workspace_members WHERE account_id=? AND removed_at IS NULL ORDER BY joined_at, rowid",
      )
      .all(personId) as unknown as MemberRow[]
  ).map((member) => toWorkspace(store, member));
}

export function workspaceDetail(
  store: Store,
  personId: string,
  workspaceId: string,
): WorkspaceDetail {
  const viewer = membership(store, workspaceId, personId);
  const members = store.db
    .prepare(
      "SELECT * FROM workspace_members WHERE workspace_id=? AND removed_at IS NULL ORDER BY rowid",
    )
    .all(workspaceId) as unknown as MemberRow[];
  return {
    ...toWorkspace(store, viewer),
    members: members.map((member) => toMember(member, personId)),
  };
}

export function renameWorkspace(
  store: Store,
  personId: string,
  workspaceId: string,
  name: string,
): Workspace {
  const owner = membership(store, workspaceId, personId);
  requireRole(owner, ["owner"], "rename this workspace");
  store.db
    .prepare("UPDATE workspaces SET name=? WHERE id=?")
    .run(clean(name, "A workspace name"), workspaceId);
  return toWorkspace(store, owner);
}

function inviteManager(store: Store, workspaceId: string, personId: string) {
  requireRole(
    membership(store, workspaceId, personId),
    ["owner", "admin"],
    "manage invites",
  );
}

export function createInvite(
  store: Store,
  personId: string,
  workspaceId: string,
  input: InviteInput,
): CreatedInvite {
  inviteManager(store, workspaceId, personId);
  return store.transaction(() => {
    const { usable } = store.db
      .prepare(
        "SELECT COUNT(*) AS usable FROM workspace_invites WHERE workspace_id=? AND revoked_at IS NULL AND expires_at>? AND uses<max_uses",
      )
      .get(workspaceId, now()) as { usable: number };
    if (usable >= MAX_USABLE_INVITES)
      throw new DomainError(
        `A workspace can have at most ${MAX_USABLE_INVITES} usable invites. Revoke one first.`,
        409,
      );
    const token = randomBytes(32).toString("hex");
    const invite: InviteRow = {
      id: randomUUID(),
      workspace_id: workspaceId,
      role: input.role,
      expires_at: new Date(
        Date.now() + (input.expiresInHours ?? INVITE_HOURS) * HOUR_MS,
      ).toISOString(),
      max_uses: input.maxUses ?? INVITE_USES,
      uses: 0,
      revoked_at: null,
    };
    // Only the hash is stored; the token is shown once, in this response.
    store.db
      .prepare(
        "INSERT INTO workspace_invites (id,workspace_id,token_hash,role,created_by,created_at,expires_at,max_uses) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        invite.id,
        workspaceId,
        hashToken(token),
        invite.role,
        personId,
        now(),
        invite.expires_at,
        invite.max_uses,
      );
    return { ...toInvite(invite), token };
  });
}

/** The 50 newest invites, revoked and expired ones included; never tokens. */
export function listInvites(
  store: Store,
  personId: string,
  workspaceId: string,
): WorkspaceInvite[] {
  inviteManager(store, workspaceId, personId);
  return (
    store.db
      .prepare(
        "SELECT * FROM workspace_invites WHERE workspace_id=? ORDER BY rowid DESC LIMIT 50",
      )
      .all(workspaceId) as unknown as InviteRow[]
  ).map(toInvite);
}

export function revokeInvite(
  store: Store,
  personId: string,
  workspaceId: string,
  inviteId: string,
): void {
  inviteManager(store, workspaceId, personId);
  const changed = store.db
    .prepare(
      "UPDATE workspace_invites SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND workspace_id=?",
    )
    .run(now(), inviteId, workspaceId).changes;
  if (!changed) throw new DomainError("Invite not found.", 404);
}

/** Unknown, expired, revoked and used-up invites are indistinguishable. */
function usableInvite(
  store: Store,
  token: string,
): InviteRow & { name: string } {
  const invite = store.db
    .prepare(
      "SELECT i.*,w.name FROM workspace_invites i JOIN workspaces w ON w.id=i.workspace_id WHERE i.token_hash=?",
    )
    .get(hashToken(token)) as (InviteRow & { name: string }) | undefined;
  if (
    !invite ||
    invite.revoked_at ||
    invite.expires_at <= now() ||
    invite.uses >= invite.max_uses
  )
    throw new DomainError(INVITE_GONE, 404);
  return invite;
}

export function previewInvite(store: Store, token: string): InvitePreview {
  const invite = usableInvite(store, token);
  return {
    workspaceName: invite.name,
    role: invite.role,
    expiresAt: invite.expires_at,
  };
}

/** Joins with a fresh wallet, or reactivates a removed member's old one. */
export function joinWorkspace(
  store: Store,
  personId: string,
  token: string,
  displayName: string,
): Workspace {
  const alias = clean(displayName, "Your display name");
  return store.transaction(() => {
    const invite = usableInvite(store, token);
    const workspaceId = invite.workspace_id;
    const previous = store.db
      .prepare(
        "SELECT * FROM workspace_members WHERE workspace_id=? AND account_id=?",
      )
      .get(workspaceId, personId) as MemberRow | undefined;
    if (previous && !previous.removed_at)
      throw new DomainError("You are already a member of this workspace.", 409);
    // Removed members keep their name: they stay on the leaderboard.
    if (
      store.db
        .prepare(
          "SELECT 1 FROM workspace_members WHERE workspace_id=? AND display_name=? COLLATE NOCASE AND account_id<>?",
        )
        .get(workspaceId, alias, personId)
    )
      throw new DomainError(
        "That display name is taken in this workspace. Pick another.",
        409,
      );
    if (activeCount(store, workspaceId) >= MAX_MEMBERS)
      throw new DomainError(
        `This workspace is full (${MAX_MEMBERS} members).`,
        409,
      );
    if (previous)
      store.db
        .prepare(
          "UPDATE workspace_members SET removed_at=NULL,role=?,display_name=?,joined_at=? WHERE id=?",
        )
        .run(invite.role, alias, now(), previous.id);
    else addMember(store, workspaceId, personId, invite.role, alias);
    store.db
      .prepare("UPDATE workspace_invites SET uses=uses+1 WHERE id=?")
      .run(invite.id);
    return toWorkspace(store, membership(store, workspaceId, personId));
  });
}

function targetMember(
  store: Store,
  workspaceId: string,
  memberId: string,
): MemberRow {
  const target = store.db
    .prepare(
      "SELECT * FROM workspace_members WHERE id=? AND workspace_id=? AND removed_at IS NULL",
    )
    .get(memberId, workspaceId) as MemberRow | undefined;
  if (!target) throw new DomainError("Member not found.", 404);
  return target;
}

/** Owners change anyone else; admins move others between member and resolver. */
const canSetRole = (actor: MemberRow, target: MemberRow, role: WorkspaceRole) =>
  actor.id !== target.id &&
  (actor.role === "owner" ||
    (actor.role === "admin" &&
      ADJUSTABLE.includes(target.role) &&
      ADJUSTABLE.includes(role)));

export function setMemberRole(
  store: Store,
  personId: string,
  workspaceId: string,
  memberId: string,
  role: WorkspaceRole,
): WorkspaceMember {
  return store.transaction(() => {
    const actor = membership(store, workspaceId, personId);
    const target = targetMember(store, workspaceId, memberId);
    if (!canSetRole(actor, target, role))
      throw new DomainError("Your role cannot make this change.", 403);
    // Ownership transfer: the old owner steps down to admin in the same transaction.
    if (role === "owner")
      store.db
        .prepare("UPDATE workspace_members SET role='admin' WHERE id=?")
        .run(actor.id);
    store.db
      .prepare("UPDATE workspace_members SET role=? WHERE id=?")
      .run(role, target.id);
    return toMember({ ...target, role }, personId);
  });
}

/** Anyone but the owner may leave; owners remove anyone, admins members and resolvers. */
const canRemove = (actor: MemberRow, target: MemberRow) =>
  actor.id === target.id ||
  actor.role === "owner" ||
  (actor.role === "admin" && ADJUSTABLE.includes(target.role));

export function removeMember(
  store: Store,
  personId: string,
  workspaceId: string,
  memberId: string,
): void {
  store.transaction(() => {
    const actor = membership(store, workspaceId, personId);
    const target = targetMember(store, workspaceId, memberId);
    if (target.role === "owner" && actor.id === target.id)
      throw new DomainError(
        "The owner cannot leave. Make another member the owner first.",
        409,
      );
    if (target.role === "owner" || !canRemove(actor, target))
      throw new DomainError("Your role cannot remove this member.", 403);
    const at = now();
    store.db
      .prepare("UPDATE workspace_members SET removed_at=? WHERE id=?")
      .run(at, target.id);
    // Positions stay and are still paid at resolution; resting orders end now.
    store.db
      .prepare(
        "UPDATE orders SET status='cancelled',note=?,closed_at=? WHERE account_id=? AND status='open'",
      )
      .run("You left the workspace.", at, target.wallet_id);
  });
}

export function workspaceMarkets(
  store: Store,
  personId: string,
  workspaceId: string,
  search?: string,
  category?: string,
): Market[] {
  membership(store, workspaceId, personId);
  return store.markets(search, category, workspaceId);
}

export function walletPortfolio(
  store: Store,
  personId: string,
  workspaceId: string,
): Portfolio {
  const walletId = membership(store, workspaceId, personId).wallet_id;
  return {
    ...store.portfolio(walletId),
    orders: listOrders(store, walletId),
    watchlist: watchlist(store, walletId),
    bonus: NO_BONUS,
    stats: accountStats(store, walletId),
  };
}

export function workspaceLeaderboard(
  store: Store,
  personId: string,
  workspaceId: string,
): Leaderboard {
  const walletId = membership(store, workspaceId, personId).wallet_id;
  return {
    ...store.leaderboard(walletId, workspaceId),
    forecasters: forecasterBoard(store, walletId, workspaceId),
  };
}

/**
 * A privileged member's final ruling on a disputed market, or a closed one
 * nobody proposed. The ruler must not be the creator or the disputer and must
 * hold no shares in it.
 */
export function memberRuling(
  store: Store,
  personId: string,
  workspaceId: string,
  marketId: string,
  outcome: ResolutionOutcome,
): Market {
  const ruler = membership(store, workspaceId, personId);
  const row = store.row(marketId);
  if (row.workspace_id !== workspaceId)
    throw new DomainError(MARKET_NOT_FOUND, 404);
  requireRole(ruler, PRIVILEGED, "rule on markets");
  const { status } = store.market(marketId);
  if (status !== "disputed" && status !== "closed")
    throw new DomainError(
      "Only a disputed market, or a closed market with no proposal, can be ruled.",
      409,
    );
  const holds = store.db
    .prepare(
      "SELECT 1 FROM positions WHERE account_id=? AND market_id=? AND shares>0",
    )
    .get(ruler.wallet_id, marketId);
  if (
    row.creator_id === ruler.wallet_id ||
    store.resolution(marketId)?.disputerId === ruler.wallet_id ||
    holds
  )
    throw new DomainError(
      "You created, disputed or hold shares in this market. Another resolver must rule.",
      409,
    );
  return rule(store, marketId, outcome);
}

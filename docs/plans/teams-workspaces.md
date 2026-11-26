# Peakcast for Teams: workspace foundation

**Recommendation.** Add workspaces on top of the existing account model without rewriting trading. Each membership gets its own **wallet**: an ordinary row in `accounts` tagged with `workspace_id`. Everything that already takes an account id then works unchanged and stays isolated, including `Store.trade`, `Store.credit`, `Store.portfolio`, `placeOrder`, `payOut` and `notify`. Private markets get `markets.workspace_id`. One gate, `marketActor()` in a new `server/workspaces.ts`, decides for every market route whether the caller may see the market and which account acts on it. Public markets keep `workspace_id = NULL` and behave exactly as they do today. Teams is a hosted feature, so the Windows app hides it.

Two implementers can build this in parallel in about 5 dev-days each (about 1.5 calendar weeks with review). Do not sell it to customers until [identity-and-persistence](identity-and-persistence.md) phase 1 (durable storage) and phase 2 (recoverable sign-in) have shipped. Today a workspace disappears on the next Render restart, and members lose access when their anonymous session expires after 30 days.

Status: plan for batch 2, written 2026-11-22 against `main` at `4a021de`. Rebase onto batch 1 (calibration and embeddable widgets) before starting; see [Merge notes](#merge-notes).

## Scope

| In v1                                                                                                                                                                     | Later (not in this plan)                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create and rename a workspace; expiring, revocable invite links; roles; private markets; workspace portfolio, leaderboard and credits; member rulings on disputed markets | SSO/SCIM, email invites, seat billing, workspace deletion and export, a configurable starting grant, launch-permission settings, an audit-log UI, credit transfers, prizes, house markets in a workspace |

Play money only: workspace credits cannot be bought, sold, transferred or redeemed. B2B revenue comes from software seats, never from credits. Leaderboard prizes are not a product feature (see [Risks](#risks-and-dependencies)).

## Data model

| Concept        | Storage                                                            | Notes                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace      | `workspaces`                                                       | `id` UUID, `name`, `created_by` (person account), `created_at`                                                                                                                                                            |
| Person         | existing `accounts` row with `workspace_id IS NULL`                | Authenticated by bearer exactly as today (`Store.account`)                                                                                                                                                                |
| Membership     | `workspace_members`                                                | Person, role, display name, opaque member `id` (account ids never leave the server), `removed_at`                                                                                                                         |
| Wallet         | `accounts` row with `workspace_id = W`, linked from the member row | Starts with 10,000 credits. `token_hash = 'wallet:' + id` can never equal a SHA-256 hex digest, so the wallet cannot authenticate. `expires_at = '9999-12-31T23:59:59.999Z'`. Mark it with a `ponytail:` comment in code. |
| Invite         | `workspace_invites`                                                | Only the hash of the token is stored; it has a role, an expiry, a use limit and can be revoked                                                                                                                            |
| Private market | `markets.workspace_id = W`                                         | `creator_id` is the creator's wallet. Id is `ws-<uuid>` with no question slug, so private titles never appear in URLs or Render request logs.                                                                             |

Why wallets and not a `workspace_id` on every row: positions, trades, orders, ledger, watchlist, comments and notifications are all keyed by `account_id`. A wallet makes each of them workspace-scoped with no new column and no change to the money paths, and the conservation property in `server/resolution.ts` (`payOut`) still holds per market.

## Roles

| Action                                                                           | owner                             | admin                            | resolver   | member     |
| -------------------------------------------------------------------------------- | --------------------------------- | -------------------------------- | ---------- | ---------- |
| See private markets, trade, place orders, comment, watch                         | yes                               | yes                              | yes        | yes        |
| Launch a private market from a draft (stakes 500 wallet credits)                 | yes                               | yes                              | yes        | yes        |
| Propose an outcome (creator only, `propose`)                                     | if creator                        | if creator                       | if creator | if creator |
| Dispute a proposal (100-credit bond from the wallet; not the creator, `dispute`) | yes                               | yes                              | yes        | yes        |
| Rule a disputed market, or a closed market with no proposal                      | yes                               | yes                              | yes        | no         |
| Create, list and revoke invites                                                  | yes                               | yes                              | no         | no         |
| Change roles                                                                     | all, including ownership transfer | between member and resolver only | no         | no         |
| Remove a member                                                                  | anyone but self                   | members and resolvers            | self       | self       |
| Rename the workspace                                                             | yes                               | no                               | no         | no         |

Ruling rules (`memberRuling` in `server/workspaces.ts`, which calls the existing `rule()` in `server/resolution.ts`):

- Allowed only when the market is `disputed`, or `closed` with no proposal (for example, the creator went silent or left). Undisputed proposals still settle through `settleDue`.
- **Conflict of interest returns 409.** The ruler's wallet must not be the creator or the disputer and must hold no shares (`positions.shares > 0`) in that market. If every privileged member is conflicted, the owner promotes another member to resolver.
- The platform operator route `POST /markets/:id/ruling` returns 404 for workspace markets. Private disputes stay inside the tenant.
- Ownership transfer: the owner sets another member's role to `owner`, and the owner's own role becomes `admin` in the same transaction. The owner cannot leave without transferring first (409).

## Credits and leaderboards

- A wallet starts with 10,000 credits, the same grant `Store.createSession` gives. This keeps the hard-coded baseline `- 10_000 * MICRO` in `Store.portfolio` and `Store.leaderboard` correct. A per-workspace grant is deferred because it would need a baseline column.
- No daily bonus in a workspace: `/bonus/claim` keeps using the person account. Credits cannot leave the wallet, because no route moves credits between accounts.
- `Store.leaderboard(viewerId, workspaceId = null)` filters traders with `a.workspace_id IS ?` and creators with `markets.workspace_id IS ?`. The public board stays public-only, and the workspace board shows only that workspace's wallets.
- Names: `Store.handle(accountId)` returns the member's `display_name` for a wallet and the existing `Trader XXXX` alias otherwise. The trade feed, comments, leaderboards and notification text then show colleague names inside a workspace and never outside it. Display names are unique per workspace, case-insensitively.
- Removed members keep their wallet history and stay on the leaderboard (their forecasts happened). Their open orders are cancelled on removal, and their positions are still paid at resolution, so credits stay inside the workspace. Rejoining through a new invite reactivates the same membership and wallet.

## Public markets keep working unchanged

- `workspace_id IS NULL` rows follow the same code paths. Seed markets, fixtures and every existing test run without changes. The one exception is the `createSession` insert noted below.
- Public reads stay anonymous. `marketActor()` returns the optional viewer for public markets, so `GET /markets/:id`, `/quotes`, `/history`, `/trades` and `/comments` keep working without a bearer token.
- `GET /portfolio`, `/notifications` and `/bonus/claim` keep using the person account. Wallet activity never appears in the public portfolio, because wallets are different accounts.

## Schema changes (startup-safe)

Append to the `CREATE TABLE IF NOT EXISTS` block in the `Store` constructor (`server/database.ts`):

```sql
CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspace_members (id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL REFERENCES workspaces(id), account_id TEXT NOT NULL REFERENCES accounts(id), wallet_id TEXT NOT NULL UNIQUE REFERENCES accounts(id), role TEXT NOT NULL CHECK(role IN ('owner','admin','resolver','member')), display_name TEXT NOT NULL, joined_at TEXT NOT NULL, removed_at TEXT, PRIMARY KEY(workspace_id,account_id));
CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_name ON workspace_members(workspace_id, display_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS workspace_members_account ON workspace_members(account_id);
CREATE TABLE IF NOT EXISTS workspace_invites (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('member','resolver')), created_by TEXT NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 500), uses INTEGER NOT NULL DEFAULT 0, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS workspace_invites_workspace ON workspace_invites(workspace_id);
```

Columns on existing tables use the existing `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN` loop. Extend it to cover `accounts` as well as `markets`:

| Table      | Column         | Type                             |
| ---------- | -------------- | -------------------------------- |
| `markets`  | `workspace_id` | `TEXT REFERENCES workspaces(id)` |
| `accounts` | `workspace_id` | `TEXT REFERENCES workspaces(id)` |

Two traps:

1. `CREATE INDEX markets_workspace ON markets(workspace_id)` and `accounts_workspace ON accounts(workspace_id)` must run **after** the ALTER loop. Putting them in the big `exec` block fails on every existing database, because the column does not exist yet.
2. `Store.createSession` inserts positionally (`INSERT INTO accounts VALUES (?,?,?,?)`). Once `accounts` has a fifth column, it fails with a column-count error. Change it to `INSERT INTO accounts (id,token_hash,balance_micros,expires_at) VALUES (?,?,?,?)`.

SQLite's `IS ?` operator compares NULL correctly, so one statement such as `WHERE workspace_id IS ?` serves both the public (`null`) and the workspace case.

## Tenant isolation: every query and route that changes

The gate (new, `server/workspaces.ts`):

```ts
/**
 * The account that acts on this market for this person: the person's own account for a public
 * market (undefined for anonymous public reads), their active wallet for a private one.
 * Non-members get the same 404 as an unknown market, so ids cannot be probed.
 */
export function marketActor(
  store: Store,
  personId: string | undefined,
  marketId: string,
): string | undefined;
```

### `server/database.ts`

| Function                                                                                                     | Today                                              | Change                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| constructor                                                                                                  | 11 tables                                          | 3 new tables, 2 new columns, indexes after the ALTER loop                                                         |
| `createSession`                                                                                              | positional `INSERT INTO accounts VALUES (?,?,?,?)` | explicit column list                                                                                              |
| `MarketRow`, `market(id)`                                                                                    | no tenant field                                    | add `workspace_id`; output `workspaceId` when set                                                                 |
| `markets(search, category)`                                                                                  | `SELECT id FROM markets ORDER BY rowid` (all rows) | `WHERE workspace_id IS ?`, new third parameter `workspaceId: string \| null = null`                               |
| `leaderboard(viewerId)`                                                                                      | ranks every account and every creator              | add `workspaceId = null`; `a.workspace_id IS ?` in the trader query and `workspace_id IS ?` in the creator query  |
| `handle(accountId)`                                                                                          | hash alias                                         | `display_name` for wallets (indexed lookup on `wallet_id`)                                                        |
| `launchDraft(accountId, id, category)`                                                                       | creator = caller, slug id                          | optional `target: { walletId, workspaceId }`: wallet stakes, creator = wallet, `workspace_id` set, id `ws-<uuid>` |
| `row`, `quote`, `trade`, `portfolio`, `marketTrades`, `history`, `resolution`, `credit`, `proposedMarketIds` | —                                                  | unchanged: callers are gated, and the settlement sweep must keep covering private markets                         |

### Other server modules

| Function                                                      | Change                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifications.ts` `inbox`, `markAllRead`                     | `account_id IN (SELECT ? UNION SELECT wallet_id FROM workspace_members WHERE account_id=? AND removed_at IS NULL)`; add `workspaceId` per item via `LEFT JOIN markets`. Removed members stop seeing private notifications automatically. |
| `notifications.ts` `notify`, `holderIds`, `announceOutcome`   | unchanged (they write to the wallet)                                                                                                                                                                                                     |
| `community.ts`, `orders.ts`, `resolution.ts`, `engagement.ts` | unchanged: they take the account id the route resolved; names come from `handle()`                                                                                                                                                       |

### `server/app.ts` routes

| Route                                                                                                                    | Change                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /capabilities`                                                                                                      | `marketCount` becomes public-only through `markets()`; add `teams: boolean`                                                  |
| `GET /markets`                                                                                                           | public-only (default `workspaceId = null`)                                                                                   |
| `GET /markets/:id`, `/:id/history`, `/:id/trades`, `GET /:id/comments`                                                   | `marketActor(store, viewerId(request), id)` first; `listComments` gets the actor as its viewer                               |
| `POST /quotes`                                                                                                           | `marketActor(store, viewerId(request), body.marketId)`: anonymous for public, member-only for private                        |
| `POST /trades`, `POST /orders`                                                                                           | actor = `marketActor(store, accountId(request), body.marketId)`, passed to `store.trade` / `placeOrder`                      |
| `DELETE /orders/:id`                                                                                                     | look up the order's `market_id`, resolve the actor, then `cancelOrder(store, actor, id)` (404 when not found or not visible) |
| `POST /markets/:id/comments`, `PUT/DELETE /watchlist/:id`                                                                | actor replaces `accountId(request)`                                                                                          |
| `POST /markets/:id/resolution`, `/dispute`, `/settle`                                                                    | actor replaces `accountId(request)` (settle: gate only)                                                                      |
| `POST /markets/:id/ruling` (operator)                                                                                    | 404 when `workspace_id` is set                                                                                               |
| `GET /leaderboard`                                                                                                       | public-only                                                                                                                  |
| `POST /drafts/:id/launch`                                                                                                | optional `workspaceId`; membership required (404); passes the wallet target to `launchDraft`                                 |
| `GET /portfolio`, `/notifications`, `POST /notifications/read`, `/bonus/claim`, drafts, settings, `/sessions`, downloads | unchanged (notifications through `notifications.ts`)                                                                         |
| `onRoute` hook                                                                                                           | add 404/409 (and 403 for role routes) to the generated error responses for `/workspaces` paths                               |

## API

TypeBox additions in `server/schemas.ts`:

```ts
const NoControl = "^[^\\u0000-\\u001f\\u007f]+$";
export const WorkspaceRoleSchema = Type.Union(
  ["owner", "admin", "resolver", "member"].map((r) => Type.Literal(r)),
);
const DisplayName = Type.String({
  minLength: 2,
  maxLength: 40,
  pattern: NoControl,
});
const InviteToken = Type.String({ pattern: "^[a-f0-9]{64}$" });
export const WorkspaceIdParams = Type.Object({
  wid: Type.String({ format: "uuid" }),
});
export const WorkspaceCreateSchema = Type.Object(
  {
    name: Type.String({ minLength: 2, maxLength: 60, pattern: NoControl }),
    displayName: DisplayName,
  },
  { additionalProperties: false },
);
export const WorkspaceSchema = Type.Object({
  id: Text,
  name: Text,
  role: WorkspaceRoleSchema,
  memberCount: Units,
  createdAt: Text,
});
export const MemberSchema = Type.Object({
  id: Text,
  displayName: Text,
  role: WorkspaceRoleSchema,
  joinedAt: Text,
  you: Type.Boolean(),
});
export const WorkspaceDetailSchema = Type.Object({
  ...WorkspaceSchema.properties,
  members: Type.Array(MemberSchema),
});
export const InviteCreateSchema = Type.Object(
  {
    role: Type.Union([Type.Literal("member"), Type.Literal("resolver")]),
    expiresInHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 720 })), // default 168
    maxUses: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })), // default 25
  },
  { additionalProperties: false },
);
export const InviteSchema = Type.Object({
  id: Text,
  role: Text,
  expiresAt: Text,
  maxUses: Units,
  uses: Units,
  revoked: Type.Boolean(),
});
export const CreatedInviteSchema = Type.Object({
  ...InviteSchema.properties,
  token: Text,
}); // token returned once
export const InvitePreviewSchema = Type.Object({
  workspaceName: Text,
  role: Text,
  expiresAt: Text,
});
export const InviteTokenSchema = Type.Object(
  { token: InviteToken },
  { additionalProperties: false },
);
export const JoinSchema = Type.Object(
  { token: InviteToken, displayName: DisplayName },
  { additionalProperties: false },
);
export const RoleChangeSchema = Type.Object(
  { role: WorkspaceRoleSchema },
  { additionalProperties: false },
);
// Existing schemas:
// LaunchSchema   += workspaceId: Type.Optional(Type.String({ format: "uuid" }))
// MarketSchema   += workspaceId: Type.Optional(Text)
// InboxSchema.items += workspaceId: Type.Optional(Text)
// capabilities 200 += teams: Type.Boolean()
```

Routes (all under `/api/v1`; every one needs bearer authentication):

| Method | Path                                         | Who                    | Body → success                                   | Errors                                                                            |
| ------ | -------------------------------------------- | ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| POST   | `/workspaces`                                | any person             | `WorkspaceCreateSchema` → 201 `WorkspaceSchema`  | 409 when the person already owns 5                                                |
| GET    | `/workspaces`                                | any person             | → 200 `{items: WorkspaceSchema[]}`               | —                                                                                 |
| GET    | `/workspaces/:wid`                           | member                 | → 200 `WorkspaceDetailSchema`                    | 404 non-member                                                                    |
| PATCH  | `/workspaces/:wid`                           | owner                  | `{name}` → 200 `WorkspaceSchema`                 | 403, 404                                                                          |
| POST   | `/workspaces/:wid/invites`                   | owner, admin           | `InviteCreateSchema` → 201 `CreatedInviteSchema` | 403, 404, 409 when 20 invites are active                                          |
| GET    | `/workspaces/:wid/invites`                   | owner, admin           | → 200 `{items: InviteSchema[]}`, no tokens       | 403, 404                                                                          |
| DELETE | `/workspaces/:wid/invites/:inviteId`         | owner, admin           | → 200 `{revoked: true}`                          | 403, 404                                                                          |
| POST   | `/workspaces/invites/preview`                | any person             | `InviteTokenSchema` → 200 `InvitePreviewSchema`  | 404 for unknown, expired, revoked or used-up invites (one message for all)        |
| POST   | `/workspaces/join`                           | any person             | `JoinSchema` → 201 `WorkspaceSchema`             | 404 (as above); 409 name taken, already a member, or workspace full (200 members) |
| PATCH  | `/workspaces/:wid/members/:memberId`         | owner, admin           | `RoleChangeSchema` → 200 `MemberSchema`          | 403 outside the role matrix                                                       |
| DELETE | `/workspaces/:wid/members/:memberId`         | per role matrix        | → 200 `{removed: true}`                          | 403; 409 when the owner tries to leave                                            |
| GET    | `/workspaces/:wid/markets?search=&category=` | member                 | → 200 `{items: MarketSchema[]}`                  | 404                                                                               |
| GET    | `/workspaces/:wid/portfolio`                 | member                 | → 200 `PortfolioSchema` (wallet)                 | 404                                                                               |
| GET    | `/workspaces/:wid/leaderboard`               | member                 | → 200 the public leaderboard shape               | 404                                                                               |
| POST   | `/workspaces/:wid/markets/:id/ruling`        | owner, admin, resolver | `RulingSchema` → 200 `MarketSchema`              | 403 role; 404; 409 conflict of interest or market not rulable                     |

Invite links put the token in the URL fragment: `https://<host>/join#<64 hex>`. Browsers never send fragments, so the token stays out of Fastify request logs (`server/index.ts` runs with `logger: true`) and the Render log stream. The page sends the token in a POST body. Rate limits: invite creation 10/min, preview 20/min, join 10/min. Every 404 in this table uses the same message as an unknown resource.

## Interface contract between the workstreams

Workstream A lands these first, as one "contract" commit on day 1. Workstream B codes against them and never edits them.

```ts
// shared/types.ts
export type WorkspaceRole = "owner" | "admin" | "resolver" | "member";
export interface Workspace { id: string; name: string; role: WorkspaceRole; memberCount: number; createdAt: string }
export interface WorkspaceMember { id: string; displayName: string; role: WorkspaceRole; joinedAt: string; you: boolean }
export interface WorkspaceDetail extends Workspace { members: WorkspaceMember[] }
export interface WorkspaceInvite { id: string; role: "member" | "resolver"; expiresAt: string; maxUses: number; uses: number; revoked: boolean }
export interface InvitePreview { workspaceName: string; role: "member" | "resolver"; expiresAt: string }
// Market += workspaceId?: string;  InboxNotification += workspaceId?: string;  Capabilities += teams: boolean

// shared/client.ts (PeakcastClient)
workspaces(): Promise<{ items: Workspace[] }>;
createWorkspace(name: string, displayName: string): Promise<Workspace>;
workspace(id: string): Promise<WorkspaceDetail>;
renameWorkspace(id: string, name: string): Promise<Workspace>;
createInvite(id: string, input: { role: "member" | "resolver"; expiresInHours?: number; maxUses?: number }): Promise<WorkspaceInvite & { token: string }>;
invites(id: string): Promise<{ items: WorkspaceInvite[] }>;
revokeInvite(id: string, inviteId: string): Promise<{ revoked: true }>;
previewInvite(token: string): Promise<InvitePreview>;
joinWorkspace(token: string, displayName: string): Promise<Workspace>;
setMemberRole(id: string, memberId: string, role: WorkspaceRole): Promise<WorkspaceMember>;
removeMember(id: string, memberId: string): Promise<{ removed: true }>;
workspaceMarkets(id: string, search?: string, category?: string): Promise<{ items: Market[] }>;
workspacePortfolio(id: string): Promise<Portfolio>;
workspaceLeaderboard(id: string): Promise<Leaderboard>;
workspaceRuling(id: string, marketId: string, outcome: ResolutionOutcome): Promise<Market>;
launchDraft(id: string, category: Category, workspaceId?: string): Promise<Market>; // extended
```

## UI (`src/`)

| Route                                                           | Screen                                                                                                                                         | File                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/teams`                                                        | Workspace list and create form (name, your display name); empty state explains invites                                                         | new `src/pages/Teams.tsx`                                                                                              |
| `/teams/:wid`, `/teams/:wid/leaderboard`, `/teams/:wid/members` | Workspace home with tabs. Markets reuses `MarketExplorer`; Leaderboard reuses `LeaderboardView`                                                | new `src/pages/Workspace.tsx`                                                                                          |
| `/teams/:wid/members`                                           | Members (role select, remove, leave) and invites (create with role, expiry and uses; copy the link shown once; revoke)                         | new `src/pages/WorkspaceMembers.tsx`                                                                                   |
| `/teams/:wid/markets/:id(/rules)`                               | `MarketDetail` with the **workspace** portfolio, a "Private · {workspace}" pill, and a resolver ruling form instead of the operator-token form | `Workspace.tsx` hosts it; small changes in `src/pages/MarketDetail.tsx` and `src/pages/Resolution.tsx` (`onRule` prop) |
| `/join#<token>`                                                 | Invite preview, display name, Join; then `history.replaceState` drops the fragment                                                             | new `src/pages/JoinWorkspace.tsx`                                                                                      |
| Draft studio launch                                             | "Launch to" select: Public, or each workspace; fine print says "500 workspace credits"                                                         | `src/pages/DraftStudio.tsx`                                                                                            |

Wiring in `src/App.tsx`: a "Teams" nav item (lucide `Users`) shown only when `capabilities.teams`; routes; and `onLaunched` navigating to `/teams/:wid/markets/:id` when `market.workspaceId` is set. The mobile dock already holds 6 items, so keep it at 6: Teams replaces Developers in the dock, and Developers stays in the sidebar and the menu dialog. `tests/e2e/mobile-layout.spec.ts` guards the dock. `src/Notifications.tsx` passes `workspaceId` so a private notification opens the workspace route. `LeaderboardView` gets an optional `load?: () => Promise<Leaderboard>` prop. Styles go in `src/styles.css`.

## Windows app and Android

- **Windows (Electron).** The local server is loopback-only on port 43127 with its own database, so nobody else can join a workspace there. `buildApp` gets `teams?: boolean` (default `true`). `desktop/main.mjs` passes `teams: false`, which leaves the workspace routes unregistered and sets `capabilities.teams` to false, so the UI hides Teams. The new columns are still added to the local database (harmless), and all local markets stay public as before. Later, the desktop "remote mode" in the identity plan can open hosted workspaces.
- **Android WebView shell.** It loads the hosted origin, so Teams works. `/join#token` is same-origin, which `shouldOverrideUrlLoading` in `android/MainActivity.java` allows. An invite link tapped in another app opens the system browser, not the shell. That is acceptable for v1.

## Tests

| Layer                                                        | File                             | Cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration (`node:test`, `app.inject`, `:memory:`) | `tests/workspaces.test.ts` (new) | Create a workspace: the owner wallet gets 10,000 credits and the person balance is unchanged. Invite create, preview and join. Expired, revoked and used-up invites give an identical 404. Display-name collision, already a member, member cap and owned-workspace cap give 409. Role matrix: every allowed and denied transition. Ownership transfer is atomic. The owner cannot leave. Removal cancels open orders, hides private notifications and keeps positions; rejoining reuses the wallet. Launching to a workspace debits the wallet, not the person. Ruling: a member gets 403; the creator, the disputer and a share-holding resolver get 409; a clean resolver pays out; an open or undisputed market gets 409. The operator route returns 404 for private markets. Credits are conserved per workspace across a full lifecycle (the same assertion style as `tests/lifecycle.test.ts`). Upgrading a database from the pre-Teams schema (a file created with the old constructor) adds the columns without data loss. |
| Isolation and privacy                                        | `tests/isolation.test.ts` (new)  | **Route sweep:** read `/api/v1/openapi.json` and, for every path containing `/markets/{id}`, `/quotes`, `/trades`, `/orders` or `/watchlist/{id}`, call it as an outsider (valid bearer, not a member) with a minimal valid body against a private market and assert 404. The test also asserts that its body table covers every such path, so a future route without a body fails until someone adds it. **Leak scan:** after members trade, comment and launch, fetch every public read (`/markets`, `/leaderboard`, `/capabilities`, `/markets/{public}/trades`, `/markets/{public}/comments`, an outsider's `/portfolio` and `/notifications`) and assert that the JSON contains no private market id, private title, workspace name or member display name. **Wallet credentials:** a bearer equal to `wallet:<id>` or to its hash gets 401.                                                                                                                                                                                   |
| Client                                                       | `tests/client.test.ts`           | New methods send the right method, path and body (existing mocked-fetch pattern)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Browser (Playwright, all three projects)                     | `tests/e2e/teams.spec.ts` (new)  | 1. The owner creates a workspace and an invite. A second `browser.newContext()` opens `/join#token`, picks a name and joins. The owner launches a private market from Draft studio. The member sees it under Teams and trades. `/markets` and `/leaderboard` in a third, outsider context show neither the market nor the names. 2. The member disputes; a resolver rules; the payout appears in the workspace portfolio. 3. An expired or garbage invite shows an error state with no join button. 4. On a phone viewport, the dock shows Teams and nothing overflows.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

The coverage gate stays as `npm test` defines it: 80% of lines, branches and functions over `server/**` and `shared/**`. `server/workspaces.ts` must meet it on its own.

## Workstreams

The two workstreams have no files in common. A owns the server, the shared contract and the server docs. B owns everything under `src/`, the Playwright journey and the README.

| Workstream                 | Files (new **bold**)                                                                                                                                                                                                                                                                                                                                        | Days |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **A: server and contract** | **`server/workspaces.ts`**, `server/database.ts`, `server/app.ts`, `server/schemas.ts`, `server/notifications.ts`, `shared/types.ts`, `shared/client.ts`, `desktop/main.mjs`, **`tests/workspaces.test.ts`**, **`tests/isolation.test.ts`**, `tests/client.test.ts`, `docs/API.md`, `docs/BACKEND.md`                                                       | 5    |
| **B: interface**           | **`src/pages/Teams.tsx`**, **`src/pages/Workspace.tsx`**, **`src/pages/WorkspaceMembers.tsx`**, **`src/pages/JoinWorkspace.tsx`**, `src/App.tsx`, `src/Notifications.tsx`, `src/pages/DraftStudio.tsx`, `src/pages/MarketDetail.tsx`, `src/pages/Resolution.tsx`, `src/pages/Leaderboard.tsx`, `src/styles.css`, **`tests/e2e/teams.spec.ts`**, `README.md` | 5    |

Sequence:

1. Day 1: A lands the [contract](#interface-contract-between-the-workstreams) (types, client methods, TypeBox schemas, route stubs returning 501). B starts against the types.
2. Day 3: A's routes are real. B runs `npm run dev` against them.
3. Days 4–5: A finishes the isolation sweep and docs; B writes Playwright. A reviews B's PR and B reviews A's, using the [acceptance criteria](#acceptance-criteria).
4. Integration (day 6, both): merge A, then B; run `npm run verify`.

If B needs a contract change, A makes it. B never edits `shared/`.

### Merge notes

- **Batch 1, calibration and Brier scoring.** Any new per-account or per-market scoring query must take the same `workspace_id IS ?` filter, and the public board must exclude wallets. A adds a case to the leak scan once batch 1 is merged.
- **Batch 1, embeddable widgets.** Embed routes are public by design, so they must refuse private markets (`marketActor` with no viewer, or `workspace_id IS NULL`). A adds the embed paths to the isolation sweep.
- **[Rule linter](rule-linter.md).** It also edits `launchDraft`, `server/schemas.ts` (`MarketSchema`), `shared/types.ts` (`Market`), `src/pages/DraftStudio.tsx` and `src/pages/MarketDetail.tsx`. Merge the linter first; Teams A and B rebase onto it. Expected conflicts are small: the `launchDraft` signature and the DraftStudio launch panel.

## Acceptance criteria

1. Existing tests and `npm run verify` pass, with the coverage gate met and no change to public-market behaviour or responses other than additive fields.
2. A person can create a workspace, invite with an expiring link, and have a second person join, trade, comment, dispute and see a resolver ruling, all inside the workspace.
3. An outsider gets a 404 indistinguishable from an unknown id on every market-scoped route for a private market (enforced by the route sweep), and no public response contains private data (enforced by the leak scan).
4. Workspace and public balances never mix: wallet credits move only within their own markets, and the public leaderboard and portfolio are unchanged by workspace activity.
5. Invite tokens are stored hashed, sent only in POST bodies or the URL fragment, revocable, single-response, and limited by expiry and use count.
6. Role rules and the conflict-of-interest rule match the tables above, and the operator cannot rule private markets.
7. An existing pre-Teams SQLite file upgrades on startup with all data intact (tested).
8. The Windows app hides Teams, and its startup and smoke test (`npm run test:desktop`) still pass.
9. Docs: `docs/API.md` lists the routes and errors, and `docs/BACKEND.md` explains wallets and the gate.

## Effort

About 10 dev-days in total: A 5, B 5, plus 1 shared integration day, which is 1.5 calendar weeks with two people. Add 1–2 days if batch 1 changes `leaderboard()` substantially.

## Risks and dependencies

| Risk                                                                                                                                | Mitigation                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The hosted database resets on restart (Render free tier, ephemeral disk)                                                            | Ship [identity-and-persistence](identity-and-persistence.md) phase 1 before onboarding any customer                             |
| Anonymous sessions expire after 30 days or vanish when browser storage is cleared, and an orphaned owner loses the workspace        | Identity phase 2 (claimed accounts, sessions table). Until then, label Teams "preview".                                         |
| A future route forgets the gate                                                                                                     | The route sweep fails on any new `/markets/{id}` path that is not in its table                                                  |
| Notification text and the inbox carry private titles                                                                                | They are filtered by active membership at read time; the stored rows stay on the wallet                                         |
| Companies offering prizes for the leaderboard could make play money look like stakes under India's 2025 online gaming law           | No prize, purchase or transfer features; terms of service forbid redeeming credits; counsel to confirm (product owner decision) |
| College clubs may include members under 18 (DPDP Act section 9: verifiable parental consent, no behavioural monitoring of children) | 18+ declaration in the join flow once identity lands; product owner and counsel decide (see the identity plan)                  |

## Product owner decisions

1. Seat pricing and the free tier (members per workspace; the cap of 200 is a technical default).
2. Whether all members may launch markets, or only admins (v1: all).
3. Default invite expiry (7 days) and use limit (25).
4. Whether the platform operator may ever see or rule private markets (v1: never).
5. The "preview" label and timing relative to identity and persistence.

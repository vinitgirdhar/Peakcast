# Operator console and moderation

**Recommendation.** Build one admin area at `/admin`, served by the same app and API, behind **named operator keys** rather than the single shared `OPERATOR_TOKEN`. The existing token becomes a root credential whose main job is to mint and revoke named keys. Without names, an audit log can only say "someone with the token did it". Every operator action and every automatic moderation action writes a row to an **append-only, hash-chained `audit_log`** in the same transaction as the change. The console covers:

- a queue of disputed and stuck markets to rule, using the existing `rule()`;
- market review: approve or reject launches the topic policy sent to review, and hide or restore a live market;
- comment moderation: a report button, hide, and an expiring ban on the account behind an alias;
- a server-side **topic policy** that runs next to the rule linter at draft save and launch, with `block` and `review` decisions;
- read-only multi-account farming signals with manual actions only.

Private workspace markets stay invisible to operators, exactly as the Teams plan decided: every console market route goes through `marketActor(store, undefined, id)`. Three implementers, about 14 dev-days. This is a foundation for the [data API](data-api.md) (tier changes and key revocation) and the [market autopilot](market-autopilot.md) (its approval queue).

Status: plan for batch 3, written 2026-11-22 against `main` at `4a021de` plus the uncommitted batch-2 work in the main checkout. Nothing here is legal advice; counsel confirms the policy list and the grievance process.

## What exists today

| Area              | Current behaviour (code)                                                                                                                                                                                                      | Gap                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator identity | `POST /markets/:id/ruling` compares `X-Operator-Token` with `OPERATOR_TOKEN` (16–256 characters) using `timingSafeEqual`; `render.yaml` generates the value. `src/pages/Resolution.tsx` has an inline "Operator ruling" form. | One shared secret, no attribution, no revocation short of a redeploy, no list of what needs ruling                                                                          |
| Rulings           | `rule(store, marketId, outcome)` in `server/resolution.ts` pays out disputed, closed-unproposed and house markets; `memberRuling` handles workspace markets.                                                                  | No queue; operators must know the market id                                                                                                                                 |
| Launch gate       | `Store.launchDraft` runs `lintDraft` and refuses `block` findings (`blockingReason`), then stores `ruleCheck`.                                                                                                                | Nothing checks **topic**: a perfectly worded market on a death, a minor or an Indian election launches                                                                      |
| Comments          | `addComment` (5-second cooldown, 500 characters), `listComments` (last 50). Comment authors show as `Store.handle()` aliases.                                                                                                 | No report, hide or ban                                                                                                                                                      |
| Abuse             | `POST /sessions` limited to 10/minute per IP; every account gets 10,000 credits and a daily bonus of 50–100; no transfers exist.                                                                                              | Credits can still be funnelled: farm accounts lose trades in a market whose creator collects fees and the pool remainder (`payOut` returns unused liquidity to the creator) |
| Client IP         | No `trustProxy`, so behind Render's proxy `request.ip` is the proxy                                                                                                                                                           | IP-based limits and any IP signal are meaningless on the hosted demo until fixed (also called out in the data API plan)                                                     |

## Operator identity: options

| Option                                                            | Audit attribution          | Revocation                    | Effort                     | Works before identity phase 2 | Verdict                     |
| ----------------------------------------------------------------- | -------------------------- | ----------------------------- | -------------------------- | ----------------------------- | --------------------------- |
| Keep the shared `OPERATOR_TOKEN`                                  | None ("operator")          | Rotate the env var, redeploy  | 0                          | yes                           | Not enough for an audit log |
| **Named operator keys minted with the root token**                | Per person                 | Per key, immediate            | 1 d                        | yes                           | **Recommended for v1**      |
| Operator role on claimed user accounts (email code sign-in)       | Per user, with email proof | Per user, plus session revoke | 1 d after identity phase 2 | no                            | v2, once accounts exist     |
| Access proxy in front of `/admin` (for example Cloudflare Access) | Outside the app only       | At the proxy                  | ops                        | yes                           | Optional extra layer later  |

Design (new `server/operators.ts`):

```sql
CREATE TABLE IF NOT EXISTS operators (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('admin','moderator')), token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT);
```

- `X-Operator-Token` keeps its name. `operatorFrom(request)` checks the root token first (constant-time, as today), then `hashToken(value)` against `operators.token_hash`. It returns `{id: "root" | operatorId, name, role}` or throws 403. When `OPERATOR_TOKEN` is unset, every console route returns 503, as the ruling route does today.
- **Root** can do everything, but the console nudges: "Root is for creating operators. Create a named key and use that." Root actions are audited as `root`.
- Named keys are 32 random bytes hex, shown once, created and revoked only by root or an `admin` operator. A `moderator` cannot create operators.
- **The console keeps the key in `sessionStorage`**, cleared when the tab closes, never `localStorage`, and sends it only to `/api/v1/admin/*` and the legacy ruling route. The app's CSP (`scriptSrc 'self'`) is unchanged.
- **Windows app:** `capabilities.operatorConsole` is false when `localOnly` or when `OPERATOR_TOKEN` is unset, so the desktop never shows `/admin`.
- Operators are staff, not accounts. They do not trade as operators, so the workspace conflict-of-interest rule has no equivalent here. An operator who also trades with a personal demo account cannot be detected until identity phase 2 links accounts to people. The audit log is the control.

| Action                                                                          | moderator | admin           | root |
| ------------------------------------------------------------------------------- | --------- | --------------- | ---- |
| See queue, reports, abuse signals, audit log                                    | yes       | yes             | yes  |
| Hide and unhide comments; resolve reports; comment bans up to 7 days            | yes       | yes             | yes  |
| Approve or reject pending launches; hide and restore markets                    | yes       | yes             | yes  |
| Rule markets (including voiding a hidden market as INVALID)                     | no        | yes             | yes  |
| Bans longer than 7 days, launch and bonus bans, leaderboard exclusion           | no        | yes             | yes  |
| Data API: set key tier, revoke a key (after the [data API](data-api.md) merges) | no        | yes             | yes  |
| Approve [autopilot](market-autopilot.md) candidates                             | yes       | yes             | yes  |
| Create and revoke operators                                                     | no        | moderators only | all  |

## Append-only audit log

```sql
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, detail TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL UNIQUE);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
```

- `audit(store, actor, action, target, reason, detail)` runs **inside the caller's transaction** (`Store.transaction`, or the explicit `BEGIN IMMEDIATE` in `launchDraft`), so a ruling and its audit row commit or roll back together. `hash = sha256(prev_hash + JSON.stringify([at, actor, action, target_type, target_id, reason, detail]))`; the first row's `prev_hash` is 64 zeros.
- `reason` is required (3–500 characters) on every operator action; the console makes it a text field with presets ("Policy: violence", "Spam", "Rules ambiguity").
- `detail` is a small JSON object: outcome, old and new state, report ids, ban length. It holds account ids where the action targets an account, never emails or IP data.
- `GET /admin/audit/verify` recomputes the chain and returns the first broken id. Mark the triggers `// ponytail: triggers and the chain give tamper evidence, not tamper proof; anyone with the database file can rewrite both. The off-site Litestream replica (identity plan phase 1) is the copy an attacker cannot reach.`
- Automatic actions (report auto-hide, autopilot fetch failures surfaced as alerts) are audited with actor `system`.
- The existing `POST /markets/:id/ruling` route stays for compatibility. It now resolves the operator through `operatorFrom`, accepts an optional `reason` in `RulingSchema` (still `additionalProperties: false`, so this is purely additive), and writes the same audit row as the console ruling.

## Queue and market review

`GET /api/v1/admin/queue` returns public markets only (`workspace_id IS NULL`), oldest first, in four groups:

| Group          | Rule                                                                                 | Action                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Disputed       | `resolution.status = 'disputed'`                                                     | Rule YES, NO or INVALID with a reason; the card shows evidence URL, rules, challenge times, the 100-credit bond at stake |
| House, closed  | `creator_id IS NULL`, status `closed` (seed fixtures and approved autopilot markets) | Rule                                                                                                                     |
| Creator silent | Community market `closed` with no proposal for more than 7 days                      | Rule (creator gets a notification first at 3 days, from the same sweep that runs `settleDue`)                            |
| Pending review | `markets.moderation = 'pending'` (the topic policy said review)                      | Approve (opens trading) or reject (refunds the 500-credit stake)                                                         |

Each card links to reports on that market and to its audit history. The queue also shows counts of open reports, abuse signals and autopilot candidates.

**Market moderation state.** Add `markets.moderation TEXT` (NULL, `pending`, `hidden` or `rejected`) through the existing `PRAGMA table_info` + `ALTER TABLE` loop in the `Store` constructor; existing rows stay NULL.

| State      | Lists, search, leaderboards' creator rows, embeds, oEmbed, link previews, data API | `GET /markets/:id` and other market routes                                                                        | Trading and orders                           |
| ---------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| NULL       | shown                                                                              | as today                                                                                                          | as today                                     |
| `pending`  | hidden                                                                             | creator only; everyone else gets the unknown-market 404                                                           | halted: "This market is waiting for review." |
| `hidden`   | hidden                                                                             | creator and current holders (`positions.shares > 0`) see it with a "Removed by moderators" banner; others get 404 | halted; open orders cancelled with a note    |
| `rejected` | hidden                                                                             | creator only, with the reason                                                                                     | halted                                       |

- The visibility rule lives in **`marketActor`** (`server/workspaces.ts`), the one gate every market route already calls, so no route can forget it. Only a market whose `moderation` is not NULL pays for the extra creator and holder lookup. Embeds and oEmbed call the gate with no viewer, so they 404 automatically.
- The trading halt is one check in `Store.quote`, which `Store.trade` and `matchOrders` already call.
- `Store.markets()` adds `AND moderation IS NULL`. `capabilities.marketCount` follows.
- **Reject** a pending market: refund the stake (`credit(creator, LAUNCH_STAKE_MICROS, "stake_return", id)`), set `rejected`, notify the creator. No trades can exist, so nothing else moves.
- **Hide** a live market: set `hidden`, cancel open orders (`cancelMarketOrders`), notify holders. Positions stay. An admin then either **restores** it (NULL) or **voids** it with `rule(…, "INVALID")`, which pays 0.5 credit per share and returns the creator's unused liquidity, so credits stay conserved (the `tests/lifecycle.test.ts` conservation assertion is reused).

## Topic policy

New `server/policy.ts` (logic) and `server/policy-data.ts` (word lists and patterns), server-only. It sits next to the linter but answers a different question: the linter asks "can this be resolved fairly?", the policy asks "should this exist at all?". Mark the data `// ponytail: static lists; change by pull request with a test, not runtime config.`

```ts
export type PolicyCategory =
  | "death"
  | "violence"
  | "private-person"
  | "minor"
  | "india-election"
  | "sexual"
  | "crime-accusation"
  | "other-election";
export interface PolicyFinding {
  category: PolicyCategory;
  decision: "block" | "review";
  field: keyof DraftInput;
  match: string;
}
export interface PolicyResult {
  decision: "allow" | "review" | "block";
  findings: PolicyFinding[];
}
export function evaluatePolicy(
  draft: DraftInput,
  scope: "public" | "workspace",
): PolicyResult; // pure, deterministic
```

| Category           | Public market | Workspace market | Fires on (normalised question, rules and source name)                                                                                                                                                                                                                                                                                                                                                     | Guards against false positives                                                                               |
| ------------------ | ------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `death`            | **block**     | **block**        | die, dies, died, death, dead, alive, survive, killed, fatalities, death toll, casualties, assassinat*, suicide, funeral; Hinglish `maut`, `marega`, `mar jayega`                                                                                                                                                                                                                                          | Allowlisted phrases: "Death Valley", "deadline", "dead heat", "dead cat bounce"                              |
| `violence`         | **block**     | **block**        | attack, bomb, terror*, shooting, gunman, riot, murder, rape, kidnap, abduct, lynch, war (not in "trade war", "price war", "bidding war", "war room"), invade, airstrike, missile strike, hostage; `hatya`, `danga`                                                                                                                                                                                        | Allowlist above; sports idioms ("attacking batter") via a small phrase list                                  |
| `minor`            | **block**     | **block**        | child, children, kid(s), minor, under 18, under-age, schoolboy, schoolgirl, teen*, baby, infant, newborn, "class 1–12 student", board-exam results of a named student                                                                                                                                                                                                                                     | "U19", "under-19" team fixtures and results go to **review**, not block                                      |
| `sexual`           | **block**     | **block**        | explicit sexual terms list                                                                                                                                                                                                                                                                                                                                                                                | —                                                                                                            |
| `india-election`   | **block**     | **block**        | An election word (election, poll(s), vote, voting, exit poll, by-election, bypoll, Lok Sabha, Rajya Sabha, Vidhan Sabha, assembly, panchayat, municipal, mayor, chief minister, CM, prime minister, seats, vote share, NOTA, ECI, Election Commission; `chunav`, `matdan`) **and** an India marker (India, Indian, any state or union territory name, major party names and abbreviations)                | Election word with no India marker falls to `other-election`                                                 |
| `private-person`   | **review**    | allow            | **Block** (both scopes) on contact details: email address, phone number (10-digit Indian mobile, +country code), `@handle`. **Review** on relationship words (my boss, my ex, my friend, neighbour, classmate, roommate, girlfriend, boyfriend, husband, wife) or a capitalised two-word name next to a personal-life word (marry, divorce, pregnant, break up, fired, resign, arrested, cheat, hospital) | Names of organisations, places and well-known public offices are not matched by the personal-life rule alone |
| `crime-accusation` | **review**    | **review**       | arrested, charged, convicted, jailed, guilty, raided, FIR against, named in a capitalised-name context                                                                                                                                                                                                                                                                                                    | Institutional outcomes ("Will SEBI fine…", "Will the court rule…") stay allowed                              |
| `other-election`   | **review**    | **review**       | Election words without an India marker (for example a US or UK election)                                                                                                                                                                                                                                                                                                                                  | —                                                                                                            |

- **Normalisation before matching**: Unicode NFKC, lower case, zero-width characters removed, a small leetspeak map (`0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s`), repeated letters collapsed to two, and word boundaries on letters only, so `d.e.a.t.h` and `deeeath` are caught. Hindi in Devanagari for the Hinglish terms above is included; the lists are a starting point for counsel and the product owner to extend.
- **Why Indian elections are blocked, not reviewed:** section 126A of the Representation of the People Act, 1951 bars publishing exit-poll results during notified periods, the Model Code of Conduct applies during campaigns, and a crowd "probability" on a named candidate or party is easy to present as an opinion poll. With play money and no prizes this is still a reputational and regulatory risk with no upside for the demo. Counsel confirms.
- **Why private people are allowed in workspaces:** "Will Priya's team ship the beta by Friday?" is the B2B product. Inside a workspace only contact details, deaths, violence, minors and sexual content are refused.
- **Where it runs:**
  1. `POST /drafts` and `/drafts/generate`: the saved draft carries `policy: PolicyResult` (computed on read in `Store.drafts`, so old drafts get it too and nothing is migrated). Saving is never refused: drafts are private.
  2. `Store.launchDraft`, right after the linter: `block` → 409 "This topic is not allowed on Peakcast: death, violence." and nothing changes; `review` on a public launch → the market is inserted with `moderation = 'pending'`, the stake is taken, and the 201 response carries `moderation: "pending"`; the creator is told it will open after review.
  3. The [autopilot](market-autopilot.md) runs it on every candidate.
  4. Comments are not policy-checked in v1; reports handle them.
- The Draft studio shows policy findings next to the rule check as "Topic policy: not allowed (death)" or "Will need moderator review (private person)". The exact word lists are not shipped to the browser; the server's result is.

## Comment moderation

```sql
CREATE TABLE IF NOT EXISTS comment_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, comment_id INTEGER NOT NULL REFERENCES comments(id), reporter_id TEXT NOT NULL REFERENCES accounts(id), reason TEXT NOT NULL CHECK(reason IN ('spam','harassment','personal-info','hate','illegal','other')), note TEXT, created_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT, UNIQUE(comment_id, reporter_id));
CREATE TABLE IF NOT EXISTS bans (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), scope TEXT NOT NULL CHECK(scope IN ('comment','launch','bonus')), reason TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, lifted_at TEXT, operator_id TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS bans_account ON bans(account_id, scope);
-- ALTER loop: comments.hidden_at TEXT, comments.hidden_reason TEXT
```

| Feature              | Behaviour                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report button        | `POST /api/v1/comments/:commentId/report {reason, note?}`, bearer required. The route resolves the comment's market and calls `marketActor` first; **reports on private-market comments return 404 for everyone in v1** (workspace self-moderation is a later Teams feature). One report per account per comment (409), 20 reports per account per day (429), not on your own comment (403). |
| Auto-hide            | When 3 distinct reporters whose accounts are at least 24 hours old and have at least one trade report the same comment, it is hidden pending review (actor `system`, audited). Brand-new farm accounts cannot brigade.                                                                                                                                                                       |
| Hide and unhide      | Operator action with reason; resolves the comment's open reports. `listComments` filters `hidden_at IS NULL` for everyone except the author, who sees "Hidden by moderators" (so they do not just repost from a fresh account without knowing). The author gets a notification (new kind `comment_hidden`).                                                                                  |
| Ban an alias         | The console acts on a **comment or report id**; the server maps it to the account behind the alias. Scopes: `comment` (checked in `addComment`, 403 "You cannot comment until …"), `launch` (checked in the launch route), `bonus` (checked in `claimBonus`). Expiry 1 hour to 90 days; lifting is audited.                                                                                  |
| Who sees account ids | Only `/admin` responses, for accounts an action targets; public responses still never contain one (the existing "account ids never reach a member" test keeps passing).                                                                                                                                                                                                                      |
| Grievance contact    | A footer link and a `mailto:` for users who were moderated, pending the product owner's grievance officer decision. If counsel treats Peakcast as an intermediary for comments, the IT Rules, 2021 set acknowledgement and resolution deadlines that this process must meet.                                                                                                                 |

## Anti-abuse: farming signals

The farming path that exists today: create many accounts (10,000 credits each, plus daily bonuses), launch a market from a main account, have the farm accounts trade badly in it, and let the main account collect creator fees and the pool remainder at resolution. Signals are **read-only**; every action is manual and audited.

New `accounts.created_net TEXT` (ALTER loop): `HMAC-SHA256(ABUSE_SALT, IPv4 /24 or IPv6 /48)` truncated to 16 hex characters, set in `Store.createSession` from `request.ip`, which needs `trustProxy` (see [data API](data-api.md#keys); whichever plan lands first adds `TRUST_PROXY_HOPS`). A sweep nulls it after 30 days (data minimisation under the DPDP Act). `ABUSE_SALT` is a new secret; without it, `created_net` stays NULL and signal 1 is skipped.

| Signal                | Query (new `server/abuse.ts`)                                                                                                             | Threshold (starting point) |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Account burst         | Accounts sharing `created_net` created within 24 hours                                                                                    | 5 or more                  |
| Creator concentration | A market where accounts younger than 3 days, or sharing the creator's `created_net`, supplied most of the volume                          | at least 60% of volume     |
| Funnel to one creator | Accounts whose trades are all in markets of one other creator, with net losses there and bonus claims as their only other ledger activity | 3 or more such accounts    |
| Leaderboard outlier   | A top-20 trader or creator whose P&L or fees come mainly from markets or counterparties flagged above                                     | at least 80%               |

`GET /admin/abuse` returns signals with the involved aliases, markets, counts and the account ids the actions need. Actions: exclude from public leaderboards (new `accounts.flags TEXT`, read by `Store.leaderboard` and `forecasterBoard` for the public board only), `bonus` or `launch` ban, hide or void a market. No automatic punishment: the thresholds will have false positives (a college club joining from one campus network looks like a burst).

## Routes (all under `/api/v1/admin`, `X-Operator-Token`, rate limit 60/minute per operator)

| Method and path                                                                | Role          | Notes                                                                                               |
| ------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------- |
| `GET /admin/me`                                                                | any           | name and role                                                                                       |
| `GET /admin/queue`                                                             | any           | groups above, public markets only                                                                   |
| `POST /admin/markets/:id/ruling`                                               | admin         | `{outcome, reason}`; gate first, so a private id is the unknown-market 404                          |
| `POST /admin/markets/:id/review`                                               | any           | `{decision: "approve" \| "reject", reason}`; 409 unless `pending`                                   |
| `POST /admin/markets/:id/visibility`                                           | any           | `{state: "hidden" \| "visible", reason}`                                                            |
| `GET /admin/reports?status=open\|resolved`                                     | any           | newest first, with comment text, alias and market title                                             |
| `POST /admin/comments/:commentId/hide` and `/unhide`                           | any           | `{reason}`                                                                                          |
| `POST /admin/bans`, `DELETE /admin/bans/:id`                                   | any / admin   | `{commentId \| reportId, scope, hours, reason}`; moderators capped at 168 hours and `comment` scope |
| `GET /admin/abuse`, `POST /admin/accounts/:accountId/flags`                    | any / admin   | leaderboard exclusion on or off                                                                     |
| `GET /admin/audit?after=&limit=`, `GET /admin/audit/verify`                    | any           | paged, newest first                                                                                 |
| `GET /admin/operators`, `POST /admin/operators`, `DELETE /admin/operators/:id` | admin or root | token returned once                                                                                 |

Every route is tagged `Admin` in OpenAPI with an `operatorToken` security scheme; the `onRoute` hook adds 403, 404, 409 and 503 for `/api/v1/admin` paths.

## UI

| Route                   | Screen                                                                                                                                                                                     | File                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `/admin`                | Token entry (password field, `autocomplete="off"`), then tabs: Queue, Moderation, Abuse, Audit, Operators. Not in the sidebar or dock; reached by URL. "Sign out" clears `sessionStorage`. | new `src/pages/Admin.tsx`                    |
| `/admin` → Queue        | Grouped cards; ruling dialog with outcome, required reason and a confirmation that names the outcome and the payout effect                                                                 | new `src/pages/AdminQueue.tsx`               |
| `/admin` → Moderation   | Open reports with hide, dismiss and ban; active bans with lift                                                                                                                             | new `src/pages/AdminModeration.tsx`          |
| `/admin` → Abuse, Audit | Signal table with actions; audit log table with "Verify chain"                                                                                                                             | new `src/pages/AdminAudit.tsx` (both tables) |
| Market comments         | "Report" in each comment's overflow menu (not on own comments, not on private markets), reason select                                                                                      | `src/pages/MarketExtras.tsx`                 |
| Draft studio            | Policy line next to the rule check; launch button text "Launch for review" when the result is `review`; disabled with reason on `block`                                                    | `src/pages/RuleCheck.tsx`                    |
| Market page             | "Waiting for review", "Removed by moderators" and "Rejected: reason" banners                                                                                                               | `src/pages/MarketDetail.tsx`                 |

The inline operator ruling form in `src/pages/Resolution.tsx` stays (it now accepts a named key), with a link "Open the operator console".

## Tests

| File (new **bold**)            | Cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`tests/operators.test.ts`**  | Root mints a moderator and an admin (token once, hash stored); revoked key 403 on the next request; unset `OPERATOR_TOKEN` → 503 everywhere. Role matrix: every allowed and denied action. Each action writes exactly one audit row inside its transaction (a forced failure after the change rolls back both). `UPDATE` and `DELETE` on `audit_log` abort; dropping the trigger and editing a row makes `/audit/verify` report that id. Queue groups. Approve pending opens trading; reject refunds 500 credits exactly. Hide halts trading, cancels orders, keeps positions; holders and creator still read it, others get the unknown 404; void pays INVALID and the conservation assertion holds. The legacy ruling route still works with the root token and is audited. |
| **`tests/policy.test.ts`**     | Table-driven realistic drafts per category and scope: "Will [named actor] die before 2028?" block; "Will the death toll from Cyclone X exceed 100?" block; "Will BJP win more than 40 seats in the Bihar assembly election?" block; "Will Donald Trump win the 2028 primary?" review; "Will my neighbour Rahul Sharma get married this year?" review public, allow in workspace; a draft with a phone number block in both; Hinglish and leetspeak variants; Devanagari terms. False-positive guards: "trade war", "Death Valley temperature", "deadline", "U19 World Cup final" (review, not block), all 12 seed fixtures and every test draft constant (allow, so existing launch tests pass). Property test: 500 random drafts never throw and are deterministic.          |
| **`tests/moderation.test.ts`** | Report flow and its 403, 404, 409 and 429 cases; auto-hide at three qualified reporters and not at three day-old farm accounts; hidden comments vanish from `listComments` except for the author; hide and unhide resolve reports and notify; bans block `addComment`, launch and bonus with the right messages, expire, and can be lifted.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **`tests/abuse.test.ts`**      | With `TRUST_PROXY_HOPS=1` and `ABUSE_SALT`, six sessions from one forwarded /24 plus losing trades in one creator's market raise burst, concentration and funnel signals; organic accounts from different networks raise none; `created_net` is nulled after 30 days (fake clock); leaderboard exclusion removes the account from the public board only.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/isolation.test.ts`      | The `scoped` regex gains `\/comments\/\{commentId\}` and `\/admin\/markets\/\{id\}` already matches `/markets/{id}`. New `cases` rows for every `/admin/markets/{id}/…` route (with the operator header) and the report route: a private market or comment must answer exactly like an unknown id. The leak scan adds `/admin/queue`, `/admin/reports`, `/admin/abuse` and `/admin/audit` read with the operator token.                                                                                                                                                                                                                                                                                                                                                       |
| `tests/client.test.ts`         | New client methods.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **`tests/e2e/admin.spec.ts`**  | Operator signs in, sees a disputed market in the queue, rules it with a reason, sees the audit row. A user reports a comment, the operator hides it, the comment disappears for another context. A policy-review launch shows "Waiting for review", the operator approves, trading opens. axe on every tab; phone viewport has no overflow.                                                                                                                                                                                                                                                                                                                                                                                                                                   |

`server/operators.ts`, `server/policy.ts`, `server/moderation.ts` and `server/abuse.ts` each meet the 80% coverage gate.

## Interface contract between the workstreams

Workstream A lands on day 1: the tables and columns, `shared/types.ts` types (`OperatorRole`, `QueueItem`, `CommentReport`, `Ban`, `AbuseSignal`, `AuditEntry`, `PolicyResult`, `Market.moderation?`, `SavedDraft.policy?`, `Capabilities.operatorConsole`), the client methods, and these server functions:

```ts
// server/operators.ts (A)
export function operatorFrom(request: FastifyRequest): Operator; // 403 / 503
export function requireRole(
  operator: Operator,
  role: "moderator" | "admin",
): void;
export function audit(
  store: Store,
  operator: Operator | "system",
  action: string,
  target: { type: string; id: string },
  reason: string,
  detail: object,
): void;
// server/policy.ts (B) — A's launchDraft and drafts() call it
export function evaluatePolicy(
  draft: DraftInput,
  scope: "public" | "workspace",
): PolicyResult;
// server/moderation.ts (B) — A's app.ts calls it once
export function registerModeration(
  app: FastifyInstance,
  store: Store,
  accountId: (r: FastifyRequest) => string,
): void; // report route + /admin reports, comments, bans, abuse routes
```

## Workstreams

| Workstream                                       | Files (new **bold**)                                                                                                                                                                                                                                                                                                                          | Days | Acceptance          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------- |
| **A: operators, audit, queue, market review**    | **`server/operators.ts`**, **`server/admin-routes.ts`**, `server/app.ts`, `server/database.ts`, `server/workspaces.ts` (`marketActor` moderation branch only), `server/schemas.ts`, `shared/types.ts`, `shared/client.ts`, **`tests/operators.test.ts`**, `tests/isolation.test.ts`, `tests/client.test.ts`, `docs/API.md`, `docs/BACKEND.md` | 5    | Criteria 1, 2, 3, 7 |
| **B: policy, comment moderation, abuse signals** | **`server/policy.ts`**, **`server/policy-data.ts`**, **`server/moderation.ts`**, **`server/abuse.ts`**, `server/community.ts`, `server/engagement.ts`, **`tests/policy.test.ts`**, **`tests/moderation.test.ts`**, **`tests/abuse.test.ts`**                                                                                                  | 5    | Criteria 4, 5, 6    |
| **C: console and in-app UI**                     | **`src/pages/Admin.tsx`**, **`src/pages/AdminQueue.tsx`**, **`src/pages/AdminModeration.tsx`**, **`src/pages/AdminAudit.tsx`**, `src/App.tsx`, `src/pages/MarketExtras.tsx`, `src/pages/RuleCheck.tsx`, `src/pages/MarketDetail.tsx`, `src/styles.css`, **`tests/e2e/admin.spec.ts`**, `README.md`                                            | 4    | Criterion 8         |

Sequence: day 1 contract (A) → B and C in parallel → day 4 A's routes real → day 6 integration and `npm run verify`. B never edits `server/database.ts` or `server/app.ts`; if B needs a column or a hook, A adds it.

Merge notes: the Teams UI engineer is editing `src/App.tsx`, `src/pages/MarketDetail.tsx` and `src/pages/DraftStudio.tsx`; C rebases after Teams UI merges and keeps its `MarketDetail.tsx` change to one banner component. The [data API](data-api.md) edits the same server files; merge it first, then this plan, whose A removes the data API's `TODO(console)` and adds the `moderation IS NULL` filter to the dataset. The [autopilot](market-autopilot.md) depends on this plan's `operatorFrom`, `audit` and `evaluatePolicy`.

## Acceptance criteria

1. Every console action needs a named or root operator key, is permitted by the role matrix, and writes exactly one audit row in the same transaction; the log cannot be updated or deleted through SQLite, and chain verification detects edits.
2. The queue lists every disputed, house-closed, creator-silent and pending public market, and rulings pay out exactly as `rule()` does today.
3. Hidden, pending and rejected markets disappear from every public list, embed, preview and the data API; holders keep their positions; voiding conserves credits.
4. The topic policy blocks or sends to review every case in its test table, allows every seed fixture and existing test draft, and runs at launch on the server; its lists are not shipped to the browser.
5. Reports, auto-hide, hide, unhide and bans behave as specified, and banned accounts get clear messages.
6. Abuse signals fire on the constructed farm and not on organic accounts; IP-derived data is a salted hash of a network prefix, deleted after 30 days.
7. Private workspace markets and comments are invisible to operators and to the report route; the isolation sweep and leak scan cover every new route.
8. The console is accessible, works on a phone, keeps the key only in `sessionStorage`, and is absent from the Windows app.

## Effort

About 14 dev-days: A 5, B 5, C 4, plus an integration day. Policy word lists need another half-day of review with the product owner and counsel.

## Risks

| Risk                                                     | Mitigation                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Word lists miss euphemisms or block legitimate questions | `review` as the default for uncertain categories; lists change by pull request with test cases; operators see every review |
| A stolen operator key                                    | Named keys revocable instantly; root kept offline after minting; every action audited; console keeps the key per tab only  |
| Audit log rewritten by someone with server access        | Hash chain plus the off-site Litestream replica from the identity plan                                                     |
| IP signals are personal data                             | Salted prefix hash, 30-day retention, documented in the privacy notice                                                     |
| Operators overwhelmed by review volume                   | Review only for public launches; workspaces skip `private-person`; autopilot candidates are pre-filtered                   |

## Product owner decisions

1. Operator identity: named operator keys now (recommended), operator roles on real accounts after identity phase 2.
2. The policy table: which categories block and which go to review, and whether aggregate death statistics (road deaths, disaster tolls) stay blocked.
3. Indian elections: block entirely (recommended); and whether foreign elections are allowed after review.
4. Whether workspaces may name private people (recommended: yes, it is the B2B use case).
5. Auto-hide threshold (3 qualified reporters) and maximum ban lengths per role.
6. A grievance officer and contact address for moderated users, and counsel's view on intermediary obligations for comments.
7. `ABUSE_SALT` and the 30-day retention of network hashes; the privacy notice wording.
8. Whether workspace admins get their own comment moderation later (v1: private comments cannot be reported).

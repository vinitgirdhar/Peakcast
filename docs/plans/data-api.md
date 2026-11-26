# D: paid data API

**Recommendation.** Add **developer API keys** as a second kind of credential, separate from the 30-day demo bearer. A key is a random secret sent as `X-API-Key`; only its SHA-256 hash is stored (the same `hashToken` the sessions and invites use). Each key belongs to one **person** account, never a workspace wallet, and carries a fixed set of scopes (`markets:read`, `history:read`, `trade`) and a tier. Keys reach only routes that declare a scope, and **only public markets**: a private market answers a key exactly like an unknown id. The existing `@fastify/rate-limit` registration gets a `keyGenerator` and a `max` function, so a valid key is limited per key at its tier's rate and everything else stays per IP. Per-key daily usage is counted in memory and flushed to a small `api_usage` table. Two data products are built from the `trades` table with no new storage: **OHLC candles** (1 h and 1 d) and a **resolved-questions dataset** (CSV and JSON). Billing is manual for v1: an operator sets a key's tier in the [operator console](operator-console.md). Three implementers, about 11 dev-days.

Do not charge anyone until [identity-and-persistence](identity-and-persistence.md) phases 1 and 2 have shipped. Today a key's owner is an anonymous account that expires after 30 days, and the hosted database resets on every Render restart.

Status: plan for batch 3, written 2026-11-22 against `main` at `4a021de` plus the uncommitted batch-2 work in the main checkout (calibration, embeds, rule linter, Teams server side, Explain). Prices are placeholders.

## What exists today

| Piece                | Current behaviour (code)                                                                                                                                                                                                                            | Consequence for D                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential           | `Store.account(token)` hashes the bearer and looks it up in `accounts.token_hash`. `accountId(request)` and `viewerId(request)` in `server/app.ts` are the only two readers.                                                                        | A key needs its own lookup. It must never be accepted by `accountId`, or it would reach drafts, settings, AI and workspace routes.                                        |
| Rate limiting        | `app.register(rateLimit, { max: 300, timeWindow: "1 minute", allowList })` keyed on `request.ip`; per-route overrides (`/sessions` 10, AI 3, `/explain` 5).                                                                                         | Add `keyGenerator` and a `max` function to the same registration. No second plugin.                                                                                       |
| Client IP on Render  | `Fastify({...})` sets no `trustProxy`, and nothing reads `X-Forwarded-For`.                                                                                                                                                                         | **Behind Render's proxy `request.ip` is the proxy's address**, so the per-IP limit is shared by many users. Fix it here (`trustProxy`, below).                            |
| Price history        | `Store.history(id)` returns the fixture baseline plus the **last 99** trades. `trades` has an index on `(market_id, created_at)`; each payload holds `probabilityAfter`, `amountMicros` and `createdAt`.                                            | Candles must read the full trade history through that index, not `history()`.                                                                                             |
| Resolved markets     | `markets.resolution` JSON with `status`, `outcome`, `proposedAt`, `resolvedAt`; `definition` JSON holds question, rules, source and `closesAt`. `server/calibration.ts` already reads resolved trades with `json_extract` and `LAG()`.              | The dataset is one query in the same style.                                                                                                                               |
| Public/private split | `marketActor(store, personId, marketId)` in `server/workspaces.ts` is the gate; `Store.markets(search, category, workspaceId = null)` filters `workspace_id IS ?`. `tests/isolation.test.ts` sweeps every OpenAPI path matching its `scoped` regex. | Every data route calls the gate with **no viewer** and every list filters `workspace_id IS NULL`. New `/data/markets/{id}/...` paths match the sweep regex automatically. |
| Developer page       | `src/pages/Developers.tsx` shows a "Copy demo API token" button that copies the 30-day session bearer.                                                                                                                                              | Add an API keys section; keep the demo token for quick experiments.                                                                                                       |

## Keys

### Storage (startup-safe, appended to the `Store` constructor's `CREATE TABLE IF NOT EXISTS` block)

```sql
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, prefix TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL UNIQUE, account_id TEXT NOT NULL REFERENCES accounts(id), name TEXT NOT NULL, scopes TEXT NOT NULL, tier TEXT NOT NULL CHECK(tier IN ('free','builder','business')), created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS api_keys_account ON api_keys(account_id);
CREATE TABLE IF NOT EXISTS api_usage (key_id TEXT NOT NULL REFERENCES api_keys(id), day TEXT NOT NULL, route_group TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, rows INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(key_id, day, route_group));
```

No column is added to an existing table, so no `ALTER` loop entry is needed.

| Field        | Rule                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secret       | `wk_` + 8-character `prefix` (base32, public, shown in lists and logs) + `_` + 32 random bytes hex. Shown **once** in the create response, like an invite token.   |
| `token_hash` | `hashToken(secret)`. A 256-bit random secret needs no slow hash; SHA-256 matches sessions and invites and keeps the lookup an indexed equality.                    |
| Owner        | The caller's person account (`accounts.workspace_id IS NULL`). Creating a key from a wallet is impossible because wallets cannot authenticate.                     |
| Expiry       | `min(requested, 365 days, owner account's expires_at)`. Until identity phase 2, that means at most 30 days: the key dies with its anonymous owner. The UI says so. |
| Limits       | 10 active keys per account; `name` 2–40 characters, no control characters (reuse the `NoControl` pattern in `server/schemas.ts`).                                  |
| Revocation   | `revoked_at` set; effective on the next request (the in-memory key cache below is cleared for that prefix in the same call).                                       |

### Scopes

| Scope          | Grants                                                                                                                                                        | Default on a new key |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `markets:read` | `GET /data/markets`, `GET /data/markets/{id}`, `GET /data/markets/{id}/trades`, candles for the last 30 days                                                  | yes                  |
| `history:read` | Candles over any range; `GET /data/resolved` (the dataset)                                                                                                    | no                   |
| `trade`        | `POST /quotes`, `POST /trades`, `POST /orders`, `DELETE /orders/{id}` **on public markets only**, acting as the key's owner; never drafts, launches, comments | no                   |

Nothing else accepts a key: no sessions, drafts, launch, resolution, disputes, comments, watchlist, portfolio, notifications, bonus, settings, AI, workspaces or admin. A key is a narrower credential than a session, never a wider one.

### How a request is authenticated

New `server/api-keys.ts`:

```ts
export type ApiScope = "markets:read" | "history:read" | "trade";
export interface KeyPrincipal {
  keyId: string;
  prefix: string;
  accountId: string;
  tier: ApiTier;
  scopes: ApiScope[];
}
/** Undefined when no X-API-Key header; 401 for an unknown, expired or revoked key; 403 when the scope is missing. */
export function keyPrincipal(
  store: Store,
  request: FastifyRequest,
  scope: ApiScope,
): KeyPrincipal | undefined;
/** Cached prefix → principal lookup used by the rate limiter; undefined for anything invalid. */
export function peekKey(
  store: Store,
  header: string | undefined,
): KeyPrincipal | undefined;
```

- **Read routes** live under a new `/api/v1/data/` prefix (registered by `registerDataApi(app, store)` in a new `server/data-routes.ts`). They require a key with the route's scope. The existing anonymous public reads (`GET /markets`, `/markets/:id`, `/history`, `/trades`) stay exactly as they are, unmetered and per-IP limited, so the web app, embeds and existing SDK users are untouched.
- **Trade routes** keep their paths. In `server/app.ts`, the four handlers read `keyPrincipal(store, request, "trade")` first; when a key is present it supplies the account id and **the market must be public** (`store.row(id).workspace_id === null`, otherwise the same 404 as an unknown id); when absent, `accountId(request)` runs as today. A request with both a bearer and a key is rejected with 400 so there is never ambiguity about who acts.
- The OpenAPI document gains an `apiKey` security scheme (`in: header, name: X-API-Key`). The four trade routes list both `bearerAuth` and `apiKey`.

### Tiers and rate limits

Placeholders for the product owner. Credits are never sold: a tier buys software access and data volume only.

| Tier     | Price (placeholder) | Requests / minute | Requests / day | Candle range                   | Dataset rows / day | `trade` writes / day | Keys |
| -------- | ------------------- | ----------------- | -------------- | ------------------------------ | ------------------ | -------------------- | ---- |
| Free     | $0                  | 60                | 10,000         | 30 days (90 with history:read) | 1,000              | 500                  | 3    |
| Builder  | $49 / month         | 300               | 200,000        | full                           | 50,000             | 5,000                | 10   |
| Business | $299 / month        | 1,200             | 2,000,000      | full                           | unlimited          | 20,000               | 10   |

Per-minute limits use the existing plugin, changed in one place in `buildApp`:

```ts
await app.register(rateLimit, {
  max: (request, key) =>
    key.startsWith("key:")
      ? TIER_PER_MINUTE[
          peekKey(store, request.headers["x-api-key"] as string)?.tier ?? "free"
        ]
      : 300,
  timeWindow: "1 minute",
  keyGenerator: (request) => {
    const principal = peekKey(
      store,
      request.headers["x-api-key"] as string | undefined,
    );
    return principal ? `key:${principal.prefix}` : request.ip;
  },
  allowList: (request) => !/^\/(api|embed)\//.test(request.url),
});
```

- **Only valid keys get their own bucket.** An unknown or revoked key falls back to the IP bucket, so rotating garbage keys cannot escape the IP limit.
- `peekKey` caches prefix → principal for 60 s in a `Map` (at most 5,000 entries, oldest evicted). Revocation and tier changes delete the entry. Mark it `// ponytail: per-process cache and per-process limits; move both to a shared store if the API ever runs as several instances.`
- The per-route overrides (`/trades` has none; AI and session routes keep theirs) still apply per key or IP.
- **`trustProxy`.** Add `trustProxy: Number(process.env.TRUST_PROXY_HOPS ?? 0) || false` to the `Fastify({...})` options and set `TRUST_PROXY_HOPS=1` in `render.yaml`. Without it, every anonymous user on the hosted demo shares the proxy's bucket. The desktop and local runs keep the default (no proxy trusted), because a loopback client could otherwise forge `X-Forwarded-For`.

**Daily quotas and metering** (`server/api-keys.ts`): an `onResponse` hook adds 1 to an in-memory counter for `(keyId, UTC day, routeGroup)` where the group is `read`, `history`, `dataset` or `trade`; the dataset route also adds the number of rows returned. Counters are flushed with one `INSERT … ON CONFLICT DO UPDATE SET requests=requests+excluded.requests, rows=rows+excluded.rows` transaction every 10 s and on `onClose`. Quota checks read persisted plus pending counts; over quota returns **429** with `Retry-After` set to the next UTC midnight and a message naming the quota. Mark it `// ponytail: up to 10 s of counts can be lost on a crash; quotas are soft by that margin.` Writing a row per request would put a writer into `BEGIN IMMEDIATE` contention with every trade.

`last_used_at` is updated at flush time, not per request.

## Data products

### Candles (`GET /api/v1/data/markets/{id}/candles?interval=1h|1d&from=&to=`)

New `server/candles.ts`: a pure `bucketCandles(points, interval, from, to, initial)` and a reader that streams the market's trades in `rowid` order through the `trades_market` index.

| Field                    | Rule                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bucket                   | UTC hour (`substr(created_at,1,13)`) or UTC day (`substr(created_at,1,10)`); `t` is the bucket start in ISO form                                                                                  |
| `o`                      | The previous bucket's close, or `initialProbability` for the first bucket (the price before any trade in that bucket, because only trades move an LMSR price; same reasoning as `calibration.ts`) |
| `h`, `l`, `c`            | Max, min and last `probabilityAfter` in the bucket, together with `o`                                                                                                                             |
| `volumeMicros`, `trades` | Sum of `amountMicros` (fees included, like `volume_micros`) and count                                                                                                                             |
| Empty buckets            | Forward-filled flat (`o=h=l=c`, volume 0) between the market's `created_at` and `min(to, resolvedAt, closesAt, now)`, so charts have no gaps                                                      |
| Limits                   | At most 1,000 candles per response; `from`/`to` default to the most recent 1,000 buckets; ranges beyond the tier's window return 403 naming `history:read` or the tier                            |
| Units                    | Probabilities 0–1 for YES, rounded to 4 decimals; NO is `1 − YES` and is not repeated                                                                                                             |

The response also carries `{marketId, interval, status, outcome?}`. Candles for seed markets start at the fixture's `initialProbability` at `created_at` (seed time), which the docs label "illustrative fixture baseline", as `GET /history` already does.

### Resolved-questions dataset (`GET /api/v1/data/resolved?format=json|csv&part=markets|path&after=&limit=`)

New `server/dataset.ts`. One row per public market whose resolution `status` is `resolved`.

| Column                                                             | Source                                                                                                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `question`, `category`, `origin`                             | `definition`; `origin` is `fixture` for seed ids from `server/fixtures.ts`, `community` for launched drafts, `autopilot` for [autopilot](market-autopilot.md) markets |
| `sourceName`, `sourceUrl`, `yesRule`, `noRule`, `invalidRule`      | `definition`                                                                                                                                                          |
| `createdAt`, `closesAt`, `proposedAt`, `resolvedAt`                | `markets.created_at`, `definition`, `resolution`                                                                                                                      |
| `outcome`, `disputed`                                              | `resolution.outcome`; `disputed` is a boolean only (the disputer stays private, as in `Store.market`)                                                                 |
| `ruleCheckRisk`, `ruleCheckWarnings`                               | `definition.ruleCheck` when present                                                                                                                                   |
| `finalProbability`, `probabilityAtClose`, `trades`, `volumeMicros` | Last trade before resolution, last trade before `closesAt`, counts                                                                                                    |
| `path` (JSON) / `part=path` (CSV)                                  | The daily closes from `bucketCandles(…, "1d")`, so a path is at most one row per day: `marketId,day,close,volumeMicros`                                               |

- **Public only, always.** The query has `WHERE m.workspace_id IS NULL` and excludes markets the [operator console](operator-console.md) has hidden (`moderation IS NULL`). There is no parameter that can widen it. No account id, alias, comment or position appears.
- **Pagination** by `(resolvedAt, id)` cursor, `limit` 1–500 (default 100); the response has `next` when more rows exist. CSV uses RFC 4180 quoting with a header row; values starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheet tools do not execute question text as a formula. `Content-Disposition: attachment; filename="peakcast-resolved-<part>.csv"`.
- Every response, JSON and CSV, carries the licence line and `X-Peakcast-Data-Licence` header (below).

### Other read routes (`markets:read`)

`GET /data/markets` (public list, same items as `GET /markets`, plus `after`/`limit` pagination), `GET /data/markets/{id}` and `GET /data/markets/{id}/trades?after=&limit=` (paged through all trades, aliases only, like `Store.marketTrades`). Each calls `marketActor(store, undefined, id)` first.

## Licence and display terms

A new `docs/DATA_TERMS.md` (draft; counsel reviews before any paid tier) and the same summary on the Developers page and in every dataset response:

1. **Labelling.** Every display must say "Peakcast demo-credit forecast" or equivalent next to the number. Probabilities come from play-money trading and are not odds offered by anyone, not investment advice, and not a prediction Peakcast vouches for.
2. **Attribution.** "Data: Peakcast" with a link to the market page (`/markets/{id}`) wherever a probability or candle is shown. The [embed widget](../API.md#embeds-and-oembed) already meets this.
3. **No real-money use.** Licensees may not use the data or API to price, promote or settle any real-money game, wager or contract. India's Promotion and Regulation of Online Gaming Act, 2025 bans real-money online games and their promotion; the terms forbid any use that would make Peakcast a facilitator. Keys of violators are revoked (an audited operator action).
4. **Creator content.** Market questions and rules are written by creators. The site terms must grant Peakcast a licence to redistribute them (product owner and counsel; see decisions). Until then, the dataset is offered under the demo's existing terms and marked "preview".
5. **Proposed dataset licence:** CC BY 4.0 for derived numbers (candles, outcomes, probability paths) and for fixture and autopilot question text Peakcast wrote; creator-written text under the redistribution licence from point 4. Source agencies keep their own terms; the dataset only names and links them.
6. **No personal data** is in the dataset or candles. Aliases appear only in the trades feed, which is the same public feed the web app shows.

## Interaction with real-time streams and webhooks (feature R)

R is being built in another worktree; its exact files are not in this checkout. D publishes two functions R calls once both are merged, and nothing in D depends on R.

| Concern            | Contract                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream auth        | R's SSE endpoint accepts `X-API-Key` (or `?key=` is **not** allowed: query strings land in Render logs) via `keyPrincipal(store, request, "markets:read")`; anonymous public streams stay as R designs them                              |
| Concurrent streams | Per tier: Free 2, Builder 10, Business 50 open connections per key; R counts open connections per `keyId` and closes the oldest above the cap                                                                                            |
| Stream metering    | R calls `meter(keyId, "stream", 1)` per connection-minute; streams count toward the daily request quota at 1 unit per connection-minute                                                                                                  |
| Webhooks           | Subscriptions are owned by a key (`markets:read`), not a session, so revoking the key stops delivery. Each subscription has its own signing secret (R's design); deliveries are metered as `webhook` and do not use the per-minute limit |
| Privacy            | Streams and webhooks for keys carry public markets only; R's private-workspace streams stay session-authenticated and member-only, behind `marketActor`                                                                                  |

## Interaction with the AI arena (later)

When bot accounts arrive, a bot is an account created **by** a person, with `accounts.kind = 'bot'` (new column then, not now) and its own `trade`-scoped key. Bots are labelled on every public surface, ranked on a separate board, never receive the daily bonus or workspace grants, and their key's `trade` quota is the tier's. Nothing in this plan needs changing for that, except the arena plan adding the `kind` column to the `ALTER` loop.

## Isolation and privacy

- `tests/isolation.test.ts`: the `scoped` regex already matches `/data/markets/{id}` paths, so the sweep fails until their rows are added to `cases`. Add `"GET /api/v1/data/markets/{id}"`, `".../trades"` and `".../candles"` with an `x-api-key` header holding a valid **outsider-owned** key with all scopes. The sweep merges the case's headers into both callers, so the "outsider" (bearer plus key) and "anonymous" (key only) calls both reach the data route with a valid key; data routes ignore the bearer. Both must return a 404 identical to the unknown-id baseline. `tests/api-keys.test.ts` separately asserts that the same calls without a key give an identical 401 for hidden and unknown ids.
- Leak scan: add `/data/markets`, `/data/resolved?format=json`, `/data/resolved?format=csv&part=markets` and `part=path` (with the outsider's key) to the `reads` list. The private world already has three **resolved** private markets, so this proves the dataset filter.
- Trade with a key on a private market, by a key whose owner **is** a member: 404 (keys never act through wallets).
- Keys cannot authenticate as a session: a key sent as `Authorization: Bearer wk_…` gets 401 on `/portfolio`; a session token sent as `X-API-Key` gets 401 on `/data/markets`.

## Types and client (contract, landed by workstream A on day 1)

```ts
// shared/types.ts
export type ApiScope = "markets:read" | "history:read" | "trade";
export type ApiTier = "free" | "builder" | "business";
export interface ApiKey { id: string; prefix: string; name: string; scopes: ApiScope[]; tier: ApiTier; createdAt: string; expiresAt: string; lastUsedAt: string | null; revoked: boolean }
export interface CreatedApiKey extends ApiKey { secret: string } // returned once
export interface ApiUsageDay { day: string; requests: number; rows: number; byGroup: Record<string, number> }
export interface Candle { t: string; o: number; h: number; l: number; c: number; volumeMicros: number; trades: number }
export interface Candles { marketId: string; interval: "1h" | "1d"; status: MarketStatus; outcome?: ResolutionOutcome; items: Candle[] }
export interface ResolvedQuestion { id: string; question: string; category: Category; origin: "fixture" | "community" | "autopilot"; sourceName: string; sourceUrl: string; yesRule: string; noRule: string; invalidRule: string; createdAt: string; closesAt: string; proposedAt: string; resolvedAt: string; outcome: ResolutionOutcome; disputed: boolean; ruleCheckRisk: number | null; ruleCheckWarnings: string[]; finalProbability: number; probabilityAtClose: number; trades: number; volumeMicros: number; path: { day: string; close: number; volumeMicros: number }[] }
// Capabilities += dataApi: boolean   (false when localOnly, i.e. the Windows app)

// shared/client.ts — PeakcastClient gains an optional third constructor argument { apiKey?: string } sent as X-API-Key
apiKeys(): Promise<{ items: ApiKey[] }>;
createApiKey(input: { name: string; scopes: ApiScope[]; expiresInDays?: number }): Promise<CreatedApiKey>;
revokeApiKey(id: string): Promise<{ revoked: true }>;
apiKeyUsage(id: string, days?: number): Promise<{ items: ApiUsageDay[] }>;
candles(marketId: string, interval: "1h" | "1d", range?: { from?: string; to?: string }): Promise<Candles>;
resolvedQuestions(after?: string, limit?: number): Promise<{ items: ResolvedQuestion[]; next?: string }>;
```

Key management routes (bearer session, person accounts only; never usable with a key): `GET /api/v1/keys`, `POST /api/v1/keys` (201, secret once; 409 at the tier's key cap), `DELETE /api/v1/keys/:id` (idempotent, 404 for someone else's key), `GET /api/v1/keys/:id/usage?days=30`. Create is rate limited to 10/minute.

## UI

- New `src/pages/ApiKeys.tsx`, rendered as a section of `src/pages/Developers.tsx` (keeps `Developers.tsx` small). List with prefix, name, scopes, tier, expiry and last use; create form (name, scope checkboxes with `markets:read` pre-checked, expiry); the secret is shown once with Copy and a "you will not see this again" note; revoke with confirmation; a 30-day usage bar chart per key (plain SVG bars, no chart library, same approach as the embed sparkline).
- The existing "Copy demo API token" stays, relabelled "Copy session token (expires with this demo account)".
- A "Data terms" block summarises the licence points and links to `docs/DATA_TERMS.md` on GitHub.
- Upgrade: no checkout. "Request Builder or Business" opens a `mailto:` to the operator address the product owner chooses; an operator sets the tier in the console.
- Hidden when `capabilities.dataApi` is false (the Windows app, which is `localOnly`).

## Tests

| File (new **bold**)              | Cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`tests/api-keys.test.ts`**     | Create returns the secret once; list never contains it; only the hash is stored. Unknown, malformed, expired and revoked keys give 401 with one message; missing scope 403. Keys are refused on drafts, launch, comments, portfolio, AI, workspaces and settings routes (401 as if anonymous). Bearer plus key → 400. Key cap 409. Expiry is clamped to the owner's `expires_at`. `trade` scope buys and sells on a public market as the owner (balance moves on the owner's portfolio). Per-key limit: with `rateLimiting: true` and a Free key, request 61 in a minute is 429 while a second key and an anonymous IP are unaffected; garbage keys share the IP bucket. Daily quota: counters flush, request over quota is 429 with `Retry-After` at UTC midnight. Revocation takes effect on the next request despite the cache. `trustProxy`: with `TRUST_PROXY_HOPS=1`, two `X-Forwarded-For` values get separate IP buckets; with it unset they share one. |
| **`tests/candles.test.ts`**      | `bucketCandles` on hand-built points: open equals previous close; first open is the initial probability; high/low include the open; forward fill; hour and day boundaries in UTC; 1,000-candle cap; resolved markets stop at `resolvedAt`. Through the API: tier window enforcement (Free beyond 30 days → 403), a seed market and a launched market. Property test: 300 random trade sequences, `l ≤ o,c ≤ h` and `c` equals the last `probabilityAfter`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **`tests/dataset.test.ts`**      | A full lifecycle (launch, trades, propose, settle; and a disputed market ruled by the operator) appears with the right outcome, timestamps, `disputed`, path and final probability. INVALID markets included. Open, proposed and disputed markets excluded. CSV: header, quoting of commas, quotes and newlines, formula-prefix neutralised, path part long-format. Cursor pagination returns every row exactly once. Row metering counts rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/isolation.test.ts`        | New `cases` rows and leak-scan reads (above); keys never act through wallets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/client.test.ts`           | New methods send method, path, body and `X-API-Key`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`tests/e2e/api-keys.spec.ts`** | Create a key on the Developers page, copy it, call `/api/v1/data/markets` with it from the test (status 200), revoke it, call again (401). Secret is not visible after reload. axe on the section, phone viewport without overflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Coverage: `server/api-keys.ts`, `server/candles.ts` and `server/dataset.ts` each meet the 80% gate on their own.

## Workstreams

No file appears in two workstreams. A owns the contract, every edited existing server file and the server docs; B owns two new pure-ish modules; C owns the UI.

| Workstream                            | Files (new **bold**)                                                                                                                                                                                                                                                                       | Days | Acceptance                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A: keys, limits, metering, routes** | **`server/api-keys.ts`**, **`server/data-routes.ts`**, `server/app.ts`, `server/database.ts`, `server/schemas.ts`, `shared/types.ts`, `shared/client.ts`, `render.yaml`, **`tests/api-keys.test.ts`**, `tests/isolation.test.ts`, `tests/client.test.ts`, `docs/API.md`, `docs/BACKEND.md` | 5    | Criteria 1, 2, 3, 6 below; day 1 lands the contract (types, client, schemas, route stubs returning 501, and the `candles()`/`resolvedDataset()` signatures B fills) |
| **B: candles and dataset**            | **`server/candles.ts`**, **`server/dataset.ts`**, **`tests/candles.test.ts`**, **`tests/dataset.test.ts`**, **`docs/DATA_TERMS.md`**                                                                                                                                                       | 3    | Criteria 4, 5; pure functions with no Fastify import; A's routes call them unchanged                                                                                |
| **C: Developers page**                | **`src/pages/ApiKeys.tsx`**, `src/pages/Developers.tsx`, `src/styles.css`, **`tests/e2e/api-keys.spec.ts`**, `README.md`                                                                                                                                                                   | 3    | Criterion 7                                                                                                                                                         |

Sequence: day 1 contract (A) → B and C in parallel → day 4 A's routes real → day 5–6 integration, `npm run verify`. A reviews B and C; B reviews A's isolation changes.

Merge notes: `server/app.ts`, `server/database.ts`, `server/schemas.ts`, `shared/*`, `tests/isolation.test.ts` and `docs/API.md` are also edited by the [operator console](operator-console.md) and by R. Merge order: R, then this plan, then the console; each rebases on the previous. The console's `moderation` column is referenced by B's dataset query, so until the console lands B filters on `workspace_id IS NULL` only and leaves a `// TODO(console)` that the console's workstream A removes.

## Acceptance criteria

1. Keys are stored hashed, shown once, revocable with immediate effect, expire no later than their owner, and are refused by every route that does not declare a scope.
2. A key never reaches a private market or acts through a wallet; the isolation sweep and leak scan cover every new route and pass.
3. Per-minute limits apply per valid key at its tier and per IP otherwise; `trustProxy` is configured for Render; daily quotas return 429 with `Retry-After`.
4. Candles match the trade history exactly (property test), have no gaps, and respect tier windows.
5. The dataset contains every resolved public market and nothing else, in JSON and CSV, with the licence line, safe CSV quoting and a stable cursor.
6. Existing routes, the web app and existing tests behave exactly as before; `npm run verify` passes with the coverage gate.
7. The Developers page creates, shows once, lists, meters and revokes keys accessibly on desktop and phone, and is hidden in the Windows app.

## Effort

About 11 dev-days: A 5, B 3, C 3, plus a shared integration half-day. Add 1 day if R has already changed the rate-limit registration.

## Risks

| Risk                                                                      | Mitigation                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Charging for a key whose owner vanishes after 30 days or a Render restart | No paid tiers before identity phases 1 and 2; keys labelled "preview"                                               |
| A real-money operator uses the feed to price wagers                       | Terms point 3, revocation, and the operator console's audited tier and revoke actions                               |
| Per-process limits and counters if the API is ever scaled out             | One instance is already required by SQLite and the disk (identity plan); `ponytail:` comments name the upgrade path |
| Dataset republishes creator text without a licence                        | Owner decision 4 before the dataset leaves "preview"                                                                |

## Product owner decisions

1. Tier prices, limits and whether Free includes `trade` (proposal: yes, 500 writes a day).
2. Billing: manual invoicing with operator-set tiers for v1 (recommended), or a payment provider later (Razorpay or Stripe; GST registration and invoices are an accounting decision).
3. The dataset licence (proposal: CC BY 4.0 for derived numbers and Peakcast-written text).
4. A creator content licence in the site terms so creator-written questions can be redistributed.
5. Whether to keep the "no real-money use" clause as a hard licence condition (recommended) and who reviews it (counsel, with the 2025 gaming law).
6. The contact address shown for tier upgrades.

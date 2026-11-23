# API integration reference

Base URL: `http://127.0.0.1:3001/api/v1` for the web development backend; desktop uses port 43127 and its own local data. API version: `v1`; implementation version: `0.1.0`.

The authoritative schemas are [OpenAPI JSON](http://127.0.0.1:3001/api/v1/openapi.json) and [Swagger UI](http://127.0.0.1:3001/api-docs/). `npm run test:api` exports a checked schema to `output/openapi.json`. There is no hosted public API deployment yet.

## Authentication and units

`POST /sessions` returns `{token, expiresAt, balanceMicros}` with 10,000 demo credits. Send `Authorization: Bearer <token>` for portfolio, trades and drafts. Never use an account ID instead of a credential. The token expires after 30 days; no revocation endpoint or production identity is implemented.

1 credit = **1,000,000 microcredits**. A winning share would pay 1 credit in the intended settlement model; this demo has no resolution/redemption implementation. Probabilities are fractions from 0 to 1. Trade share quantities are integers from 1 to 10,000.

## Routes

| Method       | Relative path                | Access                       | Success and behavior                                                                                                            |
| ------------ | ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| POST         | `/sessions`                  | Public                       | 201; new isolated demo account                                                                                                  |
| GET          | `/capabilities`              | Public                       | 200; demo mode, public market count, `aiConfigured`, `aiProviders`, `defaultAIProvider`, `shareOrigin`, `teams`                 |
| GET          | `/oembed?url=&maxwidth=`     | Public                       | 200; oEmbed 1.0 `rich` JSON with an `<iframe>` widget; 400 not this server's market link, 404 unknown market                    |
| GET          | `/markets?search=&category=` | Public                       | 200; `{items}`; search max 200 chars, category max 50                                                                           |
| GET          | `/markets/:id`               | Public                       | 200; full definition, probabilities, `change24h` and demo statistics                                                            |
| GET          | `/markets/:id/history`       | Public                       | 200; fixture baseline plus last 99 observed demo fills                                                                          |
| POST         | `/markets/{id}/explain`      | Bearer + `X-AI-Access-Token` | 200; AI explainer of the price, cached 30 minutes; 404 unknown market, 502 provider failure, 503 unconfigured                   |
| POST         | `/quotes`                    | Public                       | 200; executable estimate, not a reservation                                                                                     |
| POST         | `/markets/{id}/resolution`   | Bearer (creator)             | 201; body `{outcome, evidenceUrl}`; halts trading, opens challenge window; 403 not creator, 409 already proposed                |
| POST         | `/markets/{id}/dispute`      | Bearer (not creator)         | 201; posts 100-credit bond; 409 outside challenge window or already disputed                                                    |
| POST         | `/markets/{id}/settle`       | Bearer                       | 200; pays out an undisputed proposal after the window; 409 too early or disputed                                                |
| POST         | `/markets/{id}/ruling`       | `X-Operator-Token`           | 200; body `{outcome}`; final ruling for disputed or house markets; 503 when unconfigured                                        |
| GET          | `/markets/{id}/trades`       | None                         | 200; last 30 trades, newest first; traders shown under an alias, never an account id                                            |
| GET          | `/leaderboard`               | Optional Bearer              | 200; top 20 traders by profit, creators by fees and `forecasters` by Brier score; viewer's own rows flagged `you`               |
| GET          | `/portfolio/calibration`     | Bearer                       | 200; own `{resolvedMarkets, brier, skill?, buckets}`; `brier` null until a traded market resolves YES or NO                     |
| POST         | `/orders`                    | Bearer                       | 201; body `{marketId, outcome, action, shares, limitPrice}`; limit order, may fill at once; 409 closed market or 20 open orders |
| DELETE       | `/orders/{id}`               | Bearer                       | 200; cancels an own open order; 404 otherwise                                                                                   |
| GET          | `/markets/{id}/comments`     | Optional Bearer              | 200; last 50 comments, newest first, alias plus side held                                                                       |
| POST         | `/markets/{id}/comments`     | Bearer                       | 201; body `{body}` (1–500 chars); 429 within 5 seconds of the last comment                                                      |
| PUT / DELETE | `/watchlist/{id}`            | Bearer                       | 200 `{watching}`; idempotent                                                                                                    |
| POST         | `/trades`                    | Bearer + idempotency header  | 201; atomic execution or original matching retry result                                                                         |
| GET          | `/portfolio`                 | Bearer                       | 200; balance, mark value, positions, last 100 trades, `bonus` status and performance `stats`                                    |
| GET          | `/notifications`             | Bearer                       | 200; `{items, unread}`; own last 50 notifications, newest first                                                                 |
| POST         | `/notifications/read`        | Bearer                       | 200 `{unread: 0}`; marks every own notification read; no body or `{}`, any field is 400                                         |
| POST         | `/bonus/claim`               | Bearer                       | 200; daily credit bonus, once per UTC day; 409 when already claimed today; no body or `{}`, any field is 400                    |
| GET          | `/drafts`                    | Bearer                       | 200; own last 50 private drafts                                                                                                 |
| POST         | `/drafts`                    | Bearer                       | 201; manual draft, private until launched                                                                                       |
| POST         | `/drafts/{id}/launch`        | Bearer                       | 201; body `{category, workspaceId?}`; stakes 500 credits; 404 unknown draft or workspace, 409 expired deadline or low balance   |
| DELETE       | `/drafts/{id}`               | Bearer                       | 200; deletes own draft, 404 otherwise                                                                                           |
| POST         | `/drafts/generate`           | Bearer + `X-AI-Access-Token` | 201; optional private AI-refined draft                                                                                          |
| POST         | `/drafts/critique`           | Bearer + `X-AI-Access-Token` | 200; advisory AI critique of a draft body, nothing saved; 502 invalid output, 503 unconfigured                                  |

## Embeds and oEmbed

`GET /embed/markets/{id}?theme=light|dark|auto` (outside `/api/v1`) returns a self-contained, read-only HTML widget: question, YES probability, 24-hour change, sparkline of the fixture baseline plus recent fills, deadline, status and a "Forecast on Wildcatter" link that opens the market in a new tab. `theme` defaults to `auto` (`prefers-color-scheme`); other values return 400. An unknown market returns a small HTML 404 page. The widget is sized for 360×200 up to about 600 wide.

- **Framing:** only `/embed/*` sends `frame-ancestors *` and omits `X-Frame-Options`. The data is public, there is no session, cookie or state-changing control to clickjack, so any publisher may frame it. Every other route keeps `frame-ancestors 'none'`.
- **CSP on the widget:** `default-src 'none'`, no script at all, and one static stylesheet allowed by its SHA-256 hash. All market text is HTML-escaped.
- **Caching and limits:** `Cache-Control: public, max-age=30`; the per-IP rate limit applies as on `/api/`.

`GET /api/v1/oembed?url={market link}` accepts only this server's own `/markets/{id}` (or `/markets/{id}/rules`) links, with optional `maxwidth`, `maxheight` (1–9999) and `format=json`. It returns `{version: "1.0", type: "rich", provider_name: "Wildcatter", provider_url, title, html, width, height}`; the iframe is 480×200 unless the maxima are smaller, uses `loading="lazy"`, and is sandboxed to allow only popups. The SDK method is `api.oembed(url, maxwidth?, maxheight?)`.

Market pages (`/markets/{id}`) include Open Graph and Twitter card tags and an oEmbed discovery link, so shared links unfurl. `shareOrigin` in `/capabilities` is the origin used for share links: the configured `PUBLIC_ORIGIN` on the hosted service, the loopback origin in local development, and `null` in the Windows app, whose server nobody else can reach.

## SDK example

After `npm run build`, run this as an ES module from the repository root. The UI imports the same client from `shared/client.ts`.

```javascript
import { randomUUID } from "node:crypto";
import { WildcatterClient } from "./dist-server/shared/client.js";

const publicApi = new WildcatterClient("http://127.0.0.1:3001");
const { token } = await publicApi.createSession();
const api = new WildcatterClient("http://127.0.0.1:3001", token);
const order = {
  marketId: "fed-rate",
  outcome: "YES",
  action: "buy",
  shares: 10,
};
const quote = await api.quote(order);
const request = { ...order, limitMicros: quote.amountMicros };
const key = randomUUID();
const fill = await api.trade(request, key);
// Retry this exact request/key after an interrupted response; do not generate a new key.
console.log(fill.id, (await api.portfolio()).balanceMicros);
```

Raw HTTP quote/execution payloads use the same fields. The execution adds `limitMicros` and requires `Idempotency-Key` (8–128 alphanumeric/underscore/hyphen characters). For BUY it is maximum spend; for SELL it is minimum proceeds. A changed price beyond this limit returns 409. The backend checks current balances/holdings at execution, not when a quote is requested.

## Draft request

Required fields: `question`, `sourceName`, `sourceUrl`, `closesAt`, `yesRule`, `noRule`, `invalidRule`. Use a future ISO date-time with timezone and a valid HTTPS source URL without embedded credentials. Boundaries: question 12–240 chars; source name 2–120; source URL max 1,000; rules 15–2,000 each. Extra fields are rejected. Passing the schema is not proof that the event is unambiguous.

Manual drafts are always available. AI refinement accepts `?provider=gemini`, `?provider=groq` or `?provider=openai` or `?provider=ollama`. Omission uses the configured default. Unknown providers/extra query fields return 400, and an explicitly unconfigured provider returns 503. The SDK accepts an optional third argument: `api.generateDraft(input, workspaceAccessToken, "groq")`.

Set the selected provider's server API key (`GEMINI_API_KEY`, `GROQ_API_KEY`, or `OPENAI_API_KEY`), optional model overrides, and a workspace `AI_ACCESS_TOKEN` of 16–256 characters. Send that workspace secret in `X-AI-Access-Token`, alongside account bearer authentication. Never send provider keys from the browser. Capabilities expose configuration metadata only, never credentials. The saved draft's `mode` records `gemini`, `groq`, `openai`, or `manual`; existing OpenAI drafts remain compatible.

Each request uses exactly one provider, with no automatic retry or fallback. Sources are not fetched or verified; nothing is published automatically, and launching a draft is a separate explicit step. Responses are validated against the complete draft schema and protected source/deadline fields before persistence. Provider errors and timeouts return sanitized 502 errors without raw provider payloads. Calls can incur charges; ordinary tests mock providers and never load project `.env` credentials.

## Errors and retry rules

All application errors return JSON `{ "message": "..." }`.

| Status | Meaning                                                  | Caller action                                                         |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------- |
| 400    | Invalid fields, types, ranges or manual draft            | Correct the request                                                   |
| 401    | Missing, invalid or expired bearer credential            | Authenticate/create a demo account                                    |
| 403    | Host/origin, AI access or workspace role restriction     | Correct access/configuration; do not bypass the restriction           |
| 404    | Unknown market or API resource, or not a member of it    | Correct the ID/path                                                   |
| 409    | Price, balance, holdings, key/input or state conflict    | Requote/review holdings; keep key/input together on uncertain retries |
| 409    | Launch refused by a blocking rule check                  | Fix the named checks and save a new draft                             |
| 413    | Body larger than 16 KiB                                  | Reduce request size                                                   |
| 429    | Rate limit                                               | Respect `Retry-After`                                                 |
| 500    | Unexpected application failure                           | Investigate server; do not blindly create another trade               |
| 502    | Incomplete/refused/invalid AI output or provider failure | Original draft stays unchanged; retry deliberately                    |
| 503    | AI not configured                                        | Use manual save or configure the server                               |

The SDK preserves HTTP failure status even when a gateway sends an unreadable HTML response. In an uncertain trade failure, retry the original input with its original key to avoid executing a second order.

## Limits and labels

Read APIs currently return bounded fixture/history lists, not cursor pagination. Quotes are public; account data requires bearer auth. API data is never served from the PWA cache. No CORS permission is granted for arbitrary browser origins; server-side tools can call the loopback API. The web server optionally accepts one exact HTTPS tunnel origin via `PUBLIC_ORIGIN` for a temporary same-origin phone preview. Production hosting, scoped production credentials, streams, signed webhooks and real-money integrations are planned, not hidden endpoints.

## Provider management

- `PUT /api/v1/settings/providers/:provider`: authenticated account plus `X-AI-Access-Token`; body `{model, apiKey?}`. Omit a key to retain an existing key. Ollama needs no key. Provider IDs are a fixed whitelist; arbitrary upstream URLs are not accepted.
- `DELETE /api/v1/settings/providers/:provider`: same authorization, disables the provider and removes its active saved key.
- `GET /api/v1/settings/ollama`: same authorization; returns local daemon availability and installed model names. It never downloads models or contacts an arbitrary URL.

Management responses contain configuration metadata only, never keys. Overrides persist locally across restarts. Native Windows can report `aiAccessManaged: true`; its main process adds workspace authorization only to its own renderer's requests to its own loopback origin. This flag does not bypass backend authorization for external clients.

`/downloads/Wildcatter-Windows.zip` and `/downloads/Wildcatter-Android.apk` are public demo artifacts; unknown filenames return 404. They contain no configured provider keys or workspace secret.

## Creator markets

`POST /drafts/{id}/launch` turns one of your saved drafts into a live market. The creator stakes 500 demo credits, which funds the market's liquidity: an LMSR pool opened at 50% can lose at most `liquidity × ln 2`, so the stake covers the pool's worst case. The draft is consumed and the market opens for everyone.

### Rule check at launch

Launch runs the same deterministic linter the Draft studio shows (`lintDraft` in `shared/lint.ts`). It is text and URL structure only: the server never fetches, resolves or pings the source URL. After the expired-deadline check, any `block` finding returns **409** and changes nothing (the draft stays, no stake is taken), for example `Fix 2 blocking rule problems before launch: rules-identical, url-shortener.` Blocking checks: `comparator-without-number`, `rules-identical`, `subjective-judge`, `url-shortener`, `url-not-public-host` (IP, `localhost`, single-label, `.local`, `.internal`, `.lan`, `.home.arpa`) and `closes-too-soon` (under one hour).

Warnings never fail the API launch and need no flag; the studio asks the creator to acknowledge them. The launched market carries `ruleCheck: {risk, warnings}` (risk 0–100, distinct warning ids), which the market's rules view shows. Seed markets and markets launched before the linter have no `ruleCheck`. Saving a draft is unaffected, so private drafts may hold findings. Whether the source actually shows the figure is a human check: the studio links the source (Copy link on Windows, which only opens launched markets' links) and asks the creator to confirm they opened it. That is a nudge, not a control.

### AI critique

`POST /drafts/critique?provider=` takes a draft body (`DraftSchema`) with the same bearer, `X-AI-Access-Token`, provider selection and 3-per-minute limit as `/drafts/generate`, and returns `{provider, summary, findings}`. Each finding is `{field, severity, message, suggestion, quote}`, with severity `warn` or `info` only, at most 8 findings and a summary of at most 400 characters. A finding whose `quote` is not found (case-insensitive) in the field it names is dropped. Malformed, refused or oversized output returns 502. The critique is advisory: it is not saved, cannot block or launch, and the model is told the draft is untrusted data and that the source was not opened. The SDK method is `api.critiqueDraft(input, workspaceAccessToken, provider?)`.

Every trade on a launched market pays the creator a 1% fee (`feeBps: 100` on the market; house markets have `feeBps: 0`). The fee is added to a buy and withheld from a sell. `amountMicros` in quotes and fills is always the total the trader pays or receives, fee included, and `feeMicros` shows the fee portion, so `limitMicros: quote.amountMicros` stays correct. `GET /portfolio` lists launched markets under `created` with `feesMicros` earned.

### Market explainer

`POST /markets/{id}/explain?provider=` takes no body and uses the same bearer, `X-AI-Access-Token` and provider selection as `/drafts/critique`, limited to 5 requests per minute. It returns `{provider, generatedAt, probability, summary, drivers, wouldMoveUp, wouldMoveDown, baseRateNote, caveats}`: summary up to 400 characters, at most 5 drivers and 3 items in each other list (each up to 200 characters), and a base-rate note up to 300 characters that may be empty. Output outside these limits returns 502, as does any provider failure; the message never includes provider details. The model receives only the market's own text fields (not its source URL) and its current numbers, sent as JSON and marked as untrusted data whose instructions must be ignored; the server fetches nothing. Answers are cached in memory per market, provider and status for 30 minutes, or until the YES probability moves more than 5 points from `probability`. The result is advisory and not financial advice; treat every string as plain text. The SDK method is `api.explainMarket(id, workspaceAccessToken, provider?)`. The plain-language facts on the market page come from `explainFacts` in `shared/explain.ts` and need no AI.

## Resolution and payouts

A market moves through `open` → `proposed` → `resolved`, with `disputed` in between when challenged. `closed` means the deadline passed with no proposal yet.

1. **Propose.** The creator posts `{outcome: "YES" | "NO" | "INVALID", evidenceUrl}` to `/markets/{id}/resolution`, at any time (events can resolve before the deadline). Trading halts immediately. The market gains a `resolution` object with `challengeEndsAt`.
2. **Challenge window.** Until `challengeEndsAt`, any account except the creator may post `/markets/{id}/dispute`, which holds a 100-credit bond. The window is `DISPUTE_WINDOW_SECONDS` (default 120, sized for demos).
3. **Settle.** If nobody disputed, any signed-in account may post `/markets/{id}/settle` after the window. Settlement is one transaction. The server also sweeps every 15 seconds and settles undisputed proposals past their window, so payouts never wait on a click.
4. **Ruling.** A disputed market waits for `/markets/{id}/ruling` with the server's `OPERATOR_TOKEN` (16–256 characters) in `X-Operator-Token`. The same endpoint resolves house markets, which have no creator. Without `OPERATOR_TOKEN` it returns 503.

Payouts: each winning share pays 1 credit; `INVALID` pays 0.5 credit per share on both sides; losing shares pay nothing. Positions are closed.

Creator settlement: the creator receives `stake + net trader payments − payouts`, the liquidity the pool did not need. The LMSR bound guarantees this is never negative, so every payout is fully funded and community markets only move credits between accounts. The only credits that enter after the 10,000-credit starting grant are opt-in daily bonuses (see below).

Dispute outcome: if the ruling matches the proposal, the bond goes to the creator. If it overturns the proposal, the disputer gets the bond back plus up to 100 credits taken from the creator's returned liquidity.

Every movement of credits (trades, creator fees, stakes, payouts, bonds, daily bonuses) is written to a per-account ledger with the resulting balance. `GET /portfolio` returns the last 100 entries under `ledger`, newest first; `amountMicros` is signed.

Not covered: the operator's ruling is a trusted human decision, evidence links are not fetched or verified, and there is no appeal after a ruling.

## Limit orders

`POST /orders` rests an order until the pool price satisfies it. `limitPrice` is the average price per share (0.01–0.99, creator fee included): the most a buy will pay, the least a sell will accept. After every trade the server re-checks resting orders on that market, oldest first, and fills each one in full against the AMM; a fill moves the price, so the scan repeats until nothing else qualifies.

Credits and shares are not reserved. If the account cannot cover the order when the price arrives, the order is cancelled with a `note`. Resolution cancels whatever is still open. `GET /portfolio` returns `orders` (open first, then recent) and `watchlist` (market ids).

Not covered: partial fills, order expiry times, and a visible order book.

## Notifications

`GET /notifications` returns `{items, unread}`: the account's last 50 notifications, newest first, each `{id, kind, marketId?, text, createdAt, read}`, plus the count of all unread ones. `POST /notifications/read` marks everything read and returns `{unread: 0}`. `text` is short plain text ready to display; other traders appear only by alias.

| `kind`             | Sent to                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `order_filled`     | The owner, when a limit order fills                               |
| `order_cancelled`  | The owner, when the server cancels an order (never on own cancel) |
| `outcome_proposed` | Every account holding shares, except the proposer                 |
| `dispute_filed`    | The market's creator                                              |
| `payout`           | Each account paid at resolution, once per market                  |
| `market_resolved`  | The creator and every account holding shares at resolution        |
| `comment`          | The market's creator, when someone else comments                  |

Not covered: push delivery, per-item read, and deletion. Notifications are polled.

## Daily bonus

`POST /bonus/claim` credits the account once per UTC day: 50 credits plus 10 for each consecutive previous day claimed, capped at 100 (day 1: 50, day 2: 60, … day 6 onward: 100). Missing a day resets the streak. A second claim on the same UTC day returns 409. The response is `{amountMicros, balanceMicros, bonus}`; the ledger entry has kind `daily_bonus` and no `marketId`.

`GET /portfolio` includes `bonus: {available, streak, nextAmountMicros}`. `streak` counts consecutive claimed days ending today (once claimed) or yesterday; `nextAmountMicros` is what the next claim pays.

## Price change and account stats

Every market carries `change24h`: the current YES probability minus the YES probability 24 hours ago, taken from the last trade at or before that moment. If no trade is that old, the baseline is `initialProbability`; a market with no trades reports 0.

## Accuracy (Brier score)

Profit rewards being rich; accuracy rewards good probability judgement. Only markets resolved YES or NO count: INVALID, open, closed, proposed and disputed markets are excluded. Outcome is 1 for YES and 0 for NO.

- **Forecast per market.** The size-weighted mean of `probabilityAfter` (the YES probability each own trade left behind), weighted by the credits the trade moved (`amountMicros`, fees included).
- **Brier.** `(forecast − outcome)²` per market, then the mean over the account's resolved markets, so one heavily traded market does not dominate. 0 is perfect; always saying 50% scores 0.25.
- **Skill.** The same score computed from the price just before each of those trades (the crowd), minus `brier`. Positive means the account moved prices toward the truth. The pre-trade price is the previous trade's `probabilityAfter` in that market, or `initialProbability` for its first trade; only trades move an LMSR price, so this is exact.
- **Buckets.** Ten 0.1-wide buckets over the per-market forecasts (`from` inclusive; a forecast of 1 is in the last), each `{from, to, count, meanForecast, observedRate}`; empty buckets report `null` for both rates.

`GET /portfolio/calibration` returns `{resolvedMarkets, brier, skill?, buckets}` for the bearer's own account; `brier` is `null` and `skill` is absent until a traded market resolves. `GET /leaderboard` adds `forecasters`: `{rank, trader, you, resolvedMarkets, brier}` for accounts with at least 3 resolved markets, lowest Brier first (more resolved markets breaks ties), top 20 plus the viewer's own qualifying row. Forecasters appear under an alias, never an account id.

Limit-order fills count like any other trade, and a sell counts with the price it left behind. Scores are recomputed from trade history on each request rather than stored.

`GET /portfolio` includes `stats`: `tradeCount` and `volumeMicros` (total paid and received across own trades, fees included), `resolvedMarkets` (resolved markets the account traded in), `wins` (those where it received a payout, including INVALID refunds), `winRate` (`wins / resolvedMarkets`, 0 when none), `creatorFeesMicros` and `payoutsMicros` (both from the ledger).

## Teams (workspaces)

A workspace is a private group with its own markets, credits and leaderboard. `capabilities.teams` is `false` in the Windows app, where these routes do not exist. Every route below needs a bearer token.

Each membership gets a **wallet**: a separate balance of 10,000 workspace credits, created when you create or join the workspace. Trades, orders, comments, watchlist entries, disputes and stakes on a private market use the wallet, never your own balance; your `GET /portfolio` never shows wallet activity, and wallet credits cannot leave the workspace. There is no daily bonus in a workspace.

| Method | Relative path                                 | Who                    | Success                                                                        | Errors                                                        |
| ------ | --------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| POST   | `/workspaces`                                 | Anyone                 | 201 `Workspace`; body `{name, displayName}`; you are the owner                 | 409 you already own 5                                         |
| GET    | `/workspaces`                                 | Anyone                 | 200 `{items: Workspace[]}`, your active memberships                            |                                                               |
| GET    | `/workspaces/{wid}`                           | Member                 | 200 `Workspace` plus `members[]` (`{id, displayName, role, joinedAt, you}`)    | 404                                                           |
| PATCH  | `/workspaces/{wid}`                           | Owner                  | 200 `Workspace`; body `{name}`                                                 | 403, 404                                                      |
| POST   | `/workspaces/{wid}/invites`                   | Owner, admin           | 201 invite plus `token` (shown once); body `{role, expiresInHours?, maxUses?}` | 403, 404, 409 at 20 usable invites                            |
| GET    | `/workspaces/{wid}/invites`                   | Owner, admin           | 200 `{items}`: the 50 newest invites, never tokens                             | 403, 404                                                      |
| DELETE | `/workspaces/{wid}/invites/{inviteId}`        | Owner, admin           | 200 `{revoked: true}`; idempotent                                              | 403, 404                                                      |
| POST   | `/workspaces/invites/preview`                 | Anyone                 | 200 `{workspaceName, role, expiresAt}`; body `{token}`                         | 404 unknown, expired, revoked or used-up (one message)        |
| POST   | `/workspaces/join`                            | Anyone                 | 201 `Workspace`; body `{token, displayName}`                                   | 404 as preview; 409 name taken, already a member, 200 members |
| PATCH  | `/workspaces/{wid}/members/{memberId}`        | Owner, admin           | 200 member; body `{role}`                                                      | 403 outside the role rules, 404                               |
| DELETE | `/workspaces/{wid}/members/{memberId}`        | See role rules         | 200 `{removed: true}`; your own member id leaves                               | 403, 404, 409 the owner leaving                               |
| GET    | `/workspaces/{wid}/markets?search=&category=` | Member                 | 200 `{items: Market[]}`, private markets only                                  | 404                                                           |
| GET    | `/workspaces/{wid}/portfolio`                 | Member                 | 200 your wallet, same shape as `/portfolio`                                    | 404                                                           |
| GET    | `/workspaces/{wid}/leaderboard`               | Member                 | 200 same shape as `/leaderboard`, this workspace only, display names           | 404                                                           |
| POST   | `/workspaces/{wid}/markets/{id}/ruling`       | Owner, admin, resolver | 200 `Market`; body `{outcome}`                                                 | 403 members, 404, 409 conflict of interest or not rulable     |

`Workspace` is `{id, name, role, memberCount, createdAt}`, where `role` is your own (`owner`, `admin`, `resolver` or `member`) and `memberCount` counts active members. Names and display names are trimmed and must keep 2–60 and 2–40 characters without control characters; display names are unique per workspace, ignoring case. Invites default to 168 hours (1–720) and 25 uses (1–500), and grant `member` or `resolver`.

**Roles.** Every member can see private markets, trade, place orders, comment, watch, launch a market (the wallet stakes 500 credits) and dispute (100-credit bond from the wallet). The creator proposes as on public markets. The owner may change any other member's role; making someone `owner` transfers ownership and turns the old owner into an admin in the same step. Admins may move other members between `member` and `resolver`. Nobody changes their own role. The owner removes anyone else, admins remove members and resolvers, and anyone except the owner may leave; the owner must transfer ownership first (409). Removing a member cancels their open orders; their positions stay and are paid at resolution, and they stay on the workspace leaderboard. Rejoining with a new invite restores the same wallet.

**Private markets.** `POST /drafts/{id}/launch` with `workspaceId` creates a market only that workspace sees, staked from your wallet. Its id is `ws-<uuid>` and carries no title text. Private markets carry `workspaceId`; public ones never do. All the market routes above (`/markets/{id}`, its history, trades, comments, resolution, dispute and settle, `/quotes`, `/trades`, `/orders`, `/watchlist/{id}`) work on a private market for its active members and act through their wallet. For anyone else, signed in or not, they return the same 404 as an unknown id. Private markets never appear in `/markets`, `/leaderboard`, `capabilities.marketCount`, public comment or trade feeds, embeds, oEmbed or link previews.

**Rulings.** The operator route `/markets/{id}/ruling` returns 404 for private markets. Instead an owner, admin or resolver rules through `/workspaces/{wid}/markets/{id}/ruling`, but only on a `disputed` market or a `closed` one with no proposal (409 otherwise; undisputed proposals still settle on their own). The ruler must not be the creator or the disputer and must hold no shares in the market (409); if every privileged member is conflicted, the owner promotes another member to resolver. Payouts follow the same rules as an operator ruling.

**Notifications.** `GET /notifications` also returns notifications about private markets of workspaces you are an active member of, each with `workspaceId`; after you leave or are removed they disappear from your inbox.

**Invite links.** Share an invite as `https://<host>/join#<token>`. The fragment never reaches the server, so tokens stay out of request logs; the page sends the token in a POST body. Only the token's SHA-256 hash is stored. Rate limits: creating workspaces and invites 10/minute, preview 20/minute, join 10/minute.

SDK methods: `workspaces()`, `createWorkspace(name, displayName)`, `workspace(id)`, `renameWorkspace(id, name)`, `createInvite(id, {role, expiresInHours?, maxUses?})`, `invites(id)`, `revokeInvite(id, inviteId)`, `previewInvite(token)`, `joinWorkspace(token, displayName)`, `setMemberRole(id, memberId, role)`, `removeMember(id, memberId)`, `workspaceMarkets(id, search?, category?)`, `workspacePortfolio(id)`, `workspaceLeaderboard(id)`, `workspaceRuling(id, marketId, outcome)` and `launchDraft(id, category, workspaceId?)`.

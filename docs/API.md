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
| GET          | `/capabilities`              | Public                       | 200; demo mode, market count, `aiConfigured`, `aiProviders` (IDs/models/configured flags), and `defaultAIProvider`              |
| GET          | `/markets?search=&category=` | Public                       | 200; `{items}`; search max 200 chars, category max 50                                                                           |
| GET          | `/markets/:id`               | Public                       | 200; full definition, probabilities, `change24h` and demo statistics                                                            |
| GET          | `/markets/:id/history`       | Public                       | 200; fixture baseline plus last 99 observed demo fills                                                                          |
| POST         | `/quotes`                    | Public                       | 200; executable estimate, not a reservation                                                                                     |
| POST         | `/markets/{id}/resolution`   | Bearer (creator)             | 201; body `{outcome, evidenceUrl}`; halts trading, opens challenge window; 403 not creator, 409 already proposed                |
| POST         | `/markets/{id}/dispute`      | Bearer (not creator)         | 201; posts 100-credit bond; 409 outside challenge window or already disputed                                                    |
| POST         | `/markets/{id}/settle`       | Bearer                       | 200; pays out an undisputed proposal after the window; 409 too early or disputed                                                |
| POST         | `/markets/{id}/ruling`       | `X-Operator-Token`           | 200; body `{outcome}`; final ruling for disputed or house markets; 503 when unconfigured                                        |
| GET          | `/markets/{id}/trades`       | None                         | 200; last 30 trades, newest first; traders shown under an alias, never an account id                                            |
| GET          | `/leaderboard`               | Optional Bearer              | 200; top 20 traders by profit and creators by fees; viewer's own rows flagged `you`                                             |
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
| POST         | `/drafts/{id}/launch`        | Bearer                       | 201; body `{category}`; stakes 500 credits, returns the live market; 404 unknown draft, 409 expired deadline or low balance     |
| DELETE       | `/drafts/{id}`               | Bearer                       | 200; deletes own draft, 404 otherwise                                                                                           |
| POST         | `/drafts/generate`           | Bearer + `X-AI-Access-Token` | 201; optional private AI-refined draft                                                                                          |

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
| 403    | Host/origin or AI access restriction                     | Correct access/configuration; do not bypass the restriction           |
| 404    | Unknown market or API resource                           | Correct the ID/path                                                   |
| 409    | Price limit, balance, holdings or key/input conflict     | Requote/review holdings; keep key/input together on uncertain retries |
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

Every trade on a launched market pays the creator a 1% fee (`feeBps: 100` on the market; house markets have `feeBps: 0`). The fee is added to a buy and withheld from a sell. `amountMicros` in quotes and fills is always the total the trader pays or receives, fee included, and `feeMicros` shows the fee portion, so `limitMicros: quote.amountMicros` stays correct. `GET /portfolio` lists launched markets under `created` with `feesMicros` earned.

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

`GET /portfolio` includes `stats`: `tradeCount` and `volumeMicros` (total paid and received across own trades, fees included), `resolvedMarkets` (resolved markets the account traded in), `wins` (those where it received a payout, including INVALID refunds), `winRate` (`wins / resolvedMarkets`, 0 when none), `creatorFeesMicros` and `payoutsMicros` (both from the ledger).

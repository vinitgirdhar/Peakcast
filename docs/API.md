# API integration reference

The app talks to this API with `fetch("/api/v1/...")`, but no request leaves the device: the on-device engine in `src/local` answers it with the same route handlers (`server/routes.ts`) the optional Node server uses. In the apps, workspaces, share links, embeds and operator rulings are switched off; everything else below applies. API version: `v1`; implementation version: `0.1.0`.

To call it over HTTP, run the optional Node server (`npm run build && npm run serve`): base URL `http://127.0.0.1:3001/api/v1`, schemas at `/api/v1/openapi.json` and `/api-docs/`. `npm run test:api` exports a checked schema to `output/openapi.json`. There is no hosted API.

## Authentication and units

`POST /sessions` returns `{token, expiresAt, balanceMicros}` with 5,000 practice credits (accounts created before 2026-11-25 started with 10,000). Finish onboarding with `PUT /account` `{displayName, acceptTerms, confirmAdult}`; `GET /account` returns the profile, consent and Playground state; `PUT /account/mode` `{playground}` returns 409 until real-money trading is licensed and enabled; `DELETE /account` removes personal data and revokes the token. Send `Authorization: Bearer <token>` for portfolio, trades and drafts. Never use an account ID instead of a credential. The token expires after 30 days; no revocation endpoint or production identity is implemented.

1 credit = **1,000,000 microcredits**. A winning share would pay 1 credit in the intended settlement model; this demo has no resolution/redemption implementation. Probabilities are fractions from 0 to 1. Trade share quantities are integers from 1 to 10,000.

## Routes

| Method       | Relative path                | Access                      | Success and behavior                                                                                                            |
| ------------ | ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| POST         | `/sessions`                  | Public                      | 201; new isolated demo account                                                                                                  |
| GET          | `/capabilities`              | Public                      | 200; demo mode, public market count, `shareOrigin` (null in the apps), `teams` (false in the apps)                              |
| GET          | `/oembed?url=&maxwidth=`     | Public                      | 200; oEmbed 1.0 `rich` JSON with an `<iframe>` widget; 400 not this server's market link, 404 unknown market                    |
| GET          | `/markets?search=&category=` | Public                      | 200; `{items}`; search max 200 chars, category max 50                                                                           |
| GET          | `/markets/:id`               | Public                      | 200; full definition, probabilities, `change24h` and demo statistics                                                            |
| GET          | `/markets/:id/history`       | Public                      | 200; fixture baseline plus last 99 observed demo fills                                                                          |
| POST         | `/quotes`                    | Public                      | 200; executable estimate, not a reservation                                                                                     |
| POST         | `/markets/{id}/resolution`   | Bearer (creator)            | 201; body `{outcome, evidenceUrl}`; halts trading, opens challenge window; 403 not creator, 409 already proposed                |
| POST         | `/markets/{id}/dispute`      | Bearer (not creator)        | 201; posts 100-credit bond; 409 outside challenge window or already disputed                                                    |
| POST         | `/markets/{id}/settle`       | Bearer                      | 200; pays out an undisputed proposal after the window; 409 too early or disputed                                                |
| POST         | `/markets/{id}/ruling`       | `X-Operator-Token`          | 200; body `{outcome}`; final ruling for disputed or house markets; 503 when unconfigured                                        |
| GET          | `/markets/{id}/trades`       | None                        | 200; last 30 trades, newest first; traders shown under an alias, never an account id                                            |
| GET          | `/leaderboard`               | Optional Bearer             | 200; top 20 traders by profit, creators by fees and `forecasters` by Brier score; viewer's own rows flagged `you`               |
| GET          | `/portfolio/calibration`     | Bearer                      | 200; own `{resolvedMarkets, brier, skill?, buckets}`; `brier` null until a traded market resolves YES or NO                     |
| POST         | `/orders`                    | Bearer                      | 201; body `{marketId, outcome, action, shares, limitPrice}`; limit order, may fill at once; 409 closed market or 20 open orders |
| DELETE       | `/orders/{id}`               | Bearer                      | 200; cancels an own open order; 404 otherwise                                                                                   |
| GET          | `/markets/{id}/comments`     | Optional Bearer             | 200; last 50 comments, newest first, alias plus side held                                                                       |
| POST         | `/markets/{id}/comments`     | Bearer                      | 201; body `{body}` (1–500 chars); 429 within 5 seconds of the last comment                                                      |
| PUT / DELETE | `/watchlist/{id}`            | Bearer                      | 200 `{watching}`; idempotent                                                                                                    |
| POST         | `/trades`                    | Bearer + idempotency header | 201; atomic execution or original matching retry result                                                                         |
| GET          | `/portfolio`                 | Bearer                      | 200; balance, mark value, positions, last 100 trades, `bonus` status and performance `stats`                                    |
| GET          | `/notifications`             | Bearer                      | 200; `{items, unread}`; own last 50 notifications, newest first                                                                 |
| POST         | `/notifications/read`        | Bearer                      | 200 `{unread: 0}`; marks every own notification read; no body or `{}`, any field is 400                                         |
| POST         | `/bonus/claim`               | Bearer                      | 200; daily credit bonus, once per UTC day; 409 when already claimed today; no body or `{}`, any field is 400                    |
| GET          | `/drafts`                    | Bearer                      | 200; own last 50 private drafts                                                                                                 |
| POST         | `/drafts`                    | Bearer                      | 201; manual draft, private until launched                                                                                       |
| POST         | `/drafts/{id}/launch`        | Bearer                      | 201; body `{category, workspaceId?}`; stakes 500 credits; 404 unknown draft or workspace, 409 expired deadline or low balance   |
| DELETE       | `/drafts/{id}`               | Bearer                      | 200; deletes own draft, 404 otherwise                                                                                           |

## Embeds and oEmbed

`GET /embed/markets/{id}?theme=light|dark|auto` (outside `/api/v1`) returns a self-contained, read-only HTML widget: question, YES probability, 24-hour change, sparkline of the fixture baseline plus recent fills, deadline, status and a "Forecast on Peakcast" link that opens the market in a new tab. `theme` defaults to `auto` (`prefers-color-scheme`); other values return 400. An unknown market returns a small HTML 404 page. The widget is sized for 360×200 up to about 600 wide.

- **Framing:** only `/embed/*` sends `frame-ancestors *` and omits `X-Frame-Options`. The data is public, there is no session, cookie or state-changing control to clickjack, so any publisher may frame it. Every other route keeps `frame-ancestors 'none'`.
- **CSP on the widget:** `default-src 'none'`, no script at all, and one static stylesheet allowed by its SHA-256 hash. All market text is HTML-escaped.
- **Caching and limits:** `Cache-Control: public, max-age=30`; the per-IP rate limit applies as on `/api/`.

`GET /api/v1/oembed?url={market link}` accepts only this server's own `/markets/{id}` (or `/markets/{id}/rules`) links, with optional `maxwidth`, `maxheight` (1–9999) and `format=json`. It returns `{version: "1.0", type: "rich", provider_name: "Peakcast", provider_url, title, html, width, height}`; the iframe is 480×200 unless the maxima are smaller, uses `loading="lazy"`, and is sandboxed to allow only popups. The SDK method is `api.oembed(url, maxwidth?, maxheight?)`.

Market pages (`/markets/{id}`) include Open Graph and Twitter card tags and an oEmbed discovery link, so shared links unfurl. `shareOrigin` in `/capabilities` is the origin used for share links: the configured `PUBLIC_ORIGIN` on the hosted service, the loopback origin in local development, and `null` in the Windows app, whose server nobody else can reach.

## SDK example

After `npm run build`, run this as an ES module from the repository root. The UI imports the same client from `shared/client.ts`.

```javascript
import { randomUUID } from "node:crypto";
import { PeakcastClient } from "./dist-server/shared/client.js";

const publicApi = new PeakcastClient("http://127.0.0.1:3001");
const { token } = await publicApi.createSession();
const api = new PeakcastClient("http://127.0.0.1:3001", token);
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

## Errors and retry rules

All application errors return JSON `{ "message": "..." }`.

| Status | Meaning                                                   | Caller action                                                         |
| ------ | --------------------------------------------------------- | --------------------------------------------------------------------- |
| 400    | Invalid fields, types, ranges or manual draft             | Correct the request                                                   |
| 401    | Missing, invalid or expired bearer credential             | Authenticate/create a demo account                                    |
| 403    | Host/origin, operator token or workspace role restriction | Correct access/configuration; do not bypass the restriction           |
| 404    | Unknown market or API resource, or not a member of it     | Correct the ID/path                                                   |
| 409    | Price, balance, holdings, key/input or state conflict     | Requote/review holdings; keep key/input together on uncertain retries |
| 409    | Launch refused by a blocking rule check                   | Fix the named checks and save a new draft                             |
| 413    | Body larger than 16 KiB                                   | Reduce request size                                                   |
| 429    | Rate limit                                                | Respect `Retry-After`                                                 |
| 500    | Unexpected application failure                            | Investigate server; do not blindly create another trade               |

The SDK preserves HTTP failure status even when a gateway sends an unreadable HTML response. In an uncertain trade failure, retry the original input with its original key to avoid executing a second order.

## Limits and labels

Read APIs currently return bounded fixture/history lists, not cursor pagination. Quotes are public; account data requires bearer auth. API data is never served from the PWA cache. No CORS permission is granted for arbitrary browser origins; server-side tools can call the loopback API. The web server optionally accepts one exact HTTPS tunnel origin via `PUBLIC_ORIGIN` for a temporary same-origin phone preview. Production hosting, scoped production credentials, streams, signed webhooks and real-money integrations are planned, not hidden endpoints.

## Creator markets

`POST /drafts/{id}/launch` turns one of your saved drafts into a live market. The creator stakes 500 demo credits, which funds the market's liquidity: an LMSR pool opened at 50% can lose at most `liquidity × ln 2`, so the stake covers the pool's worst case. The draft is consumed and the market opens for everyone.

### Rule check at launch

Launch runs the same deterministic linter the Draft studio shows (`lintDraft` in `shared/lint.ts`). It is text and URL structure only: the server never fetches, resolves or pings the source URL. After the expired-deadline check, any `block` finding returns **409** and changes nothing (the draft stays, no stake is taken), for example `Fix 2 blocking rule problems before launch: rules-identical, url-shortener.` Blocking checks: `comparator-without-number`, `rules-identical`, `subjective-judge`, `url-shortener`, `url-not-public-host` (IP, `localhost`, single-label, `.local`, `.internal`, `.lan`, `.home.arpa`) and `closes-too-soon` (under one hour).

Warnings never fail the API launch and need no flag; the studio asks the creator to acknowledge them. The launched market carries `ruleCheck: {risk, warnings}` (risk 0–100, distinct warning ids), which the market's rules view shows. Seed markets and markets launched before the linter have no `ruleCheck`. Saving a draft is unaffected, so private drafts may hold findings. Whether the source actually shows the figure is a human check: the studio links the source (Copy link on Windows, which only opens launched markets' links) and asks the creator to confirm they opened it. That is a nudge, not a control.

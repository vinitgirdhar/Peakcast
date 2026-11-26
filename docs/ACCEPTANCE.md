# Review checklist for the current build

Use this alongside the running app and [RFP status](RFP_STATUS.md). “Verified” below means automated Chromium desktop/mobile checks for the local demo. It does not mean every browser/device or the full RFP is complete.

## Current controls and their connections

| Screen/control                                     | Expected result                                                        | Backend/browser connection                                                  | Automated evidence                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| First open / account balance                       | Create or restore an isolated demo account and show its actual credits | Sessions, markets, portfolio, capabilities APIs                             | `api.test.ts`, `check-api.mjs`, browser startup                                              |
| Brand, sidebar, mobile dock, menu open/close       | Correct screen and active navigation; browser back/forward works       | Shared SPA navigation; data APIs on page load                               | `controls.spec.ts`, `developer-controls.spec.ts`, `glass.spec.ts`                            |
| Header balance                                     | Open own portfolio                                                     | Portfolio API                                                               | `controls.spec.ts`                                                                           |
| Help, Documentation, footer developer button       | Open Developers screen                                                 | API reference/SDK documentation                                             | `controls.spec.ts`                                                                           |
| Search / every category / Clear filters            | Correct questions and empty-state recovery                             | Local filtering of API-provided markets; server search tested independently | `controls.spec.ts`, `platform.spec.ts`, `check-api.mjs`                                      |
| Featured/activity/probability/closing sort         | Correct ordering of API data                                           | Client sorting; no fabricated activity                                      | `controls.spec.ts`                                                                           |
| Featured market / each market card / All markets   | Correct question/rules and return navigation                           | API market snapshot and observed history                                    | `platform.spec.ts`, `controls.spec.ts`                                                       |
| Designated source link                             | Open the declared HTTPS source                                         | Browser external navigation                                                 | URL/target click tested with a stubbed external page; remote site availability not certified |
| Buy/Sell, YES/NO, share input and quick quantities | Correct quote/outcome; invalid whole-share input blocked               | Quotes API                                                                  | `controls.spec.ts`, `platform.spec.ts`                                                       |
| Trade execution                                    | Debit/credit, update shares/history and display confirmed fill         | Transactional Trades API                                                    | Node integration, real HTTP SDK, browser tests                                               |
| Price/balance/holdings failure                     | No partial balance/position change                                     | Backend limits and transaction rollback                                     | `api.test.ts`, `check-api.mjs`                                                               |
| Refresh quote                                      | Retry pricing without changing the order                               | Quotes API                                                                  | `controls.spec.ts`                                                                           |
| Interrupted confirmation                           | Confirm original request/key; no duplicate fill                        | Account-scoped idempotency                                                  | `glass.spec.ts` and API tests                                                                |
| Toast dismissal                                    | Close confirmation without losing trade state                          | UI state                                                                    | `controls.spec.ts`                                                                           |
| Portfolio positions/activity tabs and rows         | Correct own positions/trades; row returns to market                    | Portfolio API                                                               | `platform.spec.ts`, `controls.spec.ts`                                                       |
| Use an example / manual draft form / Save          | Fill explicit rules; validate and persist private draft                | Drafts API                                                                  | `platform.spec.ts`, `api.test.ts`, HTTP SDK                                                  |
| Saved draft disclosure                             | Show rules, designated source and local closing time; survive reload   | Drafts API                                                                  | `platform.spec.ts`                                                                           |
| AI status/mode/access-token/refine control         | Unconfigured mode is labeled; configured mode submits an extra secret  | Capabilities and optional Generate Draft API                                | Configured UI endpoint and provider responses mocked; live paid inference not run            |
| Copy demo API token                                | Copy only the current demo credential or show permission error         | Browser clipboard API                                                       | Success/denial tested using a clipboard stub; OS clipboard not overwritten by tests          |
| API reference / OpenAPI JSON                       | Load usable routes, request/response schemas and auth                  | Backend-generated Swagger/OpenAPI                                           | `platform.spec.ts`, `security.test.ts`, HTTP SDK                                             |
| Install Peakcast                                   | Offer a prompt only when the browser exposes one; handle failure       | PWA browser API                                                             | Prompt success/failure simulated; physical installation not tested                           |
| Error Retry / unknown page recovery                | Recover from startup failure and unknown routes                        | Actual API retry and SPA history                                            | `developer-controls.spec.ts`                                                                 |

## Mobile structure

- `/`: six compact market rows per page, category/search/sort across all markets.
- `/markets/:id`: chart and trade form; mobile Trade shortcut jumps to the order form.
- `/markets/:id/rules`: full source and YES/NO criteria; missing-evidence policy expands on request.
- `/studio` and `/studio/drafts`: drafting and saved items, with unsaved inputs preserved between views.
- `/developers`, `/developers/api`, `/developers/setup`: resource hub, API credentials/reference, installation/configuration.
- Mobile has only bottom navigation; desktop has an accessible hamburger drawer. Demo-credit labeling remains visible without roadmap paragraphs in the main flows.

## Manual review sequence

1. Run `npm run verify`, then `npm start`; open `http://127.0.0.1:3001`.
2. Try all categories and sort orders. Search an existing question and a nonexistent word, then clear filters.
3. Open a market, switch to Rules & source, read its primary source and YES/NO/missing-evidence rules. Check the closing timezone label.
4. Buy 10 YES shares, inspect the portfolio and activity, reload, then sell them. Repeat with NO. Balances must move by the recorded cost/proceeds, not reset on reload.
5. Enter 0, a fraction and more than 10,000 shares. Try selling more shares than owned. Invalid actions must stay disabled or return a clear backend error without changing positions.
6. Save an example draft, switch to Saved drafts, open its disclosure and reload. Check that it stays private to the same demo account. AI should remain labeled unconfigured until valid server credentials exist.
7. Open the API reference, create a separate demo token and call the portfolio endpoint. It must not show the first account's holdings.
8. Resize to a phone width. Use the bottom dock on phones, a drawer on intermediate screens and a persistent sidebar on wide desktop screens. Check Escape, focus containment, focus restoration and closing the drawer when resizing to desktop. Enable reduced motion and check readable focus/pressed/disabled states. Hidden scrollbars must preserve scrolling.
9. Run `npm run desktop:package` and `npm run test:desktop` with other Peakcast desktop instances closed. Review the Windows app; its demo store is intentionally separate from the web store.

## Acceptance boundaries

- Expected: local demo trading, private drafts, persistent per-client accounts, versioned APIs and consistent shared UI.
- Conditional: optional configured AI and PWA installation/browser permission behaviors.
- Not accepted as implemented: real funds, tokens/vaults, CLOB/hybrid routing, final settlement/redemption, autonomous crawlers, oracle consensus, live sentiment, fiat/KYC/geofencing or cloud deployment.
- Not measured: 15ms matching, 10,000 TPS, 150 qualified markets/day, 60-second final settlement, fixed gas cost or universal animation frame rate.

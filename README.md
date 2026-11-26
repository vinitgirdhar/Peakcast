# Peakcast

**A prediction market practice app that runs entirely on your device.** Draft a market, launch it with your own staked liquidity, trade it, and see it resolved through a transparent propose, dispute and rule process. There is no server, no sign-up and no tracking: the web app, the Android app and the Windows app each keep their data on the device and work offline.

**Web app:** https://wildcatter-welcome.onrender.com · **Android and Windows apps:** [latest release](https://github.com/vinitgirdhar/wildcatter/releases/latest)

![Peakcast market explorer](docs/assets/markets-desktop.png)

A quiet forecasting workspace: crisp typography, a persistent desktop sidebar, and a touch-friendly mobile tab bar. Light and dark appearances, sliding selections, animated charts and values, expanding panels and tactile controls, with reduced-motion support.

> Peakcast runs on practice credits. Every new account starts with 5,000 credits after a short onboarding (display name, 18+ confirmation, Terms and Privacy consent). Nothing here is real money, a wallet, or an on-chain asset. See [Scope and honesty](#scope-and-honesty).

## Product film

[![Watch the product introduction](public/media/wildcatter-product-introduction.jpg)](public/media/wildcatter-product-introduction.mp4)

**[Watch the product introduction — 1 min 54 sec](public/media/wildcatter-product-introduction.mp4)** · [English captions](public/media/wildcatter-product-introduction.en.vtt)

The film was recorded before the rename to Peakcast and before the move to on-device data, so it still shows the earlier name and a shared hosted backend. All records shown use practice credits.

Music: “Happy Beats / Business Moves, Vol. 12” by Sascha Ende, [ende.app](https://ende.app), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Android is a trademark of Google LLC. The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the [Creative Commons 3.0 Attribution License](https://creativecommons.org/licenses/by/3.0/). Windows is a trademark of Microsoft Corporation.

## Contents

- [What it does](#what-it-does)
- [Design principles](#design-principles)
- [Architecture](#architecture)
- [Run it locally](#run-it-locally)
- [Apps: web, Android, Windows](#apps-web-android-windows)
- [Quality and verification](#quality-and-verification)
- [Deployment](#deployment)
- [Scope and honesty](#scope-and-honesty)
- [Documentation](#documentation)

## What it does

### Trade

- Search, filter and sort markets; each shows its YES probability, 24-hour change, volume and deadline.
- Buy and sell YES/NO shares against an LMSR automated market maker with live quotes, a price-impact breakdown and a slippage limit.
- **Limit orders**: name a price and the order fills by itself when the market reaches it.
- **Explain this market**: every market page says what its number means in plain words ("The crowd puts this at about 1 in 3"), with the 24-hour move, activity, time left, how it resolves and the launch rule check.
- Portfolio with positions, profit and loss, trade activity, open orders, watchlist, performance stats and a downloadable CSV statement.

### Create

- **Draft studio**: write a market's question and its YES / NO / invalid rules, with a primary source and a deadline.
- **Rule linter**: a live "Rule check" flags ambiguous rules as you type (a comparison with no number, a creator-as-judge rule, a URL shortener, a missing time zone or deadline). Blocking problems stop the launch; warnings need an acknowledgement and are shown on the launched market.
- **Creator markets**: launch a draft as a live market by staking 500 credits of liquidity. The creator earns a 1% fee on every trade and gets unused liquidity back at resolution. The stake fully covers the market maker's worst-case loss, so every payout is funded.

### Resolve

1. **Propose.** The creator posts an outcome (YES, NO or INVALID) with an evidence link. Trading halts.
2. **Challenge window.** A dispute costs a 100-credit bond.
3. **Settle.** Undisputed proposals pay out automatically when the window ends.

Winning shares redeem for 1 credit, INVALID pays 0.5 on both sides, and every credit movement is written to a per-account ledger. Operator rulings for disputed and house markets exist in the code but are switched off in the apps, which have no operator.

### Engage

- Trade feed and discussion on every market; comments show which side the commenter holds.
- Leaderboards for top traders (by profit), creators (by fees) and forecasters (by Brier score accuracy), with a reliability diagram in the Portfolio.
- Notifications inbox for fills, payouts, proposals, disputes and comments.
- Daily bonus with a streak. Bonus credits are excluded from profit rankings.
- **Sample community.** A new install starts with twelve sample players who have traded the house markets over the past two weeks and launched five markets of their own, four of them already resolved, so the feed, price history and all three leaderboards have something in them. They go through the real trading and resolution code ([`server/demo.ts`](server/demo.ts)) and are added once per device; on a device, players are shown by display name.

## Design principles

1. **Your data stays on your device.** No server, account system, analytics or network calls. The Android app does not even request the internet permission.
2. **Every payout is funded.** Creator liquidity equals the LMSR worst-case loss, so a market can never owe more than it holds. A test asserts that credits are conserved across a full market lifecycle.
3. **Money is integers.** All amounts are integer microcredits (1 credit = 1,000,000). No floating-point balances.
4. **One atomic write per action.** A trade, its fee, the position change and the ledger row commit together or not at all, and the change is saved to the device before the app reports it.
5. **Resolution is a process, not a button.** Outcomes need evidence and can be challenged, and disputes cost a bond.
6. **Claims are tested.** Each feature ships with automated checks, and the docs state what is not covered.

## Architecture

```
     Web (static site)      Android (WebView)      Windows (Electron)
              \                    |                     /
               +--------- shared React UI (src/) -------+
                                   |
                  typed client (shared/client.ts): fetch("/api/v1/...")
                                   |
          on-device engine (src/local): answers /api/v1 inside the app
                                   |
     the same routes, Store and rules as the Node server (server/routes.ts)
                                   |
       SQLite compiled to WebAssembly (sql.js), saved in IndexedDB
```

The app's `fetch` calls to `/api/v1` never leave the device: [`src/local/index.ts`](src/local/index.ts) routes them to an in-process copy of the API built from the same [`server/routes.ts`](server/routes.ts) handlers and [`server/database.ts`](server/database.ts) Store that the optional Node server uses, so validation, pricing and resolution behave identically. The database is SQLite in WebAssembly, written to the browser's IndexedDB after every change.

| Folder     | Contents                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------- |
| `src/`     | Shared React 19 UI; `src/local/` is the on-device engine (router, SQLite adapter, storage)   |
| `server/`  | Store, AMM, limit orders, resolution, notifications and the `/api/v1` routes; Fastify server |
| `shared/`  | API types and the TypeScript client                                                          |
| `android/` | Android WebView shell that serves the bundled web app from inside the APK                    |
| `desktop/` | Electron shell that serves the bundled web app from a private `app://` origin                |
| `tests/`   | Unit and integration tests (`node:test`) and Playwright browser journeys                     |
| `scripts/` | Build, packaging, icon generation and verification scripts                                   |

**Stack:** TypeScript, React 19, Vite 8, sql.js (SQLite WebAssembly), TypeBox schemas, Electron, Android WebView, Node.js 22 for tests and tooling.

## Run it locally

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Everything runs in the browser tab; data is kept in that browser's storage. `npm run build:web` writes the production web app to `dist/`.

The Fastify server in `server/` still exists for the integration tests and for anyone who wants to host the API (`npm run build && npm run serve`), but none of the apps use it.

## Apps: web, Android, Windows

| Surface         | How to get it                                                                                                                                        | Data                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Web             | The [web app](https://wildcatter-welcome.onrender.com). Choose **Install app** / **Add to Home Screen** to run it full screen.                       | That browser's storage                           |
| Android         | Install `Peakcast-Android.apk` from the [latest release](https://github.com/vinitgirdhar/wildcatter/releases/latest)                                 | The app's own storage on the phone               |
| Windows desktop | Download the ZIP from the [latest release](https://github.com/vinitgirdhar/wildcatter/releases/latest), extract the whole folder, run `Peakcast.exe` | The app's own storage under `%APPDATA%/peakcast` |

Each copy is independent: nothing syncs between devices.

- **Android:** `npm run build:web`, then `powershell -File scripts/build-android.ps1` (Android SDK 36 and JDK 17). The web build ships inside the APK under `assets/app` and loads from Android's reserved local host `https://appassets.androidplatform.net`, so it works offline. Add `-Bundle` with the `PEAKCAST_*` upload-key variables for a Google Play `.aab`. Package: `com.bay2peak.peakcast`.
- **Windows:** `npm run desktop:package`, then `npm run test:desktop` for the packaged smoke test. The executable is unsigned, so Windows SmartScreen may ask for confirmation.
- **Icons:** every icon size (web, iOS home screen, Android launcher including adaptive and themed icons, Windows `.ico`) is generated from one drawing by `node scripts/make-icons.mjs`. Full-size artwork is in [`docs/brand`](docs/brand).

![Peakcast mobile markets](docs/assets/markets-mobile.png)

The [interface guide](docs/DESIGN.md) covers typography, spacing, navigation, motion and platform behavior.

## Quality and verification

```bash
npm run verify
```

It checks formatting and documentation links, runs the unit and integration suite with an 80% coverage gate, builds the project, and runs the Playwright journeys. [`tests/local-engine.test.ts`](tests/local-engine.test.ts) runs the on-device engine on sql.js in Node: a session, onboarding, a quote and trade, validation errors, and reopening the saved bytes with the account intact.

## Deployment

The web app is a free Render static site ([render.yaml](render.yaml)): `npm run build:web` publishes `dist/`, client-side routes fall back to `index.html`, and `/downloads/Peakcast-*.{apk,zip}` redirect to the GitHub release assets. A static site never sleeps and has no database to lose, so there is nothing to keep alive.

## Scope and honesty

Not implemented: real money, wallets, on-chain settlement, a visible order book or partial fills, sync between devices, account recovery, identity verification and geofencing. Clearing an app's storage or uninstalling it erases its data. Workspaces (Teams), share links, embeds and operator rulings exist in the code and the Node server but are switched off in the apps, because nobody else can reach a device's data. Sample markets and their starting probabilities are illustrative, not live data.

## Documentation

| Topic                                | Document                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| Status against the original brief    | [docs/RFP_STATUS.md](docs/RFP_STATUS.md)                                               |
| API routes (on-device and server)    | [docs/API.md](docs/API.md)                                                             |
| Data, modules and transaction safety | [docs/BACKEND.md](docs/BACKEND.md)                                                     |
| Design system                        | [docs/DESIGN.md](docs/DESIGN.md)                                                       |
| Acceptance checklist                 | [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)                                               |
| Verification record and automation   | [docs/VERIFICATION.md](docs/VERIFICATION.md), [docs/AUTOMATION.md](docs/AUTOMATION.md) |
| Plan and research                    | [docs/PLAN.md](docs/PLAN.md), [docs/RESEARCH.md](docs/RESEARCH.md)                     |

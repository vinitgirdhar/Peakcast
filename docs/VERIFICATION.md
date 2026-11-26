# Verification record

## Packaged Windows feature audit — November 16, 2026

- Exercised 31 shared journeys and eight additional native feature journeys in the packaged Electron app, using isolated temporary profiles. Checks cover discovery, YES/NO trading, quotes and recovery, portfolio, orders, watchlist, CSV ledger export, drafts and market launch, discussion, bonuses, notifications, disputed and undisputed resolution, leaderboards, managed provider settings, clipboard, restart persistence and single-instance behavior.
- Found and fixed two desktop defects: creator source/evidence links were blocked by the seed-domain allowlist, and late background requests could access a destroyed window during shutdown. The external-link policy now accepts only exact HTTPS links recorded on current markets. Unlisted URLs, credentials, HTTP and file URLs stay blocked. A permanent isolated desktop smoke test covers those rules and closing with requests in flight.
- Post-fix native journeys passed with no captured main-process exceptions. The full shared verification passed 58 unit/integration tests, eight compiled API groups and 112 browser journeys, with two intentionally skipped duplicate lifecycle runs. All 48 browser screen audits and eight additional native screen/theme audits passed without detected accessibility violations or document overflow. Formatting and dependency audit passed.
- The rebuilt local executable and ZIP contain the fixes; this audit did not republish the GitHub release. AI responses and quota errors were simulated, while the local Ollama control checked availability only. External-browser handoff was intercepted for verification. The user's normal desktop profile and clipboard were preserved. Signed installers, live paid inference, source availability and institutional performance were not certified.

## Frontend server warm-up and app release 1.1.1 — November 16, 2026

- The independent Render static entry at `https://wildcatter-welcome.onrender.com` displays the branded animation immediately, explains a slow backend after three seconds, and redirects only after an uncached app image decodes. Platform HTML is never displayed as the entry document. Three-minute timeout, explicit Retry, offline copy and reduced-motion behavior are covered by browser tests.
- The cached React shell uses the same warm-up styling. Background reconnection preserves the current screen, and a missing demo session is recreated with a notice. Only readiness reads are retried; trades and account creation are not replayed. Animations run entirely on the frontend. The public readiness icon alone permits cross-origin embedding; APIs retain their existing origin restrictions. No keep-alive worker or paid service was added.
- The complete verification gate covers 58 unit/integration tests, eight compiled API groups, 112 browser journeys and two intentionally skipped duplicate lifecycle runs, TypeScript/build, formatting, documentation links and dependency audit. All 48 route/theme/viewport audits passed without detected accessibility violations, page errors or document overflow. The new warm-up tests run in all three browser projects and retain the real icon security headers.
- Android version code 3 / version name 1.1.1 compiles and verifies with the existing certificate. Production builds enter through the static warm-up page; custom-host builds keep direct entry. The Windows package bundles the local API and shared frontend, so its normal launch does not depend on Render.
- Cold responses are simulated in browser tests. Physical Android installation, real idle-to-awake timing and paid AI inference remain unverified. Direct backend links can still show Render's platform loader; share the independent entry URL.

## Hero, market pulse and app release 1.1.0 — November 16, 2026

- The landing hero offers web entry, Windows desktop download and Android download together. The overview now contains a compact charcoal market pulse with actual open-question, trade and volume totals, plus clickable upcoming deadlines. Closed and expired markets are excluded from the deadline list.
- Scrollbars are visually hidden without disabling scrolling. Studio and Buy/Sell selections use the shared sliding indicator; reduced-motion content remains immediately available. No new dependency was added.
- The complete `npm run verify` gate passed: 57 unit/integration tests, eight compiled API groups, 91 browser journeys, two intentionally skipped duplicate lifecycle runs, TypeScript/build, formatting, documentation links and dependency audit. Backend/shared coverage: 97.94% lines, 94.50% branches and 90.78% functions. All 48 route/theme/viewport audits passed without detected accessibility violations, page errors or document overflow.
- The Windows 1.1.0 bundle contains the tested frontend and excludes private workspace data. Android version code 2 / version name 1.1.0 compiles and verifies with the same signing certificate as the previous release. The Android shell uses the documented hosted demo origin.
- Render inspection confirmed Peakcast is linked to `vinitgirdhar/wildcatter`, branch `main`, with automatic deployment on commit enabled. App binaries are distributed as GitHub Release assets rather than committed to the source repository. The current free demo's SQLite reset on deployment remains documented in the README.
- Physical Android/iPhone installation, paid AI inference, exchange certification and production performance were not verified by these checks.

## Monochrome workspace and motion — November 16, 2026

- Redesigned the landing page and shared web/PWA/Electron/Android interface around the supplied reference. Added persistent desktop navigation, mobile tabs, neutral surfaces, bundled typography, coordinated motion, and explicit reduced-motion behavior. Removed the loaded refraction runtime.
- All 57 unit/integration tests passed. Coverage across the executed server/shared modules: 97.94% lines, 94.52% branches, 90.78% functions. Compiled HTTP API checks passed all eight groups.
- All 85 applicable browser journeys passed across desktop Chromium, Android-sized Chromium and mobile WebKit. Two duplicate lifecycle runs are intentionally skipped; the full lifecycle runs in the final WebKit project. The reload journey waits for both post-trade chart and quote responses so WebKit does not report an interrupted request as a page error.
- All 48 screen audits passed: 12 routes, two themes, desktop and mobile widths. No detected WCAG A/AA violations, document overflow, or page errors. Extra checks cover 320–1440px featured probabilities, tablet drawer resizing, theme persistence, and reduced-motion content availability. Automated checks do not replace a full accessibility audit.
- The final Windows bundle matches the current frontend build. Packaged launch, sidebar navigation, local API, renderer isolation and session persistence across two launches passed. The downloadable ZIP was refreshed.
- Android APK compilation and signature verification passed. Four invalid build origins were rejected. The Android build now defaults to the documented hosted demo instead of an expiring preview tunnel. No Android device was attached for installation or hardware checks.
- Production build, TypeScript, formatting, documentation links, dependency audit and diff whitespace checks passed. No new dependencies were added. No deployment, commit or push was performed; the Android frontend changes appear when its configured host is updated.

2026-11-11, Windows local development environment. This verifies the demo milestone and Apple-inspired redesign, not the RFP's institutional performance or real-money requirements.

## Settings, pure-black appearance and app downloads — November 12, 2026

- Added a short landing page at `/`, moved market browsing to `/markets`, and added Settings as the fifth mobile navigation destination. Themes persist and apply to app/landing; dark canvas and panels are pure black. Custom dropdowns replace native selects, category spacing is explicit, markers are larger, and scrollbars are hidden without preventing scrolling.
- Provider management uses account plus workspace authorization, validates provider/model/key boundaries, persists private overrides, and never returns saved keys. Ollama uses a fixed loopback endpoint. Native Windows authorizes only its own renderer without exposing its workspace secret; a live packaged test confirmed renderer access and denied an external loopback request.
- Latest unit/API run: 36 tests passed; coverage 97.16% lines, 92.88% branches, 89.00% functions across executed server/shared modules. The initial 57 browser run passed 56; the longer WebKit discovery flow exhausted its 30-second test budget. Its explicit 60-second budget then passed. New Settings/provider/dropdown flows were rerun across all three browser projects.
- All 44 layout/theme/axe checks passed: 11 routes, two themes, desktop and mobile viewports; no reported contrast violations, page errors or horizontal document overflow. Automated checks are not a full accessibility audit.
- Packaged Windows launched twice with navigation, renderer sandbox/context isolation, API and session persistence checks passing. The current Windows ZIP includes the updated interface and backend. Android APK compilation and signature verification passed; physical-device installation was not run.
- The real public preview passed pure-black appearance, fifth-tab Settings navigation, authenticated provider edit with a blank retained key, persistence and the Android APK download. Provider keys were not exposed in the UI.
- Android is a demo native WebView shell connected to the temporary HTTPS preview. Windows is a portable bundled local app. Neither is a signed production installer/store release. Ollama is installed on the laptop but its service was unreachable, so live local inference remains untested.

## AI provider update — November 12, 2026

- Added explicit Gemini/Groq selection in Draft Studio and optional OpenAI compatibility. The API exposes configured provider metadata and a default provider, and validates the optional provider query parameter.
- Latest backend/shared run: 35 tests/subtests passed; executed-module coverage 97.76% lines, 93.70% branches, 88.89% functions. Tests cover independent provider routing, no fallback/retries, missing configuration, authorization/query validation, output/refusal/incomplete/error/timeout handling, source/deadline preservation, provider persistence and account isolation.
- Twelve targeted browser journeys passed across desktop Chromium, mobile Chromium and mobile WebKit, including selecting both providers and preserving manual drafting. These used mocked inference; the earlier 48-journey full run remains the preceding mobile-layout baseline.
- Real calls passed for Gemini `gemini-3.5-flash-lite` and Groq `openai/gpt-oss-20b`. Both were also exercised through the mobile UI over the public HTTPS tunnel: provider selection, generation and private saved-draft provider labels passed. Reports: `output/live-ai-provider-check.json` and `output/live-ai-ui-check.json`. This verifies draft refinement, not autonomous forecasting or live source verification.
- The older Gemini 2.5 Flash model was unavailable to new users, and 3.8 Flash requests timed out in this environment. Flash-Lite passed live checks. One earlier public Gemini attempt failed; an explicit subsequent check passed. No automatic retries or provider fallback were added.
- Both running web servers were restarted with the server-only provider configuration. Credential scans found no live keys/workspace secret in source, docs, or built public assets. The development desktop launcher now loads local `.env`; packaged archives still exclude credentials.
- TypeScript/production build, formatting, documentation links and eight compiled-backend HTTP groups passed. Provider credentials are stored only in ignored local environment settings. Keys disclosed in chat should be rotated.

## Earlier mobile baseline

## Passed

- 24 Node tests/subtests: LMSR bounds/cost/rounding, schema validation, public market queries/history, auth isolation, buy/sell, concurrent identical retries, conflicting keys, balance/holdings/price-limit rollback, private drafts, database restart, expired credentials, closed markets, host/origin restrictions, actual rate limiting/body-size failures, OpenAPI error/auth contracts and mocked provider completion/refusal/invalid-output/error boundaries.
- Native Node coverage of executed `server/` and `shared/` modules: 96.92% lines, 90.67% branches, 87.18% functions in the observed run. These are not whole-product/UI coverage numbers. The automated gate requires 80% aggregate for each metric.
- 48 Playwright journeys across desktop Chromium, Pixel-sized mobile Chromium and iPhone-sized mobile WebKit: every discovery category/sort, menu/dock/navigation/history/404 recovery, quick quantities, YES/NO buys and sells, input guards, portfolio/activity, private draft persistence/disclosure, API reference/PWA assets, explicit offline and stale/failed quote recovery, reduced-motion/glass cleanup and interrupted confirmation without duplicate fills. Browser-boundary simulations cover clipboard denial/success, install prompt success/failure and configured-AI UI submission; those do not certify an actual OS install or live model inference.
- Eight real loopback HTTP verification groups using the compiled backend and shared SDK with disposable data: market list/detail/history/search, sessions/auth/no-store, YES and NO buy/retry/partial sell/close, failure/rollback/isolation checks, private drafts, unconfigured-AI behavior, OpenAPI/Swagger/static assets and private-file exclusions.
- Automated axe WCAG 2 A/AA and WCAG 2.1 AA checks: all nine routes at 1440px and 390px, zero reported violations. No horizontal document overflow or uncaught page errors in those checks. Automated checks are not a complete accessibility audit.
- Production frontend/server build and strict TypeScript including unused-local/parameter checks.
- `npm audit`: zero reported vulnerabilities in the installed dependency tree. Patched glob/minimatch overrides address transitive build-tool advisories; packaging is exercised with those versions.
- Windows x64 Electron packaging with application/data/credential exclusions and published Electron archive checksum validation.
- Packaged Windows launch twice: local API available, SVG refraction active, renderer sandbox/context isolation enabled, renderer Node access absent and the desktop session preserved across restart.

## Evidence

`output/screenshots/` contains desktop/mobile screenshots of all nine routes, public-link iPhone WebKit screenshots and a packaged Windows screenshot. `output/ui-review.json` records automated UI checks. `playwright-report/` contains the latest browser test report. These are generated local artifacts, not source-controlled fixtures.

`output/verification.json` records the repeatable workflow steps; `output/api-verification.json` records HTTP checks and `output/openapi.json` exports the checked API contract. The README links to a backend guide, API guide, acceptance/control matrix, RFP implementation status and automation guide. Local Markdown links are checked automatically. The GitHub Actions file is prepared but has not run on a hosted repository.

## Mobile revision and remote preview

- Phones use only the bottom dock, including touch-device landscape mode. Desktop uses a hamburger drawer with focus containment, focus restoration, Escape and backdrop dismissal.
- Markets use compact rows and six results per page; category/search/sort work across the complete market list. Rules/source, new/saved drafts and developer resources have focused routes. Draft inputs and unfinished order quantity survive switching related views.
- Removed promotional sidebar copy and internal roadmap paragraphs from the main product flow. Full resolution criteria remain available; missing-evidence detail expands on demand.
- The temporary HTTPS tunnel was checked using mobile WebKit: six market rows, bottom-only navigation, trade shortcut, actual quotes/buy/sell, separate rules/source and developer resource navigation passed without page errors. This was browser emulation, not a physical iPhone test.
- Narrow 320px and landscape 844px touch viewports passed navigation/overflow checks. The open desktop drawer also passed an axe scan with zero violations.
- Final browser run: all 48 passed with `npx playwright test --trace off`. An earlier trace-writing attempt exhausted temporary disk space; a prior WebKit-only assertion was updated to accept its native “Load failed” network-error wording. Standard automation retains traces on failure; the final low-disk run disabled trace capture.
- Windows packaging/launch evidence below is from the preceding UI milestone. The native package was not rebuilt for this mobile revision; its next build uses the shared updated interface.

## Audit fixes

- Buy slippage limits are capped at the available balance/API limit; a trade that can afford its actual quote is no longer disabled merely by an optional buffer.
- Failed/stale quotes have a direct Refresh quote control.
- SDK non-JSON gateway failures become readable status-preserving errors.
- Invalid generated AI output is classified as a provider-side 502, with the original draft preserved.
- OpenAPI includes applicable JSON failure contracts and a separate AI access security scheme.
- Install prompt rejection is handled visibly; saved draft disclosures show source and closing time as well as rules.

## Not verified or not implemented

Physical iPhone/Android PWA installation, physical Safari and Firefox rendering, universal GPU/frame-rate behavior, signed Windows installer and automatic updates, production HTTPS hosting, autonomous forecasting agents, third-party data ingestion, native wallet signing, contracts/testnet/mainnet, CLOB/hybrid routing, oracle disputes/settlement/redemption, fiat/KYC/geofencing providers, production developer keys and RFP performance targets.

The glass library’s frosted fallback was exercised in WebKit; physical Safari and Firefox remain untested. All market scenarios and starting probabilities remain labeled sample data. The ledger is a single-process demo SQLite store, not an audited financial system.

## Dark layout refinement

Black remains the theme foundation, with restrained purple and blue radial glows. The desktop drawer now uses readable neutral labels and a subtle active state; appearance tiles use their selected border without an extra checkmark. Featured probability uses a shared grid rather than offset positioning. Six targeted Chromium/mobile Chromium/WebKit checks cover 320–1440px widths, a worst-case 100% probability, drawer contrast and keyboard focus restoration. The 44 route/theme/viewport audit cases reported no overflow, browser errors or accessibility violations. Screenshots include `output/screenshots/dark-refined-sidebar.png` and `output/screenshots/dark-refined-900.png`. Physical phone rendering remains unverified.

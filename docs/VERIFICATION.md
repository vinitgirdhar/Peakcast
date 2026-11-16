# Verification record

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

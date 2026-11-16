# Wildcatter implementation plan

Status: implementation started, milestone 1. Source: `AI_Prediction_Market_Platform_RFP.pdf`, all five pages, reviewed 2026-11-11.

## Product definition

A binary prediction market where users discover events, buy YES/NO shares, understand precisely how outcomes are determined, and follow evidence. AI assists market drafting and evidence gathering. Developers use the same versioned APIs as the first-party clients. The long-term product combines an off-chain exchange with collateralized on-chain settlement and separately operated fiat services.

Confirmed delivery: responsive web, mobile installable PWA, Windows desktop. Working name: Wildcatter. Initial funds are demo credits. Launch jurisdictions are not specified. A PWA is not an App Store/Play Store native application.

## Requirements and delivery map

| RFP requirement                                 | First milestone                                                                                                                   | Subsequent delivery / acceptance                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Retail trading portal                           | Search/category filters, market details/rules, buy/sell demo shares, portfolio and activity                                       | Wallet identity, onboarding, account recovery and accessibility audit                                                                                              |
| Conditional outcome tokens and collateral vault | Separate YES/NO positions in a local demo ledger                                                                                  | Reuse evaluated conditional-token contracts, testnet collateral split/merge/redeem, invariant/fuzz testing, independent audit before mainnet                       |
| Hybrid CLOB/AMM                                 | LMSR demo AMM with changing quotes, slippage bounds and integer microcredit accounting                                            | Price/time CLOB, reservation ledger, cancel/replace, signed orders, replay/recovery and reconciliation; connect independently quoted on-chain AMM after simulation |
| AI market creation                              | Optional server-side structured-output drafting; manual rules template without credentials; private saved drafts                  | Licensed/allowlisted source ingestion, deduplication, eligibility screening, rule linting, model evals, orchestration and queue, bounded auto-publication          |
| Oracle mesh and ambiguity mitigation            | Explicit source, deadline, YES/NO and unavailable-source rules on each market; no fabricated live oracle                          | Timestamped evidence and content hashes, independent collectors, proposal/challenge/dispute/finalize states, on-chain assertion and redemption                     |
| Fiat and noncustodial crypto rails              | No real funds or private wallet keys                                                                                              | Separate fiat entity/service and payment-provider accounts; testnet wallet signing first; KYC/AML, reconciliation, chargeback and sanctions controls               |
| Social sentiment / charts                       | Clearly identified illustrative market fixtures and observed demo trade history                                                   | Licensed news/community ingestion, cited summaries, moderation and manipulation monitoring                                                                         |
| Geofencing / compliance                         | Local demo only; no claim of regulatory eligibility                                                                               | Counsel-approved country/product policy, edge geolocation plus identity/sanctions controls, auditable enforcement on APIs and funding services                     |
| Public APIs                                     | `/api/v1`, bearer-authenticated demo accounts, request schemas, OpenAPI, quote/trade/portfolio/draft endpoints, TypeScript client | Scoped/expiring/revocable developer credentials, OAuth/wallet auth, pagination, signed webhooks, WebSocket sequence/replay, usage plans                            |
| App delivery                                    | Shared React UI, PWA manifest/service worker, sandboxed Windows Electron shell                                                    | Signed Windows release/update pipeline; physical device installation tests and cross-platform builds if requested                                                  |
| Hosting                                         | Single-process local development/production build; persistent SQLite                                                              | PostgreSQL event ledger, separate matching and worker processes, container staging, Terraform AWS/Cloudflare, EKS after measured scaling need                      |

## Architecture decisions

- TypeScript across React/Vite client, Fastify API, SDK, tests and desktop entry. One application and one local database reduce operational work while the domain is being validated.
- SQLite via Node's built-in `node:sqlite`, WAL and transactions for demo persistence. Requires Node 22.13+ (22.23+ recommended). This is a single-process prototype, not the institutional ledger or 10,000 TPS architecture.
- Quote and execution share one LMSR calculation. Balances and costs use integer microcredits (1 credit = 1,000,000 units). Share quantities are integers. Trades use a database transaction; maximum buy cost/minimum sell proceeds and account-scoped idempotency protect retries and changed prices.
- Seed markets, starting probabilities and research notes are fixtures, not live prices or investment forecasts. Price history starts with the fixture baseline and then records actual demo fills; no synthetic historical candles.
- Browser and desktop consume the API; no hidden client-only trading state. Demo bearer credentials are random, hashed at rest, expire, and cannot read another account's portfolio. Self-service demo sessions are deliberately unlimited-credit onboarding, not production identity.
- Desktop bundles the built UI and local API, binds only to loopback on port 43127 (a stable origin preserves the desktop session), stores data under the OS application-data directory, denies renderer Node access, permissions, popups and external navigation. Startup reports an error if the port is occupied.
- PWA caches only the application shell, never balances, authenticated requests or quotes. Offline trading fails visibly. Hosting on a phone requires HTTPS; localhost is sufficient on the development computer.
- AI output is untrusted input: structured schema plus server validation; no source URL fetching, execution, publication, trading or settlement authority. Credentials are server environment variables. The unconfigured path is explicitly a manual template, never presented as AI.

## Market lifecycle and finality

Target states: draft -> policy review -> open -> closed -> resolution proposed -> challenge period -> disputed or finalized -> redeemable. Canceled/invalid markets require a published refund rule. Store rule version and evidence hashes before trading; never let a model rewrite rules after positions exist.

Source detection within 60 seconds and legally/economically final settlement are different service objectives. Oracle disputes, publication delays, data revisions, chain finality and outages can prevent instant final settlement. Confidence is evidence metadata, not permission to bypass dispute rules. Cryptographic hashes prove content integrity, not truth.

For hybrid routing, the sequencer reserves off-chain orders against a single balance authority. A router must compare executable, fee-inclusive CLOB and AMM quotes against user limits; record pending chain settlement separately from confirmed fills; use nonces/expiry/cancel and finality-aware reconciliation. Do not count unconfirmed AMM state as immediately spendable collateral. Model adverse selection, MEV and reorgs before production routing; no claim that synchronization eliminates front-running.

## Milestones in order

1. **Working local foundation (current).** Requirements/research, responsive market explorer and detail screen, persistent demo AMM and portfolio, public APIs/OpenAPI/SDK, private draft workbench with optional real AI integration, installable PWA and runnable/bundled Windows application. Verify accounting, auth isolation, validation, idempotency, stale quotes, database restart, browser flows and app build.
2. **Exchange correctness.** Append-only double-entry ledger and reconciliation; price-time CLOB; collateral reservations; cancel/replace, partial fills, fair AMM routing; concurrency, crash/replay and conservation tests. Benchmark p50/p95/p99 and load with an explicit hardware/workload definition.
3. **Testnet decentralized settlement.** Network ADR, audited dependency evaluation, collateral/token contracts and indexer, wallet authentication/signatures, invariant tests, oracle proposal/challenge/finalize and redeem flows. No mainnet funds.
4. **AI and evidence services.** Source connectors, licensing, job queue and orchestration, grounded generation, ambiguity eval suite, provenance and adversarial input tests. Publish only when policy and deterministic rules pass; unresolved cases go to review/dispute.
5. **Retail and developer platform.** Production identity, delegated developer keys, streaming market data, API quotas/revocation, alerts, community/moderation, KYC and jurisdiction policy; separate payment integration sandbox.
6. **Staging, audit and launch.** Docker/IaC, backups and restore drills, observability, penetration/contract audits, independent legal/compliance approval, calibrated capacity tests, signed app distribution and device testing. Mainnet and real-money enablement are a separate launch decision.

## Performance targets to validate, not guarantees

| RFP target        | Measurement / dependency                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Matching <15ms    | Matching-core p99 separately from network and settlement; workload, order mix and recovery defined                          |
| 150+ markets/day  | Qualified, deduplicated, policy/rule-valid drafts; measure acceptance and ambiguity failure rates, not raw generation       |
| Resolution <60s   | Primary-source detection/proposal latency separately from challenge period and finality                                     |
| 10,000+ TPS       | Distinguish order ingress, matched fills, batched settlements and confirmed chain transactions                              |
| Gas <$0.001/trade | Measured on selected chain with realistic gas/token price, batching and data-availability cost; cannot be fixed universally |
| Geofence <100ms   | Edge decision p99, cache/version behavior, fail-closed policy and identity checks measured separately                       |

## Initial change surface and risks

New code only: package/config/lockfile, shared API types/client, API/database/AMM/draft modules, fixtures, web UI/styles/PWA assets, desktop entry/packaging, tests and documentation. No existing callers or user data are being replaced. Tests must cover the same quote/trade path used by UI and SDK. Seed data is inserted only when no markets exist; startup must never reset balances.

Open product decisions: launch jurisdictions, operator/entity and regulated partners, chain/collateral, custody model, source licensing, fees, liquidity funding, dispute windows, identity/recovery and paid AI provider/model budget. These do not block demo implementation. They do block claims of real-money launch readiness.

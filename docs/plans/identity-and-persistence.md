# Identity and persistence

**Recommendation.** Make hosted data durable first, cheaply, and keep SQLite.

- **Phase 1, about $7.25/month, about 2 dev-days.** Move the API service from Render's free plan to the smallest paid instance (`0.5c-512mb`, $7/month) with a 1 GB persistent disk ($0.25/month). Stream the database continuously to Cloudflare R2 with Litestream; at this size R2 is free. This keeps synchronous `DatabaseSync`, the desktop's embedded database and every test unchanged.
- **Phase 2, about 6–8 dev-days, $0 plus a domain.** Add real accounts with emailed one-time codes and links through Resend's free tier. Signing in **claims** the current anonymous demo account. Add per-device sessions.
- **Phase 3.** Google sign-in on the web, passkeys, and a desktop "remote mode" with a browser hand-off for the Windows and Android shells.
- **Do not move to Postgres now.** It means rewriting 62 SQL statements and every request handler around an async driver, plus a second storage engine for the desktop. That is about 8–12 dev-days and $6–25/month more, with no benefit until the API needs more than one instance.

Status: plan for batch 2, written 2026-11-22 against `main` at `4a021de`. Prices and docs were checked on 2026-11-22; see [Sources](#sources-checked-2026-11-22).

## What exists today

| Area            | Current behaviour (code)                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity        | `POST /sessions` → `Store.createSession` inserts an `accounts` row (`id`, `token_hash`, `balance_micros`, `expires_at` +30 days). One bearer per account, with no email and no recovery.                                                |
| Browser storage | The token is kept in `localStorage["wildcatter.demo.token.v1"]` (`src/App.tsx`). On a 401, the app silently creates a **new** account. `docs/BACKEND.md` calls localStorage a documented demo shortcut.                                 |
| Hosted storage  | `render.yaml` uses `plan: free`. The SQLite file and `data/providers/*.json` (AI provider overrides from `server/provider-settings.ts`) sit on an ephemeral filesystem and are lost on deploy, restart or the 15-minute idle spin-down. |
| Desktop         | `desktop/main.mjs` runs its own Fastify instance on `127.0.0.1:43127` with `%APPDATA%/wildcatter/wildcatter.sqlite`. It never talks to the hosted API.                                                                                  |
| Android         | `android/MainActivity.java` is a plain `WebView` on the hosted origin. Off-origin links open the system browser.                                                                                                                        |
| SQLite usage    | `node:sqlite` `DatabaseSync`, WAL, `busy_timeout=5000`, and `BEGIN IMMEDIATE` in `Store.transaction`, `trade` and `launchDraft`. These serialise every writer, which is what keeps LMSR state consistent.                               |

## Part B: durable hosted data (do first)

| Option                                      | Monthly cost (2026-11-22)                                                                          | Effort      | What can still be lost                                                           | Main risks                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Status quo (free, ephemeral)             | $0                                                                                                 | 0           | Everything, on every deploy, restart or idle spin-down                           | Teams and accounts are impossible                                                                                                                                                                                                                                                                                    |
| B. Litestream on the **free** instance → R2 | $0 (R2 free tier)                                                                                  | 1.5 d       | About 1 s on a crash, and **writes to the old instance during a deploy overlap** | Without a disk, Render deploys start the new instance before stopping the old one, so two processes replicate the same path. Litestream warns that this can make restores impossible. Every cold start restores first, which slows the already slow wake-up. Whether idle spin-down sends SIGTERM is not documented. |
| C. Paid instance + persistent disk          | $7 + $0.25/GB → **$7.25** for 1 GB                                                                 | 0.5 d       | Disk loss beyond Render's daily snapshot (kept 7 days)                           | A disk disables zero-downtime deploys (a few seconds of outage) and limits the service to one instance. Render advises logical backups rather than snapshot restores for self-managed databases.                                                                                                                     |
| **D. C + Litestream → R2 (recommended)**    | **≈ $7.25** (R2 free up to 10 GB-month, 1M Class A and 10M Class B operations)                     | 1.5–2 d     | About 1–10 s, off-site, with point-in-time restore                               | The R2 credential is a new secret; restore drills need discipline                                                                                                                                                                                                                                                    |
| E. Render Postgres                          | $7 web + $6 (`0.1c-256mb`) + $0.30/GB storage ≈ **$13.30+**; 3-day point-in-time recovery on Hobby | 8–12 d port | Small                                                                            | An async rewrite (below); the desktop still needs SQLite, so two storage engines. The free Postgres plan expires after 30 days and has no backups.                                                                                                                                                                   |
| F. Neon (serverless Postgres)               | $7 web + usage ($0.106/CU-hour, $0.35/GB-month); free tier 100 CU-hours and 1 GB per project       | 8–12 d      | Small (free tier: 6 h history)                                                   | Same port; scales to zero after 5 minutes, so cold queries add latency; a network hop from Render to the database                                                                                                                                                                                                    |
| G. Supabase                                 | $7 web + $25 Pro (free projects pause after 1 week of inactivity)                                  | 8–12 d      | Daily backups, kept 7 days                                                       | Same port, plus a pull toward adopting its auth                                                                                                                                                                                                                                                                      |

### Phase 1 design (option D)

- **`render.yaml`, API service:**
  - `plan: 0.5c-512mb` (the plan id in Render's current Blueprint spec; the pricing page lists it as "Less than 1 CPU, 512 MB, $7/month").
  - `disk: {name: wildcatter-data, mountPath: /var/data, sizeGB: 1}`.
  - Environment: `DATABASE_PATH=/var/data/wildcatter.sqlite`, `AI_SETTINGS_DIR=/var/data/providers`, and the Litestream R2 variables with `sync: false`.
  - Leave the static welcome site on its free plan.
- **Litestream v0.5.18** (released 2026-11-03). The build step downloads `litestream-0.5.18-linux-x86_64.tar.gz` and verifies it against the release's `checksums.txt` before unpacking into `./bin` (gitignored).
- **Start command:** `./bin/litestream replicate -config litestream.yml -restore-if-db-not-exists -exec "node dist-server/server/index.js"`. Litestream runs the server as a child and exits with it. If the disk is ever lost, the next boot restores from R2.
- **`litestream.yml`:**
  - one database, `/var/data/wildcatter.sqlite`;
  - one S3 replica pointing at the R2 endpoint `<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto` (Litestream auto-detects R2 settings);
  - a snapshot interval of `1h`, so restores stay short;
  - credentials from environment variables.
- **Upload rate.** By default Litestream ships changes every second. Bound the replica sync interval to about 10 s, so continuous writes cost at most about 260k Class A operations a month, inside R2's 1M free tier. Even unbounded, 2.6M operations would cost about $7.20/month.
- **SQLite settings already match the Litestream tips:** WAL mode, `busy_timeout=5000`, `foreign_keys=ON`. Keep the app's automatic checkpoints at their default; the tips only suggest disabling them at tens of thousands of writes per second.
- **Restore drill**, a new `scripts/restore-drill.mjs`, run monthly and before each release. It runs `litestream restore -o <temp> <db>`, opens the result with `node:sqlite`, runs `PRAGMA integrity_check`, and compares row counts per table with the live API's counts. Document it in `docs/BACKEND.md`, which currently says backups are not implemented.
- **Shutdown.** Render sends SIGTERM and allows 30 s by default; services with a disk cannot change that delay. On a shutdown signal, Litestream syncs outstanding WAL changes before exiting.
- **Bandwidth.** The Hobby workspace includes 5 GB of outbound transfer a month, then $0.15/GB. The 7.9 MB product film alone uses that up in about 640 plays. Consider serving it from the static site or R2 (product owner decision).

### Cost of moving to Postgres (when, not if, it is needed)

| Item           | Today                                                                                                                               | Postgres work                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver         | Synchronous `DatabaseSync`; every `Store` method returns a value                                                                    | `pg` 8.23 (async). Every `Store` and module function and every route handler becomes `async`, including `matchOrders` loops, the `settleDue` sweep and `marketActor` from the Teams plan  |
| SQL call sites | 62 `.prepare(` calls: `database.ts` 37, `orders.ts` 8, `community.ts` 6, `notifications.ts` 5, `engagement.ts` 4, `resolution.ts` 2 | Rewrite parameters `?` → `$n`; `json_extract` → `->>`; `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`; 10 `rowid` orderings need explicit serial columns; JSON in `TEXT` columns → `jsonb` |
| Concurrency    | `BEGIN IMMEDIATE` serialises writers, so a quote and its trade cannot interleave                                                    | `SELECT … FOR UPDATE` on the market and account rows inside each trade, launch and payout; serialization-failure retries; new race tests                                                  |
| Migrations     | `CREATE TABLE IF NOT EXISTS` plus the `PRAGMA table_info` ALTER loop                                                                | A migration runner and ordered files                                                                                                                                                      |
| Tests          | 19 references to `:memory:` stores; the suite runs with no services                                                                 | PGlite or a Postgres service in CI; slower suite                                                                                                                                          |
| Desktop        | Embedded SQLite                                                                                                                     | Keep SQLite there, which means two engines behind one interface, or ship Postgres in the Windows app (no)                                                                                 |

Triggers to revisit: more than one API instance needed for load, a write rate SQLite cannot sustain on one disk, or a managed-compliance requirement. `node:sqlite` is "Release candidate" (stability 1.2) in the Node 26 docs, where `DatabaseSync` is a deprecated alias of `Database` (DEP0210). That is a rename at the next Node major, not a reason to migrate.

## Part A: real accounts that survive

| Method                                    | Cost                                                        | Server effort | Web | Android WebView shell                                                                                                         | Windows (Electron)                                                                                      | Risks                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------- | ------------- | --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Email one-time link + 6-digit code**    | Resend free: 3,000/month, 100/day; Pro $20/month for 50,000 | 3–4 d         | yes | Yes, by typing the code (the link opens the system browser)                                                                   | Yes, by code                                                                                            | Deliverability needs an owned sending domain (SPF/DKIM); account enumeration and abuse are handled by identical responses and rate limits                  |
| Google sign-in (OpenID Connect code flow) | Free                                                        | 2–3 d         | yes | **No inside the WebView**: Google blocks embedded webviews (`disallowed_useragent`). Needs the system-browser hand-off below. | System browser plus hand-off                                                                            | Showing the app name and logo needs brand verification: a homepage and privacy policy on a **verified owned domain**. Users are keyed on `sub`, not email. |
| Passkeys (WebAuthn)                       | Free; `@simplewebauthn/server` 14.1.0 (MIT, Node 22+)       | 3 d           | yes | Defer: WebView passkeys need extra androidx.webkit work                                                                       | Only in remote mode, because the RP ID must match the hosted domain and a loopback origin cannot use it | Needs email as the recovery path; adds two dependencies (server and browser packages)                                                                      |
| Stay anonymous only                       | 0                                                           | 0             | —   | —                                                                                                                             | —                                                                                                       | Accounts and workspaces are lost when storage is cleared or the 30-day expiry passes                                                                       |

### Phase 2 design: accounts, claim, sessions

Schema, startup-safe, in the `Store` constructor:

```sql
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE COLLATE NOCASE, google_sub TEXT UNIQUE, created_at TEXT NOT NULL, adult_confirmed_at TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), label TEXT, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS login_codes (id TEXT PRIMARY KEY, email TEXT NOT NULL, link_hash TEXT NOT NULL UNIQUE, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
-- ALTER loop: accounts.user_id TEXT REFERENCES users(id); after the loop:
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user ON accounts(user_id) WHERE user_id IS NOT NULL;
```

If Teams has not landed first, change `Store.createSession`'s positional `INSERT INTO accounts VALUES (?,?,?,?)` to an explicit column list. Once a column is added it fails.

| Step                    | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start                   | `POST /auth/email/start {email}` always returns 202 `{sent: true}`, so it never reveals whether an account exists. It emails a link `https://<host>/auth#<64 hex>` (the token is in the fragment, out of server logs) and a 6-digit code, valid for 15 minutes. Limits: 3 per email per 15 minutes, 10 per IP per hour. Email is sent by `fetch` to Resend's HTTPS API from a small `server/email.ts`, injectable through `buildApp` options for tests (no SDK dependency). |
| Verify                  | `POST /auth/email/verify {link}` or `{email, code}`, sent with the current anonymous bearer if one exists. Five wrong codes burn the row. Responds `{token, expiresAt, email}` and creates a `sessions` row.                                                                                                                                                                                                                                                                |
| Claim (new email)       | When the email has no user yet and the caller's account has no `user_id`, link that account to the new user. It keeps its balance, positions, drafts and Teams memberships. No credits are created.                                                                                                                                                                                                                                                                         |
| Sign in (existing user) | The session goes to the user's existing account. This device's anonymous account is **not merged**; it simply expires. The UI warns first ("This device's demo progress will not move to your account"). Merging would let people farm 10,000-credit accounts into one.                                                                                                                                                                                                     |
| Sessions                | `Store.account(token)` looks in `sessions` first, then falls back to the legacy `accounts.token_hash`, so existing tokens keep working until they expire. Claimed accounts get a 90-day sliding expiry (`last_seen_at` refreshed at most once a day); anonymous accounts keep 30 days. Routes: `DELETE /auth/session`; `DELETE /auth/sessions` signs out everywhere.                                                                                                        |
| Erasure                 | `POST /auth/delete` clears `email` and `google_sub`, sets `deleted_at`, deletes sessions and unlinks the account. Ledger, trades and positions stay under the existing hash alias, because other people's payouts and the credit-conservation guarantee depend on them. Workspace display names become "Former member".                                                                                                                                                     |
| Age                     | Sign-up requires "I am 18 or older" (`adult_confirmed_at`). See [Privacy and DPDP](#privacy-and-the-dpdp-act-2023).                                                                                                                                                                                                                                                                                                                                                         |
| UI                      | A sign-in sheet (new `src/pages/SignIn.tsx`); an Account section in `src/pages/Settings.tsx` (email, sessions, sign out, delete); `/auth#…` handling in `src/App.tsx`. Anonymous play remains the default.                                                                                                                                                                                                                                                                  |

Phase 2b, about 2 days: move the **web** app's session to an `HttpOnly; Secure; SameSite=Lax` cookie, parsed by hand without a new dependency. Require a matching `Origin` on cookie-authenticated non-GET requests; the `onRequest` hook in `server/app.ts` already rejects a mismatched one. Keep bearer tokens for the SDK, with a "Create API token" control on the Developers page backed by labelled `sessions` rows. This removes the documented localStorage XSS exposure once accounts hold email addresses.

### Phase 3: Google, passkeys, shells

- **Google (web).** `GET /auth/google/start` → `state`, `nonce` and PKCE S256. `GET /auth/google/callback` exchanges the code at `https://oauth2.googleapis.com/token` with the client secret. Because the ID token arrives directly from the token endpoint over TLS, OpenID Connect Core §3.1.3.7 and Google's guide allow checking `iss`, `aud`, `exp` and `nonce` without a JWKS signature library. Key users on `sub`, and link to an email user only when `email_verified` is true. The callback redirects to `/auth#handoff=<one-time code>`, and the single-page app exchanges that code, with its anonymous bearer for claim, through `POST /auth/handoff`.
- **Shell hand-off (Android WebView, Windows).**
  1. The shell calls `POST /auth/pending` and gets `{id, pollSecret}`.
  2. It opens `/auth/google/start?pending=<id>` in the system browser.
  3. The callback marks the pending row complete.
  4. The shell polls `POST /auth/pending/poll {id, pollSecret}` and receives the session.
  - About 2 days, and it works for any future provider.
- **Passkeys.** `@simplewebauthn/server` and `@simplewebauthn/browser`. Store credential id, public key, counter and transports in a `passkeys` table. RP ID is the custom domain. Registration is offered only to signed-in users.
- **Desktop and hosted:**

| Option                | What it means                                                                                                                                                                                                                                                                                             | Effort | Verdict                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Keep separate (today) | The local workspace is offline practice                                                                                                                                                                                                                                                                   | 0      | Default                                                    |
| **Remote mode**       | "Use my online account" points the window at the hosted origin. `desktop/main.mjs` allows exactly that origin in `will-navigate` and the permission handlers, keeps the `X-AI-Access-Token` injection loopback-only, and signs in with email code or Google hand-off. Local mode stays available offline. | 2–3 d  | **Recommended** (phase 3)                                  |
| One-way export        | The CSV statement already exists; importing it into the hosted service would mint credits                                                                                                                                                                                                                 | 0      | No import                                                  |
| Two-way sync          | Merging two ledgers                                                                                                                                                                                                                                                                                       | Weeks  | **Reject**: breaks conservation and enables credit farming |

## Effort and cost summary

| Phase                                        | Dev-days | Added monthly cost                                   | Depends on                                   |
| -------------------------------------------- | -------- | ---------------------------------------------------- | -------------------------------------------- |
| 1. Disk + Litestream → R2                    | 2        | ≈ $7.25                                              | Render billing, R2 account                   |
| 2a. Email accounts, claim, sessions, erasure | 6        | $0 (Resend free) → $20 at more than 100 emails a day | Custom domain, Resend                        |
| 2b. Web cookie sessions + API tokens page    | 2        | $0                                                   | 2a                                           |
| 3a. Google sign-in (web)                     | 2–3      | $0                                                   | Domain, Google Cloud project, privacy policy |
| 3b. Passkeys (web)                           | 3        | $0                                                   | 2a, domain                                   |
| 3c. Shell hand-off + desktop remote mode     | 4        | $0                                                   | 3a                                           |
| Postgres port (not recommended now)          | 8–12     | +$6 to +$25 and up                                   | —                                            |

Files: phase 1 touches `render.yaml`, a new `litestream.yml`, a new `scripts/restore-drill.mjs`, `.gitignore`, `docs/BACKEND.md` and `README.md` (Deployment). Phase 2a adds `server/auth.ts`, `server/email.ts`, `tests/auth.test.ts` and `tests/e2e/sign-in.spec.ts`, and edits `server/database.ts`, `server/app.ts`, `server/schemas.ts`, `shared/types.ts`, `shared/client.ts`, `src/App.tsx`, `src/pages/Settings.tsx`, `src/pages/SignIn.tsx` (new) and `docs/API.md`.

Acceptance:

- **Phase 1:** a deploy and a manual restart keep accounts and trades; a restore drill from R2 passes `integrity_check` with matching row counts; provider settings survive a restart.
- **Phase 2:** an anonymous user claims their account and keeps their balance; a second device signs in to the same account; sign-out-everywhere revokes all tokens; legacy tokens still work; erasure removes email and Google id while the credit-conservation tests still pass; email start never reveals whether an account exists.

## Privacy and the DPDP Act, 2023

This is not legal advice. Counsel must confirm everything here.

- **Timing.** The DPDP Rules were notified on 13/14 November 2025 (G.S.R. 846(E)). Most obligations (Rules 3, 5–16, 22 and 23) apply 18 months after publication, around May 2027. Build to them now.
- **Notice (Rule 3).** A clear, standalone notice: what data, why, contact details, and how to withdraw consent, complain and exercise rights. Google brand verification needs a privacy policy on an owned domain anyway.
- **Security and logs (Rule 6, Rule 8).** Reasonable safeguards: encryption, access control, logging, backups. Keep logs for at least one year. Note that Fastify request logs (`logger: true` in `server/index.ts`) record client IPs to Render's log stream.
- **Breach (Rule 7).** Tell the Board without delay and send a detailed report within 72 hours. Tell affected users without delay. The plan needs a runbook and contact list.
- **Erasure (Rule 8).** Erase data once its purpose ends; give 48 hours' notice before deleting for that reason. The product owner must set an inactive-account retention period.
- **Children (Act §2(f), §9).** Under 18 means verifiable parental consent and no tracking or behavioural monitoring. Leaderboards and calibration scores are arguably behavioural profiling. Hence the 18+ declaration, and Teams is not marketed to schools; for college clubs, organisers confirm members are adults.
- **Processors.** Render (choose the region at creation; Singapore is nearest India), Cloudflare (R2), Resend and Google. Record them in the privacy policy. Cross-border transfer is allowed unless the government restricts a country (§16).
- **Data held.** Email, Google `sub`, workspace display names, session metadata. No phone, no government ID, no payment data (play money only).

## Product owner decisions

1. **Approve paid hosting:** Render `0.5c-512mb` plus a 1 GB disk (≈ $7.25/month), with a payment method on the Render workspace, and choose the region.
2. **Create a Cloudflare account and R2 bucket** (free tier; Cloudflare may require a payment method on file) and a bucket-scoped API token. Decide the storage jurisdiction: default or EU; there is no India option.
3. **Buy a custom domain** (registrar price not researched; typically $10–20/year), needed for the email sending domain, Google brand verification and passkeys. Move the demo to it.
4. **Email provider:** Resend (recommended) or Amazon SES ($0.10 per 1,000 emails; new-account sandbox limits), plus the sender address and the DNS records (SPF, DKIM).
5. **Google Cloud project ownership**, the OAuth client ID and secret, the consent-screen name, and brand verification.
6. **Privacy policy and terms**, including a grievance contact, the 18+ policy, retention periods for inactive accounts and logs, erasure behaviour (ledger kept under an alias), and the processor list. Counsel review under DPDP and India's 2025 online gaming law (credits never purchasable or redeemable).
7. Keep anonymous play as the default (recommended), and accept "no merging" of anonymous progress into an existing account.
8. Whether to move the product film off the API origin to avoid bandwidth overage.

## Sources (checked 2026-11-22)

- Render pricing (instances, disk $0.25/GB, Postgres plans, workspace plans): https://render.com/pricing.md
- Render free tier (15-minute spin-down, ephemeral filesystem, free Postgres expires after 30 days): https://render.com/docs/free
- Render persistent disks (paid only, no zero-downtime deploys, single instance, daily snapshots kept 7 days): https://render.com/docs/disks
- Render deploys and shutdown (SIGTERM, 30 s default delay): https://render.com/docs/deploys
- Render Blueprint spec (plan ids such as `0.5c-512mb`, `disk.sizeGB`): https://render.com/docs/blueprint-spec
- Render outbound bandwidth (Hobby 5 GB, then $0.15/GB): https://render.com/docs/outbound-bandwidth
- Litestream overview and v0.5 status: https://litestream.io/
- Litestream tips (WAL, busy_timeout, checkpoints, 1 s replication, sync on shutdown): https://litestream.io/tips/
- Litestream S3-compatible providers (R2 endpoint, B2): https://litestream.io/guides/s3-compatible/
- Litestream `replicate` (`-exec`, `-restore-if-db-not-exists`): https://litestream.io/reference/replicate/
- Litestream `restore` (`-o`, `-timestamp`): https://litestream.io/reference/restore/
- Litestream v0.5.18 release, published 2026-11-03: https://github.com/benbjohnson/litestream/releases/tag/v0.5.18
- Cloudflare R2 pricing ($0.015/GB-month; free 10 GB, 1M Class A, 10M Class B; free egress): https://developers.cloudflare.com/r2/pricing/
- Backblaze B2 pricing ($6.95/TB/month, first 10 GB free): https://www.backblaze.com/cloud-storage/pricing
- Neon pricing: https://neon.com/pricing
- Supabase pricing: https://supabase.com/pricing
- Resend pricing: https://resend.com/pricing
- Amazon SES pricing: https://aws.amazon.com/ses/pricing/
- Google OAuth verification for non-sensitive scopes and brand verification: https://support.google.com/cloud/answer/13463073 and https://support.google.com/cloud/answer/13464321
- Google OpenID Connect (token endpoint, claims, `sub`, `state`): https://developers.google.com/identity/openid-connect/openid-connect
- OpenID Connect Core §3.1.3.7: https://openid.net/specs/openid-connect-core-1_0.html
- Google blocks OAuth in embedded webviews: https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
- SimpleWebAuthn server docs: https://simplewebauthn.dev/docs/packages/server (version 14.1.0 from `npm view`, 2026-11-22)
- Node.js `node:sqlite` (Release candidate, `Database`/`DatabaseSync` alias, `backup()` since v22.16.0): https://nodejs.org/api/sqlite.html
- DPDP Rules 2025 summary (commencement, Rules 3, 6, 7, 8, 10): https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/
- DPDP Rule 7 text (72-hour detailed report): https://www.dpdpa.com/dpdparules/rule7.html
- DPDP Act §9 (children): https://dpdpa.com/dpdpa2023/chapter-2/section9.html

# Onboarding, Playground mode and Play Store release

Status: plan written 2026-11-25. Phase 1 is built in this change; later phases are proposals.

## Goal

1. Replace the silent demo session with a real onboarding flow.
2. Every new account starts with **5,000 practice credits** (was 10,000).
3. A **Playground mode** switch in Settings. On: practice credits. Off: real money.
4. Ship the Android app on Google Play without a policy rejection.
5. Make web and mobile feel faster and smoother.

## The hard constraint: real money

Turning Playground mode off means users stake real money on future events. Legally and on Google Play that is **real-money gambling** (or, in the US, a regulated event-contract exchange). It cannot be switched on by code alone.

| Requirement                | Why                                                                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A licence per country      | India's Promotion and Regulation of Online Gaming Act, 2025 prohibits online money games, their payments and their ads. In the US, event contracts need CFTC registration (as Kalshi has). Most other countries need a gambling licence.                                       |
| Google Play approval       | Real-money gambling apps need an approved application, a licence for each target country, an age gate, geofencing, and must not be rated or marketed for minors. An app that adds real-money betting without that approval is removed and the developer account can be closed. |
| KYC and AML                | Identity checks before deposit, transaction monitoring, withdrawal limits.                                                                                                                                                                                                    |
| A licensed payment partner | Payment providers refuse gambling deposits without the licence.                                                                                                                                                                                                               |
| Lawyer sign-off            | On terms, risk disclosures and geography.                                                                                                                                                                                                                                     |

**Decision built into Phase 1:** the Playground switch exists and is enforced by the server, but real-money mode stays **unavailable** (`REAL_MONEY_ENABLED` is not set). Turning it off explains why and changes nothing. This is the version that passes Play review as a _simulated_ prediction game. Real money is Phase 4, after the items above exist.

## Phase 1 (built now)

### Onboarding

- First launch, with no saved account, shows a four-step flow instead of silently creating a demo account:
  1. **Welcome:** what Wildcatter is.
  2. **How it works:** YES/NO prices as probabilities, trading, resolution and disputes.
  3. **Playground:** 5,000 practice credits with no cash value, and that you cannot buy them.
  4. **Profile and consent:** display name, an 18+ confirmation, and agreement to the Terms and Privacy Policy, with links to both.
- On finish, the app creates the account and records the consent (`terms_version`, `terms_accepted_at`, `adult_confirmed_at`) on the server.
- Existing accounts that never gave consent see step 4 once.
- Motion: steps slide and fade, progress dots, and full keyboard and reduced-motion support.

### Credits

- `STARTING_CREDITS = 5,000`, in one constant.
- `accounts.starting_micros` stores each account's own grant, so profit and loss and leaderboards stay correct for older 10,000-credit accounts.

### Account API

| Endpoint                     | Purpose                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/account`        | Profile, consent state, Playground state, starting grant, whether real money is available.                 |
| `PUT /api/v1/account`        | Set the display name and record consent (both confirmations required).                                     |
| `PUT /api/v1/account/mode`   | `{ playground }`. Turning it off returns 409 until real money is licensed and enabled.                     |
| `DELETE /api/v1/account`     | Deletes the account. Required by Google Play for any app that creates accounts.                           |

Deletion removes drafts, comments, the watchlist and notifications. It cancels open orders, leaves workspaces, clears the profile and revokes the token. Trades, positions and ledger rows stay, without the profile, because other traders' prices and payouts depend on them. The Privacy Policy states this.

### Legal and help pages

- `/terms`, `/privacy`, `/help` (FAQ) and `/delete-account`. They are public, need no account, and are linked from onboarding, Settings and the landing page.
- `/privacy` and `/delete-account` are the URLs to enter in the Play Console.
- The pages are written for a simulated, no-cash game. **Have a lawyer review them before launch**; they are drafts, not legal advice.

### Settings

- A new **Account** section: display name, the Playground switch, links to the legal pages, and Delete account (confirmation required).

### Android

| Item                    | Change                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Target API              | 35 → **36**. Google Play requires API 36 for new apps and updates from 31 Aug 2026.                                             |
| Edge-to-edge            | Enforced from API 35. The WebView now pads itself by the system-bar and cutout insets, so content no longer sits under the status bar. |
| Predictive back         | `OnBackInvokedCallback` on API 33+, and `enableOnBackInvokedCallback` set.                                                      |
| Offline                 | A native "You're offline" screen with Retry instead of the WebView error page.                                                 |
| Play format             | `build-android.ps1 -Bundle` builds a signed **.aab** with bundletool (Play does not accept APKs for new apps).                 |
| Signing                 | The upload key comes from environment variables. The demo key stays for local APK testing only.                                |
| Version                 | `versionCode 4`, `versionName 1.2.0`.                                                                                          |

### Smoothness (first pass)

- Page changes no longer wait for the old page to fade out, which removes a blank gap of about 120 ms on every navigation.
- The onboarding flow uses the same motion curve as the rest of the app.

## Phase 2: accounts that survive (from `identity-and-persistence.md`)

- Durable hosted storage (Render disk and Litestream to R2), about $7.25/month.
- Email one-time-code sign-in that claims the anonymous account, plus sign-in on other devices.
- Google sign-in on Android.

Without this, a reinstalled app or a cleared browser loses the account. That is acceptable for a practice game, but Phase 4 depends on it.

## Phase 3: Play Store listing (needs the developer account owner)

- Google Play developer account ($25). **New personal accounts must run a closed test with at least 12 testers for 14 days** before production access.
- Store listing: a 512×512 icon, a 1024×500 feature graphic, at least 2 phone screenshots, and short and full descriptions that say "practice credits, no real money".
- Content rating questionnaire: answer **yes** to simulated gambling. Expect an 18+ / Mature rating; target audience 18+.
- Data safety form: collects a display name and app activity (trades, comments); no location, contacts or ads ID; data encrypted in transit; deletion available at `/delete-account`. Draft text sent to the configured AI provider (Gemini, Groq or OpenAI) counts as **shared** user content: declare it.
- Replace the placeholder contact `support@wildcatter.app` in `src/pages/Legal.tsx` with a real, monitored address, and use the same one as the Play developer contact.
- Deploy this build to the hosted API before submitting: the Android app loads the hosted site, so onboarding and the legal pages only exist in the app once they are live there.
- App access: no login needed.
- Ads: none.

## Phase 4: real money (blocked on legal)

Only after a licence, Play approval for real-money gambling in the target countries, a KYC provider and a licensed payment partner:

- A separate real-money wallet per account, with no transfers between practice and real balances.
- Deposits, withdrawals, KYC status, limits, self-exclusion and responsible-play tools.
- Geofencing by verified location.
- Separate markets or ledgers per currency, so practice trades never move real prices.
- Then set `REAL_MONEY_ENABLED=1` in permitted regions only.

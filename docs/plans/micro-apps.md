# Micro apps

**Recommendation.** Add a "Micro apps" hub at `/apps` with three small forecasting tools, each at `/apps/<id>`:

1. **Forecast journal** (`journal`). Write down your probability for a Peakcast market or any real-world question, update it over time, and get scored (Brier, log score, calibration, skill against the crowd) when it resolves. This is the habit the research says matters most: forecast often, update, and keep score.
2. **Stake sizer** (`sizer`). Kelly sizing for a binary market. You give your belief, the price and the fee, and it says which side has an edge, the Kelly fraction, a fractional-Kelly stake in practice credits and the expected value. An on-device quote then checks whether the edge survives price impact. It is labelled as an educational tool for practice credits, never advice.
3. **Evidence updater** (`bayes`). Bayes' rule in odds form. Start from a prior (or the market's price), add evidence as likelihood ratios, and see the posterior step by step in percent, odds and bits. It includes a converter between percent, decimal, American and fractional odds, "1 in N" and bits.

Each app follows the same pattern used by Telegram Mini Apps, WeChat mini programs and Raycast extensions. The host owns routing, chrome, storage, error isolation and the list of apps (the manifest). Each app is one lazily loaded entry component that cannot reach the others. All non-trivial logic lives in a pure module `shared/micro/<id>.ts` that is unit-tested under the existing 80% coverage gate. There are no new npm dependencies, no network calls and no new API routes. State persists in `localStorage` under `peakcast.micro.<id>.v1` and is wiped when the account is deleted.

One orchestrator builds the host first (about 1 dev-day), then three builders work in parallel on disjoint files (about 2 to 2.5 dev-days each).

Status: plan written 2026-11-27 against `main` at `754acd6`.

## Why these three

| Need of someone learning to forecast                                                   | Evidence                                                                                                                                                                                                                                                         | Peakcast today                                                                                                                                                                                                                                                                                                          | Micro app        |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Keep score of explicit probabilities and see your calibration                           | In the Good Judgment Project, frequency of belief updating was among the strongest behavioural predictors of accuracy, and under an hour of probability training improved Brier scores by 6–11% ([Mellers et al. 2015][gjp-psych]; [Chang et al. 2016][gjp-train]). Personal trackers such as Fatebook report a Brier score and a calibration chart from resolved forecasts ([Fatebook launch post][fatebook]). | The Portfolio's accuracy card scores **trades**, size-weighted. Most open markets on a device never resolve: house markets need an operator ruling, and that is switched off in the apps (README, "Resolve"). So most beliefs are never scored. | Forecast journal |
| Turn an edge into a sensible position size                                              | For a binary contract at price _c_, Kelly sizing is _f\* = (p − c)/(1 − c)_. λ-fractional Kelly equals full Kelly with belief _λp + (1 − λ)c_, a hedge against an overconfident _p_ ([Beygelzimer, Langford & Pennock 2012][kelly-pm]; [Wikipedia: Kelly criterion][kelly-wiki]). | The trade panel gives quotes but no guidance on how much to stake                                                                                                                                                                                                                                                      | Stake sizer      |
| Update a number in proportion to the strength of new evidence                           | Odds-form Bayes: posterior odds = prior odds × likelihood ratio. In log-odds, independent pieces of evidence add ([LessWrong wiki: Bayes' rule, log-odds form][bayes-log]).                                                                                      | "Explain this market" says what a price means but cannot model an update                                                                                                                                                                                                                                                | Evidence updater |

The scoring rules are strictly proper: they reward reporting your true belief ([Gneiting & Raftery, technical report][proper]).

**Later candidates (not in this plan):**

- **Calibration quiz.** Timed confidence-interval and true/false questions scored like Open Philanthropy's calibration app ([announcement][openphil]; [Greenberg, scoring rules][greenberg]). It needs a vetted offline question bank of 300 or more items with sources, which is a content project before it is a code project.
- **Fermi estimator.** Multiply factors that each have a 90% interval, combined analytically as lognormals, to get a base-rate-style estimate with a range.

**Rejected:** a base-rate lookup (needs a curated dataset that goes stale offline) and a news or price feed (network).

## The micro-app pattern, applied

| Platform pattern                                                                                                                                                                                                                                                  | Peakcast equivalent                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raycast's manifest lists `commands`, each with its own entry file ([manifest][raycast-manifest], [file structure][raycast-files])                                                                                                                                   | `src/micro/registry.ts` lists `{id, name, tagline, icon, component}`; each app has one entry component                                                                                                             |
| A WeChat mini program "framework manages the entire page routing"; the client is the host environment ([framework][wechat-framework], [host environment][wechat-host]). Telegram Mini Apps run inside the client without an install ([Telegram docs][telegram]). | `MicroHost` owns the `/apps/<id>` route, the back button, the title, Suspense, the error boundary and storage. An app never touches `history`, `App.tsx` or another app's key.                                  |
| The host provides capabilities through an API object (`wx.*`, `Telegram.WebApp`) ([web.dev mini-app overview][webdev-mini])                                                                                                                                        | Props: `client` (read-only use), `markets`, `portfolio`, `navigate`, `onNotice`                                                                                                                                   |

What is deliberately **not** copied: third-party apps, sandboxed iframes, permissions prompts or a store. All three apps are first-party code in the same bundle. `// ponytail: in-bundle registry; add iframe sandboxing only if third-party apps are ever accepted.`

## Host (orchestrator builds this first)

### Contract

```ts
// src/micro/types.ts (no imports from app folders, so builders can import it freely)
import type { PeakcastClient } from "../../shared/client.js";
import type { Market, Portfolio } from "../../shared/types.js";
export interface MicroAppProps {
  /** Same client App uses. Apps may call read-only methods only: markets, market, history, quote, portfolio, calibration. */
  client: PeakcastClient;
  /** App's current public market list (refreshed every 15 s); may be empty. */
  markets: Market[];
  /** Null until loaded or when loading failed. */
  portfolio: Portfolio | null;
  /** In-app navigation, e.g. navigate(`/markets/${id}`). Paths only, no query strings. */
  navigate: (path: string) => void;
  /** Shows the shared toast. */
  onNotice: (text: string) => void;
}

// src/micro/registry.ts
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Calculator, NotebookPen, Scale, type LucideIcon } from "lucide-react";
export interface MicroApp {
  id: string; // /^[a-z][a-z0-9-]{1,23}$/, also the storage id
  name: string; // ≤ 24 chars
  tagline: string; // ≤ 60 chars, shown on the hub card
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType<MicroAppProps>>;
}
export const microApps: readonly MicroApp[] = [
  { id: "journal", name: "Forecast journal", tagline: "Log your probabilities and see how calibrated you are", icon: NotebookPen, component: lazy(() => import("./journal/Journal.js")) },
  { id: "sizer", name: "Stake sizer", tagline: "Kelly sizing for practice credits", icon: Calculator, component: lazy(() => import("./sizer/Sizer.js")) },
  { id: "bayes", name: "Evidence updater", tagline: "Update a probability with Bayes' rule", icon: Scale, component: lazy(() => import("./bayes/Bayes.js")) },
];

// src/micro/storage.ts
export const microKey = (id: string): string => `peakcast.micro.${id}.v1`;
/** JSON-parses the stored value inside try/catch; passes `undefined` to `parse` when missing, corrupt or storage is blocked. */
export function loadMicro<T>(id: string, parse: (raw: unknown) => T): T;
/** False when storage is full or disabled; never throws. */
export function saveMicro(id: string, value: unknown): boolean;
/** Removes every key starting with "peakcast.micro.". Called on account deletion. */
export function clearMicroData(): void;
```

Each app's entry file **default-exports** `function <Name>(props: MicroAppProps)` (needed by `lazy`). Apps validate their own stored data with the `parse…` function in their pure module, so a corrupt or old value never crashes a render.

### Host behaviour

- **Hub `/apps`** (`src/micro/Hub.tsx`). Page header "Micro apps" with the line "Small tools for practising forecasting. Everything stays on this device." Below it, a grid of cards, one `<button>` per registry entry (icon, name, tagline), using `listMotion`/`itemMotion`. The grid has one column under 760px, two from 760px and three from 1100px.
- **App page `/apps/<id>`** (`src/micro/MicroHost.tsx`). A back button labelled "Micro apps" and an `<h1>` with the app's name. Below them, the app wrapped in `<Suspense fallback={<SkeletonRows label="Opening app" />}>` and a class `MicroErrorBoundary`. On an error the boundary shows `EmptyState` "This app could not open." with **Try again**, which re-mounts the boundary by bumping a `key`. One crashing app never takes down the shell.
- **Unknown id:** `EmptyState` "App not found" with the button **All micro apps** (`navigate("/apps")`).
- **`App.tsx`:**
  - Import `Blocks`. Insert `{ path: "/apps", label: "Micro apps", icon: Blocks }` into `navItems` between Draft studio and Settings (`teamsNavItems` keeps working unchanged).
  - `dockItems` filters out `/studio` **and** `/apps`, so the dock keeps exactly four tabs.
  - `const micro = /^\/apps(?:\/([a-z0-9-]+))?$/.exec(path)`. When it matches, `section = "Micro apps"`, the page renders `<MicroHost appId={micro[1]} … />`, and the not-found guard excludes it.
  - `routeKey` stays `path`, so the hub has depth 2 and an app depth 3. On phones an app pushes in from the right, as the other deeper pages do.
  - `signedOut()` calls `clearMicroData()`.
- **`Dock.tsx`:** add a create-sheet action `{ path: "/apps", label: "Micro apps", hint: "Journal, stake sizer, evidence updater", icon: Blocks }` after Saved drafts.
- **`src/micro/micro.css`:** hub grid, cards and the app page frame, using tokens only (`--surface`, `--subtle`, `--ink`, `--muted`, `--border`, `--yes`, `--no`, `--space-*`, `--text-*`, `--radius-card`, `--spring`). Hover lift is disabled under `prefers-reduced-motion: reduce`.
- **`scripts/review-ui.mjs`:** add `/apps`, `/apps/journal`, `/apps/sizer`, `/apps/bayes` to the captured routes (axe, overflow and console checks, light and dark).
- **Docs:** README "What it does" gets a "Practise" subsection with three bullets. `docs/DESIGN.md` gets one line on micro-app layout.

### Ownership (no two people edit the same file)

| Owner        | Creates                                                                                                                                                       | Modifies                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Orchestrator | `src/micro/{types.ts, registry.ts, storage.ts, Hub.tsx, MicroHost.tsx, micro.css}`, stub default exports for the three entry files, `tests/e2e/micro-apps.spec.ts` | `src/App.tsx`, `src/Dock.tsx`, `src/pages/PortfolioExtras.tsx` (one word: `export` on `ReliabilityDiagram`), `scripts/review-ui.mjs`, `README.md`, `docs/DESIGN.md` |
| Journal      | `shared/micro/journal.ts`, `src/micro/journal/{Journal.tsx, journal.css}`, `tests/micro-journal.test.ts`, `tests/e2e/micro-journal.spec.ts`                  | — (replaces its stub)                                                            |
| Sizer        | `shared/micro/sizer.ts`, `src/micro/sizer/{Sizer.tsx, sizer.css}`, `tests/micro-sizer.test.ts`, `tests/e2e/micro-sizer.spec.ts`                              | —                                                                                |
| Bayes        | `shared/micro/bayes.ts`, `src/micro/bayes/{Bayes.tsx, bayes.css}`, `tests/micro-bayes.test.ts`, `tests/e2e/micro-bayes.spec.ts`                              | —                                                                                |

Unit tests go at the top level of `tests/`, because `npm test` globs `tests/*.test.ts`. A builder may add a sub-component file inside their own folder if `<Name>.tsx` would pass about 400 lines.

### Rules every app follows

- **Pure core.** `shared/micro/<id>.ts` imports nothing from `src/` or the DOM. It does not read `Date.now()` or `Math.random()`: time (`now: string`, ISO) and ids are arguments. It never throws on any input. Bad input returns `{ ok: false, error }` with a user-facing sentence. Coverage of 80% lines, branches and functions is enforced by `npm test`.
- **Money.** Every credit amount is an integer microcredit (`MICRO = 1_000_000` from `src/ui.tsx`, re-declared as a local const in `shared/micro/sizer.ts`, since shared cannot import src). Display uses `formatCredits`.
- **Honesty copy.** Every app's footer shows `fine-print`: "Practice tool. Peakcast uses practice credits only; nothing here is financial advice." The sizer adds its own banner (see below).
- **Accessibility.**
  - Every input has a visible `<label>`. Validation errors are tied to their input with `aria-describedby` and announced through `role="alert"` only on submit. Computed results sit in one `aria-live="polite"` region that announces the headline number, never every keystroke (debounce 300 ms).
  - Segmented choices use the existing `pf-segments`/`aria-pressed` pattern. Charts carry an `aria-label` summary, as `ReliabilityDiagram` does.
  - All actions work by keyboard and focus stays visible. Text and controls pass axe WCAG A/AA in light and dark.
- **Layout and motion.** Under 760px everything is one column, tap targets are at least 44px, and there is no horizontal overflow at 320px. Use `enterMotion`, `rowEnter`, `rowExit`, `Collapse` and `AnimatedNumber` from `src/motion.tsx`. These already honour reduced motion. No new keyframes run longer than 450 ms.
- **CSS.** Scope every rule under `.micro-<id>`. Use tokens only; never hard-code a colour (YES and NO use `var(--yes)` and `var(--no)`).
- **Client use.** Read-only calls only. An app never trades, places orders, comments or changes watchlists. "Open market" buttons `navigate` to `/markets/<id>` instead.

---

## 1. Forecast journal (`journal`)

### User problem

"I think this is 70%." A week later, nobody remembers whether it was 70 or 55, and nothing scores it. Trades are a noisy, size-weighted proxy for belief, and most Peakcast markets on a device never resolve. The journal records the belief itself, for a Peakcast market or for any real-world question, then scores it once the answer is known.

### Screens and states

1. **Summary strip** (top). Scored questions, Brier score (lower is better), log score, skill against the crowd (linked markets only, "—" if none), and pending questions. Below it, a reliability diagram using the exported `ReliabilityDiagram` with `buckets`. When nothing has been scored: "Scores appear once a question resolves. Aim for 20 or more before reading much into calibration."
2. **"Needs resolving" callout.** Custom questions whose `checkBy` date is on or before today, each with YES, NO and Void buttons.
3. **New forecast form** with two segments.
   - **Peakcast market:** a `Select` of markets with `status === "open"`, sorted by `closesAt`. It shows the crowd's current percent next to the picker. If no market is open: "No open markets right now. Add your own question instead."
   - **Own question:**
     - Question text, 8–200 characters. Show the hint "Write it so a stranger could resolve it: what, by when, according to whom."
     - "Check by" date, `<input type="date">`, today to today + 5 years.
   - Both segments also have:
     - Probability: a number input of whole percent 1–99 with a paired range slider and the readout "about 1 in N".
     - An optional note of up to 280 characters ("Why?").
     - The **Save forecast** button.
4. **Question list.** Tabs: Open, Resolved, All. Each row shows the title, a "market" or "own" chip, the latest probability, the crowd now (linked markets only), and the status (Open / Resolved YES / Resolved NO / Void / Due). Expanding a row (`Collapse`) shows:
   - the forecast history, oldest first, with time, %, crowd % and note
   - **Update forecast** (an inline percent and note; only while open)
   - **Open market** (linked)
   - **Resolve** YES/NO/Void and **Reopen** (custom only)
   - **Delete** (with a confirm step)
5. **Empty:** `EmptyState` "No forecasts yet" with the text "Pick a market or write your own question, then give it a probability."
6. **Error:** when `saveMicro` returns false, show the inline alert "Could not save on this device. Storage may be full; delete old questions and try again." In-memory state is kept, so nothing typed is lost.
7. **Missing market:** a linked market that is no longer in `markets` keeps its stored title and shows "Not on this device's market list" with no score. It still shows when `markets` is empty, for example while loading.

### Pure module `shared/micro/journal.ts`

```ts
import type { Market, CalibrationBucket } from "../types.js";
import { scoreForecasts, calibrationBuckets } from "../../server/calibration.js"; // reuse; that file imports only types from server/database.ts

export type JournalOutcome = "YES" | "NO" | "VOID";
export interface JournalForecast {
  at: string;          // ISO
  pct: number;         // integer 1–99
  crowd?: number;      // market YES probability at `at`, 0–1 rounded to 4 dp; linked questions only
  note: string;        // ≤ 280 chars, trimmed
}
export interface JournalQuestion {
  id: string;          // linked: `m:${marketId}`; custom: `c:${uuid}` (uuid from the UI)
  kind: "market" | "custom";
  marketId?: string;   // linked only
  title: string;       // market title snapshot or the custom text
  checkBy?: string;    // custom only, YYYY-MM-DD
  resolution?: JournalOutcome; // custom only; linked questions derive theirs from the market
  resolvedAt?: string; // custom only
  createdAt: string;
  forecasts: JournalForecast[]; // oldest first, 1–20
}
export interface JournalState { version: 1; questions: JournalQuestion[] } // ≤ 200 questions, newest first
export type JournalResult = { ok: true; state: JournalState } | { ok: false; error: string };

export const EMPTY_JOURNAL: JournalState;
export function parseJournal(raw: unknown): JournalState;
export function addMarketForecast(state: JournalState, market: Market, pct: number, note: string, now: string): JournalResult;
export function addCustomQuestion(state: JournalState, input: { uuid: string; title: string; checkBy: string; pct: number; note: string }, now: string): JournalResult;
export function updateForecast(state: JournalState, questionId: string, pct: number, note: string, now: string, market?: Market): JournalResult;
export function resolveCustom(state: JournalState, questionId: string, outcome: JournalOutcome, now: string): JournalResult;
export function reopenCustom(state: JournalState, questionId: string): JournalResult;
export function deleteQuestion(state: JournalState, questionId: string): JournalState;
/** Linked: market resolved YES/NO → that; resolved INVALID → "VOID"; otherwise null. Custom: its resolution or null. */
export function questionOutcome(q: JournalQuestion, markets: readonly Market[]): JournalOutcome | null;
export function dueQuestions(state: JournalState, today: string /* YYYY-MM-DD */): JournalQuestion[];
export interface JournalSummary {
  scored: number;          // resolved YES/NO questions
  pending: number;         // no outcome yet
  voided: number;
  brier: number | null;    // mean (p − o)² over scored, using each question's final forecast
  logScore: number | null; // mean ln(p if YES else 1 − p); 0 is perfect, more negative is worse
  skill: number | null;    // crowd Brier − your Brier over scored linked questions; null if none
  linkedScored: number;
  buckets: CalibrationBucket[]; // 10 buckets via calibrationBuckets
}
export function summarize(state: JournalState, markets: readonly Market[]): JournalSummary;
```

**Rules**

- **Final forecast.** Use the last entry in `forecasts`. Linked questions can only receive forecasts while `market.status === "open"`. Trading halts at proposal, so a linked question's forecasts can never postdate the outcome.
- **Skill.** `skill = scoreForecasts(linked.map(q => ({forecast: final.pct/100, baseline: final.crowd, outcome}))).skill`. The crowd is the price when **your final forecast** was saved, the same comparison the Portfolio accuracy card makes ("the price before your trades").
- **Validation messages.**
  - `pct` is not an integer from 1 to 99: "Give a whole percent from 1 to 99."
  - The title has fewer than 8 or more than 200 characters after trimming: "Write the question in 8 to 200 characters."
  - A custom title duplicates an existing custom title, ignoring case and whitespace: "You already have this question."
  - `checkBy` is not a valid `YYYY-MM-DD`, is before `now`'s date, or is more than 5 years later: "Pick a check-by date from today to five years ahead."
  - The note is longer than 280 characters after trimming: "Keep the note under 280 characters."
  - The market is not open: "This market is no longer open for forecasts."
  - Updating a resolved question: "This question is resolved. Reopen it to update."
  - The question has 20 forecasts: "This question has 20 forecasts, the most it keeps."
  - The journal has 200 questions: "The journal holds 200 questions. Delete old ones to add more."
  - An unknown id: "That question no longer exists."
- `addMarketForecast` on a market that already has a question appends to it; it does not duplicate the question.
- `parseJournal` drops each invalid question or forecast individually, clamps nothing, sorts nothing and never throws. Anything that is not `{version: 1, questions: []}`-shaped becomes `EMPTY_JOURNAL`.

**Persistence:** `peakcast.micro.journal.v1` = `JournalState`. Save after every successful mutation. The worst case is about 200 × 20 × 400 B ≈ 1.6 MB, within the roughly 5 MB `localStorage` quota.

### Tests (`tests/micro-journal.test.ts`, `NOW = "2026-11-27T12:00:00.000Z"`)

1. Add a custom question at 80% and resolve it YES; add another at 30% and resolve it NO. Expect `brier` 0.065, `logScore` ≈ −0.28991 (±1e-5), `skill` null.
2. A linked market at crowd 0.5, forecast 70%, market resolved YES: `brier` 0.09, `skill` = 0.25 − 0.09 = 0.16.
3. A linked market resolved INVALID gives `voided: 1` and is excluded from `brier`.
4. Updates: forecasts at 40 then 90 on a YES question score with 90 only.
5. Every validation message above, one assertion each, and the cap behaviour at 20 forecasts and 200 questions.
6. `addMarketForecast` refuses a market with status `"proposed"`.
7. `dueQuestions` includes `checkBy` today and before, and excludes resolved questions and tomorrow's dates.
8. `parseJournal` on `undefined`, `"x"`, `{version: 2}`, a question with `pct: 150` (dropped) and a valid fixture (round-trips equal).
9. Purity: the input state is deep-equal before and after each mutator (use `structuredClone` for the comparison).
10. Buckets: ten buckets from `summarize` equal `calibrationBuckets` on the same inputs.

**E2E (`tests/e2e/micro-journal.spec.ts`).** Onboard, open `/apps/journal`, add an own question at 75%, and reload: it persists. Resolve it YES and the summary shows 1 scored with a Brier of 0.0625, formatted the way the Portfolio accuracy card formats it. Forecast on the first open market. Run axe on the page in light and dark. At a 375 px viewport there is no horizontal scroll.

### Acceptance

1. Forecasts survive reload. Deleting the account removes `peakcast.micro.journal.v1`.
2. Linked questions score automatically when their market resolves YES or NO and are voided on INVALID. No forecast can be added to a non-open market.
3. Scores match the formulas above and the Portfolio's `calibrationBuckets` bucket rule exactly.

---

## 2. Stake sizer (`sizer`)

### User problem

"I think YES is 60% and it trades at 50¢. How much should I put in?" Newcomers bet everything or nothing. The Kelly criterion answers the question as a fraction of bankroll that maximises long-run growth. Full Kelly is famously aggressive when your belief is off, so the tool defaults to quarter Kelly and says why.

### Screens and states

1. **Banner (always visible, not dismissible).** "Educational tool for Peakcast practice credits. It shows a textbook formula, not a recommendation, and nothing here is financial advice."
2. **Inputs.**
   - **Market (optional):** a `Select` of open markets, plus "Enter a price myself". Choosing a market fills the price from `market.probability` and the fee from `market.feeBps`, both read-only, with a link that says "Using the crowd price now".
   - **Price** (manual mode only): YES price in whole cents, 1–99.
   - **Fee** (manual mode only): 0 or 1%, a segmented control.
   - **Your probability of YES:** whole percent, 1–99.
   - **Bankroll:** practice credits with up to 2 decimals. It defaults to `portfolio.balanceMicros`, with the hint "Your available practice credits". When `portfolio` is null, the field is empty and required.
   - **Kelly multiplier:** a segmented ¼, ½, Full. The default is ¼.
3. **Result card** (`aria-live`).
   - With an edge: "Buy **NO**: edge 9.5 points after fees", followed by the Kelly fraction (full), the applied fraction, a stake of **N practice credits** (`AnimatedNumber`), about N shares, the expected profit, and the expected growth per bet at that stake.
   - The equivalence line: "¼ Kelly bets as if your belief were 52.5%."
   - The overbetting note: "Full Kelly assumes your probability is right. If you are overconfident, it overbets."
4. **No edge:** "No edge at this price. Your belief is within the fee of the market, so Kelly stakes 0." This state is not an error.
5. **Check with a quote** (market mode only, when the stake is above 0). It calls `client.quote({ marketId, outcome: side, action: "buy", shares })`. It shows the average price including the fee, the total cost and the price after. It then re-runs `edgeAt(beliefSide, quote.averagePrice)`: "The edge survives price impact: 7.1 points" or "Price impact eats the edge at this size; try a smaller multiplier." Quote errors (closed market, 409) are shown inline with `errorMessage`.
6. **Open market** button: `navigate(`/markets/${id}`)`. There is no trade button in the app.
7. **Validation errors** appear inline under each field, and the result card shows "Fix the highlighted fields."

### Pure module `shared/micro/sizer.ts`

```ts
import type { Outcome } from "../types.js";
export const MICRO = 1_000_000;
export const MAX_SHARES = 10_000; // TradeInputSchema maximum
export type Multiplier = 0.25 | 0.5 | 1;
export interface SizerInput {
  belief: number;         // P(YES), 0.01–0.99
  price: number;          // marginal YES price, 0.01–0.99
  feeBps: number;         // integer 0–1000
  bankrollMicros: number; // integer ≥ 0
  multiplier: Multiplier;
}
export interface Sizing {
  side: Outcome | null;      // null: no edge on either side
  beliefSide: number;        // belief in the chosen side (belief or 1 − belief); 0 when side is null
  effectivePrice: number;    // marginal side price × (1 + feeBps/10 000), capped at 0.9999
  edge: number;              // beliefSide − effectivePrice; ≤ 0 when side is null (the better of the two sides)
  kellyFraction: number;     // full Kelly, (beliefSide − c)/(1 − c); 0 when no edge
  appliedFraction: number;   // kellyFraction × multiplier
  stakeMicros: number;       // floor(bankrollMicros × appliedFraction), integer, ≤ bankrollMicros
  shares: number;            // min(MAX_SHARES, floor(stakeMicros / round(c × MICRO))); 0 when stake is 0
  expectedProfitMicros: number; // round(stakeMicros × (beliefSide / c − 1))
  expectedGrowth: number;    // beliefSide·ln(1 + f(1 − c)/c) + (1 − beliefSide)·ln(1 − f), f = appliedFraction; 0 when no edge
  blendedBelief: number;     // multiplier × beliefSide + (1 − multiplier) × c, the belief at which full Kelly equals this stake
  feeKillsEdge: boolean;     // true when an edge exists at feeBps 0 but not after the fee
}
export type SizerResult = { ok: true; sizing: Sizing } | { ok: false; errors: Partial<Record<keyof SizerInput, string>> };
export function sizeBet(input: SizerInput): SizerResult;
export function edgeAt(beliefSide: number, averagePrice: number): number;          // beliefSide − averagePrice
export function kellyFraction(beliefSide: number, price: number): number;          // max(0, (p − c)/(1 − c)); 0 when c ≥ 1
/** "12.50" → 12_500_000; rejects negatives, > 2 decimals, > 1e9 credits, non-numbers. */
export function parseCredits(text: string): { ok: true; micros: number } | { ok: false; error: string };
/** "35" → 0.35; whole percent 1–99 only. */
export function parsePercent(text: string): { ok: true; value: number } | { ok: false; error: string };
```

**Formulas** (Kelly for a contract that pays 1 per share, bought at all-in price _c_; net odds _b = (1 − c)/c_):

- YES: _c_ = `price × (1 + feeBps/10 000)`, _p_ = `belief`.
- NO: _c_ = `(1 − price) × (1 + feeBps/10 000)`, _p_ = `1 − belief`.
- _f\* = p − (1 − p)/b = (p − c)/(1 − c)_, used only when _p > c_. With a fee of 0 or more, at most one side can have _p > c_.
- The fee is modelled as `ceil(amount × bps / 10 000)` on top of a buy, as in `Store.quote`. The pure module uses the unrounded multiplier, and the live quote shows the exact figure.
- `// ponytail: marginal-price Kelly; the live quote is the price-impact check. Solve Kelly against the LMSR curve only if users size large enough for that to matter.`

**Validation** (returned per field, with these exact messages):

- `belief`: "Give your probability as a whole percent from 1 to 99."
- `price`: "Give the YES price in whole cents from 1 to 99."
- `feeBps` outside the integers 0–1000: "Fee must be 0% to 10%." The UI offers only 0 and 100.
- `bankrollMicros` negative or not an integer: "Enter practice credits of 0 or more."
- `multiplier` not one of 0.25, 0.5 or 1: "Pick ¼, ½ or full Kelly."
- A bankroll of 0 is valid and gives a stake of 0.

**Persistence:** `peakcast.micro.sizer.v1` = `{ version: 1, multiplier: Multiplier, lastMarketId?: string }`, parsed by `parseSizerPrefs(raw: unknown): SizerPrefs` (also exported). Beliefs and bankroll are deliberately not stored.

### Tests (`tests/micro-sizer.test.ts`)

| #   | Input (belief, price, fee, bankroll credits, multiplier) | Expected                                                                                                               |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | 0.60, 0.50, 0, 5 000, 1                                  | side YES, kelly 0.2, stake 1 000 000 000, shares 2 000, expected profit 200 000 000, growth ≈ 0.0201355 (±1e-6)         |
| 2   | 0.60, 0.50, 0, 5 000, 0.25                               | stake 250 000 000, shares 500, profit 50 000 000, blendedBelief 0.525                                                  |
| 3   | 0.30, 0.50, 0, 1 000, 1                                  | side NO, beliefSide 0.7, kelly 0.4, stake 400 000 000                                                                  |
| 4   | 0.60, 0.50, 100, 5 000, 1                                | c 0.505, kelly ≈ 0.191919, stake 959 595 959                                                                           |
| 5   | 0.503, 0.50, 100, 5 000, 1                               | side null, stake 0, feeKillsEdge true                                                                                  |
| 6   | 0.50, 0.50, 0, 5 000, 1                                  | side null, feeKillsEdge false                                                                                          |
| 7   | 0.99, 0.01, 0, 5 000, 1                                  | shares capped at 10 000; stake ≤ bankroll                                                                              |
| 8   | bankroll 0                                               | ok, stake 0, shares 0                                                                                                  |
| 9   | each invalid field                                       | the exact message above                                                                                                |
| 10  | property: 1 000 seeded random valid inputs               | never throws; `0 ≤ stakeMicros ≤ bankrollMicros`; integers; `appliedFraction ≤ kellyFraction ≤ 1`; deterministic        |

Also cover `parseCredits` ("12.5" ok; "1.234", "-1", "abc", "" rejected), `parsePercent`, `edgeAt`, and `parseSizerPrefs` on garbage.

**E2E.** Open `/apps/sizer`; the banner text is visible. Pick the first open market, set belief to price + 10, choose ½, and the stake is shown. **Check with a quote** shows an average price. No trade is placed: the portfolio balance is unchanged after the test. Run axe in light and dark, plus a 375 px overflow check.

### Acceptance

1. The banner and the per-result wording always say practice credits and educational. There is no trade action inside the app.
2. Stakes are integer microcredits, never above the bankroll, and match the table.
3. The quote check uses only `client.quote` (read-only) and handles a closed market gracefully.

---

## 3. Evidence updater (`bayes`)

### User problem

"The crowd says 30%. Then this news broke. Where should I be now?" People either ignore evidence or overreact to it. Odds form makes the size of an update explicit: each piece of evidence is "how much more likely would I see this if YES than if NO?"

### Screens and states

1. **Prior.**
   - The prior is a percent with one decimal, 0.1–99.9.
   - **Start from a market** (a `Select` of markets) sets the prior to the market's current probability and remembers `marketId`.
2. **Evidence list** of 0–12 rows, each with:
   - a label (≤ 80 chars, optional, defaulting to "Evidence N")
   - a mode segment:
     - **Ratio:** "×" likelihood ratio, 0.001–1000, decimals allowed. Presets ×½, ×2, ×3, ×10.
     - **Two chances:** "If YES, how likely is this?" and "If NO, how likely is this?", each a percent 0.1–99.9. The row shows the implied ratio.
   - a per-row readout (`rowEnter`/`rowExit`): ratio, ±bits and the probability after this step
   - remove, move up and move down buttons, all keyboard-operable with labels
   - **Add evidence** appends a row and focuses its label.
3. **Result** (`aria-live`, announces the posterior only).
   - Large posterior percent (`AnimatedNumber`).
   - A **log-odds bar**: a horizontal SVG over −10 to +10 bits with ticks at 1%, 10%, 50%, 90%, 99%, a prior marker, a posterior marker and an arrow for each step. It carries an `aria-label` summary.
   - Text "Moved +2.3 bits (×4.9) from 30.0% to 67.6%".
   - When linked to a market: "That is 38 points above the crowd's 30%." with **Open market** and a note: "Size it in Stake sizer at /apps/sizer." That is a plain `navigate("/apps/sizer")`, with no value handoff in v1.
   - A caveat line, always shown: "Multiplying ratios assumes each piece of evidence is independent given the outcome. If two items share a cause, count it once."
4. **Odds converter** (a collapsible panel).
   - One text input with a format segment: Percent, Decimal, American, Fractional (against), Odds (for), 1 in N.
   - It outputs all six forms plus bits. Example input "+150" shows 40.0% · 2.50 · +150 · 3/2 · 2:3 · 1 in 2.5 · −0.58 bits.
5. **Saved worksheets.** **Save** stores the current prior and evidence under a title (1–60 chars, defaulting to the market title or "Worksheet"). The list shows up to 20, newest first, with load and delete. With none saved: "Saved worksheets appear here."
6. **Errors** appear inline per field. While any field is invalid, the result shows "Fix the highlighted fields" and keeps the last valid posterior greyed out with `aria-disabled`.

### Pure module `shared/micro/bayes.ts`

```ts
export interface Evidence {
  id: string;
  label: string;
  mode: "ratio" | "chances";
  ratio?: number;      // mode ratio: 0.001–1000
  ifYes?: number;      // mode chances: 0.001–0.999
  ifNo?: number;       // mode chances: 0.001–0.999
}
export interface Step { id: string; ratio: number; bits: number; probabilityAfter: number }
export type UpdateResult =
  | { ok: true; prior: number; posterior: number; totalBits: number; totalRatio: number; steps: Step[] }
  | { ok: false; errors: { field: "prior" | `${string}.ratio` | `${string}.ifYes` | `${string}.ifNo`; message: string }[] };

export const logit2 = (p: number): number => Math.log2(p / (1 - p));   // bits
export const fromBits = (bits: number): number => 1 / (1 + 2 ** -bits);
export function likelihoodRatio(e: Evidence): number | null;           // null when invalid
export function update(prior: number, evidence: readonly Evidence[]): UpdateResult;

export type OddsFormat = "percent" | "decimal" | "american" | "fractional" | "odds" | "oneIn";
export interface OddsForms { probability: number; percent: string; decimal: string; american: string; fractional: string; odds: string; oneIn: string; bits: string }
export function parseOdds(format: OddsFormat, text: string): { ok: true; probability: number } | { ok: false; error: string };
export function toOddsForms(p: number): OddsForms;   // 0 < p < 1
/** Closest rational a/b with b ≤ maxDen: continued-fraction convergents and semiconvergents; a, b coprime. */
export function approxFraction(x: number, maxDen?: number /* 100 */): [number, number];

export interface Worksheet { id: string; title: string; prior: number; marketId?: string; evidence: Evidence[]; updatedAt: string }
export interface BayesState { version: 1; worksheets: Worksheet[] } // ≤ 20, newest first
export function parseBayes(raw: unknown): BayesState;
export function saveWorksheet(state: BayesState, sheet: Worksheet): BayesState; // replaces by id, else prepends; drops the oldest beyond 20
export function deleteWorksheet(state: BayesState, id: string): BayesState;
```

**Formulas**

- `ratio = mode === "ratio" ? e.ratio : e.ifYes / e.ifNo`. Its bits are `log2(ratio)`.
- `totalBits = logit2(prior) + Σ log2(ratio_i)`, and `posterior = fromBits(totalBits)`. Each step's `probabilityAfter` is the running posterior.
- Computing in bits avoids overflow for 12 × 1000. The posterior is exact in floating point. Display shows "<0.1%" and ">99.9%" outside that range.
- Odds forms for _p_:
  - percent: `p×100` to 1 dp
  - decimal: `1/p` to 2 dp
  - american: `p ≥ 0.5 ? −100p/(1 − p) : +100(1 − p)/p`, rounded to an integer with an explicit sign
  - fractional (against): `approxFraction((1 − p)/p)` as `a/b`
  - odds (for): `approxFraction(p/(1 − p))` as `a:b`
  - oneIn: `1/p` to 1 dp
  - bits: `logit2(p)` to 2 dp with a sign
- `parseOdds` accepts:
  - **percent:** "35", "35%" or "35.5". It must be strictly between 0 and 100.
  - **decimal:** greater than 1, so _p_ = 1/x.
  - **american:** "+150" gives _p_ = 100/(x + 100). "−200" gives _p_ = |x|/(|x| + 100). |x| must be at least 100.
  - **fractional:** "a/b" or "a-b", positive, so _p_ = b/(a + b).
  - **odds:** "a:b", positive, so _p_ = a/(a + b).
  - **oneIn:** greater than 1, so _p_ = 1/N.
  - Whitespace is trimmed, and a Unicode minus is accepted.
- `// ponytail: naive-Bayes product; correlated evidence is a user-education problem, handled by the caveat line, not by modelling dependence.`

**Validation messages:**

- Prior: "Prior must be from 0.1% to 99.9%."
- Ratio: "Ratio must be from 0.001 to 1000."
- Chances: "Each chance must be from 0.1% to 99.9%."
- Evidence count above 12: "Up to 12 pieces of evidence."
- Odds parse errors, by format:
  - percent: "Enter a percent between 0 and 100."
  - decimal: "Decimal odds must be greater than 1."
  - american: "American odds look like +150 or −200."
  - fractional: "Fractional odds look like 3/2."
  - odds: "Odds look like 2:3."
  - oneIn: "Enter N greater than 1."
- Worksheet title outside 1–60 characters: "Title must be 1 to 60 characters."

**Persistence:** `peakcast.micro.bayes.v1` = `BayesState`. The current unsaved sheet is not persisted, to keep the model to one state. `// ponytail: add draft autosave if users ask.`

### Tests (`tests/micro-bayes.test.ts`)

1. Prior 0.5 with ratio 3 gives 0.75.
2. Prior 0.2 with ratios 4 then 2 gives 2/3 (±1e-12). The steps are 0.5 then 2/3.
3. Prior 1/3 with ratio 8 gives 0.8 and totalBits −1 + 3 = 2. This is the log-odds example from the LessWrong wiki.
4. Chances 0.9 and 0.3 give ratio 3 and bits ≈ 1.58496.
5. Twelve ratios of 1000 from prior 0.5 (about +119.6 bits) give a posterior of exactly 1 in floating point, never NaN or Infinity, and the display shows ">99.9%".
6. `toOddsForms(0.25)` gives 25.0%, 4.00, +300, 3/1, 1:3, 1 in 4.0, −1.58 bits. `toOddsForms(0.8)` gives 1.25, −400, 1/4, 4:1.
7. `parseOdds`:
   - "+150" gives 0.4; "−200" and "-200" give 2/3; decimal "2.5" gives 0.4; fractional "3/2" gives 0.4; odds "2:3" gives 0.4; "35%" gives 0.35; oneIn "4" gives 0.25.
   - Rejected, each with its message: American "+50", decimal "1", fractional "0/3", percent "100", "abc", "".
8. Round trip: for 200 seeded _p_ in [0.01, 0.99], `parseOdds("decimal", toOddsForms(p).decimal)` is within 0.005 of _p_.
9. `approxFraction(1/3)` gives [1, 3]. `approxFraction(0.6667)` gives [2, 3]. `approxFraction(Math.PI, 100)` gives [311, 99].
10. Worksheets: saving the 21st drops the oldest, saving an existing id replaces it, and `parseBayes` handles garbage and drops evidence with an invalid mode.
11. Every validation message.

**E2E.** Open `/apps/bayes` and start from the first market. Add ×3 and the posterior updates, and the live region text contains the posterior. Use the converter with "+150" in American format and 40.0% shows. Save a worksheet, reload, then load it. Run axe in light and dark, plus a 375 px overflow check.

### Acceptance

1. The posterior matches odds-form Bayes for every test case, and the step list explains each move in ratio, bits and percent.
2. The converter round-trips all six formats and rejects malformed text with the exact messages.
3. The independence caveat is always visible next to the result.

---

## Host tests

`tests/e2e/micro-apps.spec.ts`:

- `/apps` lists exactly the three registry apps as buttons, and each opens its page with the right `<h1>`.
- The back button returns to `/apps`.
- `/apps/nope` shows "App not found".
- The Micro apps item is selected in the desktop sidebar on `/apps/sizer`.
- On a 375 px viewport the create sheet lists Micro apps and the dock still has four tabs.
- Deleting the account (Settings) removes every `peakcast.micro.*` key, checked with `page.evaluate`.
- axe passes on `/apps` in light and dark.

`npm run verify` passes, including `review:ui` with the new routes. After the host merges, `npm run test:desktop` confirms the lazy chunks load from the `app://` origin. Check the Android build manually once, since chunk URLs are absolute like the existing assets.

## Effort and order

1. Orchestrator: host, stubs, `ReliabilityDiagram` export, host e2e and docs. About 1 dev-day. **Merge before the builders start.**
2. In parallel: journal (2.5 dev-days, the largest UI), sizer (2) and bayes (2.5, because of the SVG log-odds bar and the converter).
3. Orchestrator: final `npm run verify`, Windows rebuild (`npm run desktop:package`) and a single release note.

## Product owner decisions

1. The hub sits in the sidebar and the phone create sheet, not as a dock tab. Recommended: yes, keep the dock at four tabs.
2. The sizer defaults to quarter Kelly. Recommended: yes. The literature treats fractional Kelly as protection against an overconfident belief.
3. The journal allows self-resolved custom questions. Recommended: yes. Without them, most beliefs on a device never resolve. Self-resolved scores are labelled "own" in the list.
4. Whether to ship the calibration quiz next, which first needs a sourced question bank.

## Sources

- [gjp-psych]: Mellers et al. (2015), "The psychology of intelligence analysis: drivers of prediction accuracy in world politics", https://faculty.wharton.upenn.edu/wp-content/uploads/2015/07/2015---the-psychology-of-intelligence-analysis.pdf
- [gjp-train]: Chang, Chen, Mellers & Tetlock (2016), "Developing expert political judgment: the impact of training and practice on judgmental accuracy in geopolitical forecasting tournaments", _Judgment and Decision Making_, https://www.cambridge.org/core/product/123EB18425391D05FA6581FDBB3F309F/core-reader
- [fatebook]: Sage, "Introducing Fatebook: the fastest way to make and track predictions", https://www.lesswrong.com/posts/yS3d46m23wRKDQobt/introducing-fatebook-the-fastest-way-to-make-and-track
- [kelly-pm]: Beygelzimer, Langford & Pennock (2012), "Learning performance of prediction markets with Kelly bettors", https://arxiv.org/abs/1201.6655
- [kelly-wiki]: "Kelly criterion", Wikipedia, https://en.wikipedia.org/wiki/Kelly_criterion
- [bayes-log]: "Bayes' rule: log-odds form", LessWrong wiki, https://www.lesswrong.com/w/bayes-rule-log-odds-form
- [proper]: Gneiting & Raftery (2004), "Strictly proper scoring rules, prediction, and estimation", technical report, https://apps.dtic.mil/sti/pdfs/ADA459827.pdf (published in _JASA_ 2007)
- [openphil]: Open Philanthropy, "New web app for calibration training", https://www.openphilanthropy.org/blog/new-web-app-calibration-training
- [greenberg]: Greenberg (2018), "Calibration scoring rules for practical prediction training", https://arxiv.org/abs/1808.07501
- [raycast-manifest]: Raycast developer docs, "Manifest", https://developers.raycast.com/information/manifest
- [raycast-files]: Raycast developer docs, "File structure", https://developers.raycast.com/information/file-structure
- [wechat-framework]: Weixin Mini Program, "Framework", https://developers.weixin.qq.com/miniprogram/en/dev/framework/MINA.html
- [wechat-host]: Weixin Mini Program, "Host environment", https://developers.weixin.qq.com/miniprogram/en/dev/framework/quickstart/framework.html
- [telegram]: Telegram, "Telegram Mini Apps", https://core.telegram.org/bots/webapps
- [webdev-mini]: web.dev, "Mini app markup, styling, scripting, and updating", https://web.dev/articles/mini-apps/mini-app-markup-styling-and-scripting

[gjp-psych]: https://faculty.wharton.upenn.edu/wp-content/uploads/2015/07/2015---the-psychology-of-intelligence-analysis.pdf
[gjp-train]: https://www.cambridge.org/core/product/123EB18425391D05FA6581FDBB3F309F/core-reader
[fatebook]: https://www.lesswrong.com/posts/yS3d46m23wRKDQobt/introducing-fatebook-the-fastest-way-to-make-and-track
[kelly-pm]: https://arxiv.org/abs/1201.6655
[kelly-wiki]: https://en.wikipedia.org/wiki/Kelly_criterion
[bayes-log]: https://www.lesswrong.com/w/bayes-rule-log-odds-form
[proper]: https://apps.dtic.mil/sti/pdfs/ADA459827.pdf
[openphil]: https://www.openphilanthropy.org/blog/new-web-app-calibration-training
[greenberg]: https://arxiv.org/abs/1808.07501
[raycast-manifest]: https://developers.raycast.com/information/manifest
[raycast-files]: https://developers.raycast.com/information/file-structure
[wechat-framework]: https://developers.weixin.qq.com/miniprogram/en/dev/framework/MINA.html
[wechat-host]: https://developers.weixin.qq.com/miniprogram/en/dev/framework/quickstart/framework.html
[telegram]: https://core.telegram.org/bots/webapps
[webdev-mini]: https://web.dev/articles/mini-apps/mini-app-markup-styling-and-scripting

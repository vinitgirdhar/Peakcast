// Forecast journal: pure, deterministic and total. Time and ids are arguments;
// bad input comes back as { ok: false, error } and nothing here ever throws.
import type { CalibrationBucket, Market } from "../types.js";
import {
  calibrationBuckets,
  scoreForecasts,
  type MarketForecast,
} from "../../server/calibration.js";

export type JournalOutcome = "YES" | "NO" | "VOID";
export interface JournalForecast {
  /** ISO time the forecast was saved. */
  at: string;
  /** Whole percent, 1 to 99. */
  pct: number;
  /** Market YES probability at `at`, 0 to 1, 4 dp; linked questions only. */
  crowd?: number;
  /** Trimmed, at most 280 characters. */
  note: string;
}
export interface JournalQuestion {
  /** Linked: `m:${marketId}`; custom: `c:${uuid}`. */
  id: string;
  kind: "market" | "custom";
  marketId?: string;
  /** Market title snapshot or the custom text. */
  title: string;
  /** Custom only, YYYY-MM-DD. */
  checkBy?: string;
  /** Custom only; linked questions take theirs from the market. */
  resolution?: JournalOutcome;
  resolvedAt?: string;
  createdAt: string;
  /** Oldest first, 1 to 20. */
  forecasts: JournalForecast[];
}
/** Newest question first, at most 200. */
export interface JournalState {
  version: 1;
  questions: JournalQuestion[];
}
export type JournalResult =
  { ok: true; state: JournalState } | { ok: false; error: string };
export type QuestionStatus = "open" | "due" | JournalOutcome;
export interface JournalSummary {
  /** Questions resolved YES or NO. */
  scored: number;
  /** Questions with no outcome yet. */
  pending: number;
  voided: number;
  /** Mean (p − o)² over scored questions, using each final forecast. */
  brier: number | null;
  /** Mean ln(p if YES else 1 − p); 0 is perfect. */
  logScore: number | null;
  /** Crowd Brier − your Brier over scored linked questions. */
  skill: number | null;
  linkedScored: number;
  buckets: CalibrationBucket[];
}

export const MAX_FORECASTS = 20;
export const MAX_QUESTIONS = 200;
export const MAX_NOTE = 280;
export const EMPTY_JOURNAL: JournalState = { version: 1, questions: [] };

export const MESSAGES = {
  pct: "Give a whole percent from 1 to 99.",
  title: "Write the question in 8 to 200 characters.",
  duplicate: "You already have this question.",
  checkBy: "Pick a check-by date from today to five years ahead.",
  note: "Keep the note under 280 characters.",
  closed: "This market is no longer open for forecasts.",
  resolved: "This question is resolved. Reopen it to update.",
  forecastCap: "This question has 20 forecasts, the most it keeps.",
  questionCap: "The journal holds 200 questions. Delete old ones to add more.",
  missing: "That question no longer exists.",
  notCustom: "Only your own questions are resolved here.",
  outcome: "Choose YES, NO or Void.",
} as const;

const OUTCOMES: readonly string[] = ["YES", "NO", "VOID"];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 3_600_000;

const fail = (error: string): JournalResult => ({ ok: false, error });
const done = (questions: JournalQuestion[]): JournalResult => ({
  ok: true,
  state: { version: 1, questions },
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const validPct = (pct: unknown): pct is number =>
  Number.isInteger(pct) && (pct as number) >= 1 && (pct as number) <= 99;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const normalTitle = (title: string) =>
  title.trim().replace(/\s+/g, " ").toLowerCase();

/** The question's latest forecast, or null for a malformed question. */
export const latestForecast = (q: JournalQuestion): JournalForecast | null =>
  q.forecasts[q.forecasts.length - 1] ?? null;

/** "about 1 in N" for a whole percent: one decimal under 10, whole above. */
export function oneInLabel(pct: number): string {
  if (!validPct(pct)) return "";
  const n = 100 / pct;
  return `about 1 in ${n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)}`;
}

/** YYYY-MM-DD of a UTC instant, or null when it is not a real time. */
function utcDay(ms: number): string | null {
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/** True for a real calendar day such as 2028-02-29 (not 2027-02-29). */
export function isDay(day: unknown): day is string {
  return (
    isText(day) && DAY_PATTERN.test(day) && utcDay(Date.parse(day)) === day
  );
}

/** Same calendar day `years` later; 29 February rolls to 1 March. */
export function shiftYears(day: string, years: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return utcDay(Date.UTC(y + years, m - 1, d)) ?? day;
}

// ponytail: "today" is any date that is today somewhere on Earth (UTC−12 to
// UTC+14), so the pure core needs no time zone and never rejects a local today.
function checkByError(checkBy: string, now: string): string | null {
  const at = Date.parse(now);
  const earliest = utcDay(at - 12 * HOUR);
  const latest = utcDay(at + 14 * HOUR);
  if (!isDay(checkBy) || !earliest || !latest) return MESSAGES.checkBy;
  return checkBy < earliest || checkBy > shiftYears(latest, 5)
    ? MESSAGES.checkBy
    : null;
}

function forecastError(pct: number, note: string): string | null {
  if (!validPct(pct)) return MESSAGES.pct;
  if (!isText(note) || note.trim().length > MAX_NOTE) return MESSAGES.note;
  return null;
}

function makeForecast(
  pct: number,
  note: string,
  now: string,
  market?: Market,
): JournalForecast {
  return market
    ? { at: now, pct, crowd: round4(market.probability), note: note.trim() }
    : { at: now, pct, note: note.trim() };
}

function appendTo(
  state: JournalState,
  q: JournalQuestion,
  forecast: JournalForecast,
): JournalResult {
  if (q.forecasts.length >= MAX_FORECASTS) return fail(MESSAGES.forecastCap);
  return done(
    state.questions.map((item) =>
      item.id === q.id
        ? { ...item, forecasts: [...item.forecasts, forecast] }
        : item,
    ),
  );
}

const prepend = (state: JournalState, q: JournalQuestion): JournalResult =>
  state.questions.length >= MAX_QUESTIONS
    ? fail(MESSAGES.questionCap)
    : done([q, ...state.questions]);

/** Saves a forecast on an open market, appending to its question if there is one. */
export function addMarketForecast(
  state: JournalState,
  market: Market,
  pct: number,
  note: string,
  now: string,
): JournalResult {
  const error = forecastError(pct, note);
  if (error) return fail(error);
  if (market.status !== "open") return fail(MESSAGES.closed);
  const forecast = makeForecast(pct, note, now, market);
  const id = `m:${market.id}`;
  const existing = state.questions.find((q) => q.id === id);
  if (existing) return appendTo(state, existing, forecast);
  return prepend(state, {
    id,
    kind: "market",
    marketId: market.id,
    title: market.title,
    createdAt: now,
    forecasts: [forecast],
  });
}

export interface CustomInput {
  uuid: string;
  title: string;
  checkBy: string;
  pct: number;
  note: string;
}

function customError(
  state: JournalState,
  input: CustomInput,
  now: string,
): string | null {
  const title = isText(input.title) ? input.title.trim() : "";
  if (title.length < 8 || title.length > 200) return MESSAGES.title;
  const same = normalTitle(title);
  if (
    state.questions.some(
      (q) => q.kind === "custom" && normalTitle(q.title) === same,
    )
  )
    return MESSAGES.duplicate;
  return (
    checkByError(input.checkBy, now) ?? forecastError(input.pct, input.note)
  );
}

/** Adds your own question with its first forecast. */
export function addCustomQuestion(
  state: JournalState,
  input: CustomInput,
  now: string,
): JournalResult {
  const error = customError(state, input, now);
  if (error) return fail(error);
  return prepend(state, {
    id: `c:${input.uuid}`,
    kind: "custom",
    title: input.title.trim(),
    checkBy: input.checkBy,
    createdAt: now,
    forecasts: [makeForecast(input.pct, input.note, now)],
  });
}

function updateError(q: JournalQuestion, market?: Market): string | null {
  if (q.kind === "custom") return q.resolution ? MESSAGES.resolved : null;
  return market && market.id === q.marketId && market.status === "open"
    ? null
    : MESSAGES.closed;
}

/** Appends a forecast; linked questions need their market, still open. */
export function updateForecast(
  state: JournalState,
  questionId: string,
  pct: number,
  note: string,
  now: string,
  market?: Market,
): JournalResult {
  const q = state.questions.find((item) => item.id === questionId);
  if (!q) return fail(MESSAGES.missing);
  const error = forecastError(pct, note) ?? updateError(q, market);
  if (error) return fail(error);
  const linked = q.kind === "market" ? market : undefined;
  return appendTo(state, q, makeForecast(pct, note, now, linked));
}

function editCustom(
  state: JournalState,
  questionId: string,
  edit: (q: JournalQuestion) => JournalQuestion,
): JournalResult {
  const q = state.questions.find((item) => item.id === questionId);
  if (!q) return fail(MESSAGES.missing);
  if (q.kind !== "custom") return fail(MESSAGES.notCustom);
  return done(
    state.questions.map((item) => (item.id === questionId ? edit(item) : item)),
  );
}

export function resolveCustom(
  state: JournalState,
  questionId: string,
  outcome: JournalOutcome,
  now: string,
): JournalResult {
  if (!OUTCOMES.includes(outcome)) return fail(MESSAGES.outcome);
  return editCustom(state, questionId, (q) => ({
    ...q,
    resolution: outcome,
    resolvedAt: now,
  }));
}

export function reopenCustom(
  state: JournalState,
  questionId: string,
): JournalResult {
  return editCustom(state, questionId, (q) => {
    const { resolution: _r, resolvedAt: _a, ...open } = q;
    return open;
  });
}

export function deleteQuestion(
  state: JournalState,
  questionId: string,
): JournalState {
  return {
    version: 1,
    questions: state.questions.filter((q) => q.id !== questionId),
  };
}

/** Linked: the market's YES/NO, or VOID when it resolved INVALID. Custom: its own resolution. */
export function questionOutcome(
  q: JournalQuestion,
  markets: readonly Market[],
): JournalOutcome | null {
  if (q.kind === "custom") return q.resolution ?? null;
  const market = markets.find((item) => item.id === q.marketId);
  const outcome =
    market?.status === "resolved" ? market.resolution?.outcome : undefined;
  if (!outcome) return null;
  return outcome === "INVALID" ? "VOID" : outcome;
}

const isDue = (q: JournalQuestion, today: string) =>
  q.kind === "custom" && !q.resolution && !!q.checkBy && q.checkBy <= today;

/** Unresolved custom questions whose check-by date is today or earlier. */
export function dueQuestions(
  state: JournalState,
  today: string,
): JournalQuestion[] {
  return state.questions.filter((q) => isDue(q, today));
}

export function questionStatus(
  q: JournalQuestion,
  markets: readonly Market[],
  today: string,
): QuestionStatus {
  return questionOutcome(q, markets) ?? (isDue(q, today) ? "due" : "open");
}

interface Scored {
  linked: boolean;
  forecast: MarketForecast;
  hasCrowd: boolean;
}

function scoredItem(
  q: JournalQuestion,
  outcome: "YES" | "NO",
  final: JournalForecast,
): Scored {
  return {
    linked: q.kind === "market",
    hasCrowd: final.crowd !== undefined,
    forecast: {
      forecast: final.pct / 100,
      baseline: final.crowd ?? final.pct / 100,
      outcome: outcome === "YES" ? 1 : 0,
    },
  };
}

const mean = (values: readonly number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

function crowdSkill(scored: readonly Scored[]) {
  const linked = scored
    .filter((item) => item.linked && item.hasCrowd)
    .map((item) => item.forecast);
  return {
    linkedScored: linked.length,
    skill: linked.length ? (scoreForecasts(linked).skill ?? null) : null,
  };
}

export function summarize(
  state: JournalState,
  markets: readonly Market[],
): JournalSummary {
  const scored: Scored[] = [];
  let pending = 0;
  let voided = 0;
  for (const q of state.questions) {
    const final = latestForecast(q);
    if (!final) continue;
    const outcome = questionOutcome(q, markets);
    if (outcome === null) pending += 1;
    else if (outcome === "VOID") voided += 1;
    else scored.push(scoredItem(q, outcome, final));
  }
  const forecasts = scored.map((item) => item.forecast);
  return {
    scored: scored.length,
    pending,
    voided,
    brier: mean(forecasts.map((f) => (f.forecast - f.outcome) ** 2)),
    logScore: mean(
      forecasts.map((f) => Math.log(f.outcome ? f.forecast : 1 - f.forecast)),
    ),
    ...crowdSkill(scored),
    buckets: calibrationBuckets(forecasts),
  };
}

// ---------- Parsing stored data: drop what is invalid, keep the rest ----------

function parseForecast(raw: unknown): JournalForecast | null {
  if (!isRecord(raw) || !isText(raw.at) || !validPct(raw.pct)) return null;
  if (!isText(raw.note) || raw.note.length > MAX_NOTE) return null;
  const forecast: JournalForecast = {
    at: raw.at,
    pct: raw.pct,
    note: raw.note,
  };
  if (raw.crowd === undefined) return forecast;
  const crowd = raw.crowd;
  return typeof crowd === "number" && crowd >= 0 && crowd <= 1
    ? { at: raw.at, pct: raw.pct, crowd, note: raw.note }
    : null;
}

function kindFields(
  raw: Record<string, unknown>,
): Partial<JournalQuestion> | null {
  const id = raw.id as string;
  if (raw.kind === "market")
    return isText(raw.marketId) && raw.marketId && id === `m:${raw.marketId}`
      ? { kind: "market", marketId: raw.marketId }
      : null;
  if (raw.kind !== "custom" || !id.startsWith("c:") || !isDay(raw.checkBy))
    return null;
  const fields: Partial<JournalQuestion> = {
    kind: "custom",
    checkBy: raw.checkBy,
  };
  if (raw.resolution === undefined) return fields;
  return isText(raw.resolution) &&
    OUTCOMES.includes(raw.resolution) &&
    isText(raw.resolvedAt)
    ? {
        ...fields,
        resolution: raw.resolution as JournalOutcome,
        resolvedAt: raw.resolvedAt,
      }
    : null;
}

function parseQuestion(raw: unknown): JournalQuestion | null {
  if (!isRecord(raw) || !isText(raw.id) || !isText(raw.createdAt)) return null;
  if (!isText(raw.title) || !raw.title.trim() || !Array.isArray(raw.forecasts))
    return null;
  const fields = kindFields(raw);
  const forecasts = raw.forecasts
    .map(parseForecast)
    .filter((item): item is JournalForecast => item !== null);
  if (!fields || !forecasts.length) return null;
  return {
    id: raw.id,
    ...fields,
    title: raw.title,
    createdAt: raw.createdAt,
    forecasts,
  } as JournalQuestion;
}

/** Validates stored data; anything not journal-shaped becomes EMPTY_JOURNAL. */
export function parseJournal(raw: unknown): JournalState {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.questions))
    return EMPTY_JOURNAL;
  const seen = new Set<string>();
  const questions = raw.questions
    .map(parseQuestion)
    .filter((q): q is JournalQuestion => {
      if (!q || seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });
  return { version: 1, questions };
}

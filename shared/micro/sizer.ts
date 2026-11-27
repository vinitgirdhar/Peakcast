// Stake sizer: Kelly sizing for a binary Peakcast market (docs/plans/micro-apps.md, section 2).
// Pure and deterministic: no DOM, no clock, no randomness, and it never throws.
// ponytail: marginal-price Kelly; the live quote is the price-impact check. Solve Kelly against the LMSR curve only if users size large enough for that to matter.
import type { Outcome } from "../types.js";

export const MICRO = 1_000_000;
/** TradeInputSchema maximum. */
export const MAX_SHARES = 10_000;
export const MULTIPLIERS = [0.25, 0.5, 1] as const;
export type Multiplier = (typeof MULTIPLIERS)[number];

export interface SizerInput {
  /** P(YES), 0.01–0.99. */
  belief: number;
  /** Marginal YES price, 0.01–0.99. */
  price: number;
  /** Integer 0–1000. */
  feeBps: number;
  /** Integer ≥ 0. */
  bankrollMicros: number;
  multiplier: Multiplier;
}

export interface Sizing {
  /** Null: no edge on either side. */
  side: Outcome | null;
  /** Belief in the chosen side; 0 when side is null. */
  beliefSide: number;
  /** Side price × (1 + fee), capped at 0.9999; the better side's when side is null. */
  effectivePrice: number;
  /** beliefSide − effectivePrice; ≤ 0 when side is null (the better of the two sides). */
  edge: number;
  /** Full Kelly, (p − c)/(1 − c); 0 when no edge. */
  kellyFraction: number;
  /** kellyFraction × multiplier. */
  appliedFraction: number;
  /** Integer, never above the bankroll. */
  stakeMicros: number;
  /** Whole shares the stake buys at the marginal price, capped at MAX_SHARES. */
  shares: number;
  expectedProfitMicros: number;
  /** Expected log growth of the bankroll per bet at this stake; 0 when no edge. */
  expectedGrowth: number;
  /** The belief at which full Kelly stakes the same; 0 when no edge. */
  blendedBelief: number;
  /** True when an edge exists before the fee but not after it. */
  feeKillsEdge: boolean;
  /** Set when the stake buys more than MAX_SHARES: what one trade of MAX_SHARES costs and earns. */
  cap: ShareCap | null;
}

export interface ShareCap {
  /** MAX_SHARES × the marginal all-in price. */
  costMicros: number;
  /** Expected payout of MAX_SHARES minus costMicros. */
  expectedProfitMicros: number;
}

export type SizerErrors = Partial<Record<keyof SizerInput, string>>;
export type SizerResult =
  { ok: true; sizing: Sizing } | { ok: false; errors: SizerErrors };

export interface SizerPrefs {
  version: 1;
  multiplier: Multiplier;
  lastMarketId?: string;
}

export const SIZER_MESSAGES = {
  belief: "Give your probability as a whole percent from 1 to 99.",
  price: "Give the YES price in whole cents from 1 to 99.",
  feeBps: "Fee must be 0% to 10%.",
  bankrollMicros: "Enter practice credits of 0 or more.",
  multiplier: "Pick ¼, ½ or full Kelly.",
} as const satisfies Record<keyof SizerInput, string>;

const MAX_PRICE = 0.9999;
const MAX_CREDITS = 1_000_000_000;
// Accepts market prices like 0.0100000001 that are 1¢ up to float noise.
const TOLERANCE = 1e-9;

const inUnitRange = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0.01 - TOLERANCE &&
  value <= 0.99 + TOLERANCE;

/** True for a YES price the sizer accepts (1–99¢). LMSR market prices can leave that range. */
export const isSizablePrice = (price: number): boolean => inUnitRange(price);

export const isMultiplier = (value: unknown): value is Multiplier =>
  MULTIPLIERS.some((item) => item === value);

/** beliefSide − averagePrice: the edge left after paying the quoted average price. */
export const edgeAt = (beliefSide: number, averagePrice: number): number =>
  beliefSide - averagePrice;

/** max(0, (p − c)/(1 − c)); 0 when c ≥ 1 or either input is not a number. */
export function kellyFraction(beliefSide: number, price: number): number {
  if (!Number.isFinite(beliefSide) || !Number.isFinite(price) || price >= 1)
    return 0;
  return Math.max(0, (beliefSide - price) / (1 - price));
}

function validate(input: Partial<SizerInput>): SizerErrors {
  const errors: SizerErrors = {};
  if (!inUnitRange(input.belief)) errors.belief = SIZER_MESSAGES.belief;
  if (!inUnitRange(input.price)) errors.price = SIZER_MESSAGES.price;
  const fee = input.feeBps;
  if (!Number.isInteger(fee) || (fee as number) < 0 || (fee as number) > 1000)
    errors.feeBps = SIZER_MESSAGES.feeBps;
  const bankroll = input.bankrollMicros;
  if (!Number.isSafeInteger(bankroll) || (bankroll as number) < 0)
    errors.bankrollMicros = SIZER_MESSAGES.bankrollMicros;
  if (!isMultiplier(input.multiplier))
    errors.multiplier = SIZER_MESSAGES.multiplier;
  return errors;
}

interface SideQuote {
  side: Outcome;
  belief: number;
  price: number;
}

function sides(input: SizerInput): [SideQuote, SideQuote] {
  const load = 1 + input.feeBps / 10_000;
  const cap = (value: number) => Math.min(MAX_PRICE, value * load);
  return [
    { side: "YES", belief: input.belief, price: cap(input.price) },
    { side: "NO", belief: 1 - input.belief, price: cap(1 - input.price) },
  ];
}

const growth = (p: number, c: number, f: number): number =>
  p * Math.log1p((f * (1 - c)) / c) + (1 - p) * Math.log1p(-f);

function noEdge(input: SizerInput, best: SideQuote): Sizing {
  return {
    side: null,
    beliefSide: 0,
    effectivePrice: best.price,
    edge: best.belief - best.price,
    kellyFraction: 0,
    appliedFraction: 0,
    stakeMicros: 0,
    shares: 0,
    expectedProfitMicros: 0,
    expectedGrowth: 0,
    blendedBelief: 0,
    // With no fee the two sides' edges are ±(belief − price).
    feeKillsEdge: input.feeBps > 0 && input.belief !== input.price,
    cap: null,
  };
}

function withEdge(input: SizerInput, best: SideQuote): Sizing {
  const { belief: p, price: c } = best;
  const kelly = kellyFraction(p, c);
  const applied = kelly * input.multiplier;
  // The epsilon absorbs float noise such as 0.6 − 0.5 = 0.09999…, so a stake of
  // exactly 1,000 credits is not floored to 999.999999.
  const stakeMicros = Math.min(
    input.bankrollMicros,
    Math.floor(input.bankrollMicros * applied + 1e-6),
  );
  const sharePrice = Math.round(c * MICRO);
  const affordable = Math.floor(stakeMicros / sharePrice);
  const shares = Math.min(MAX_SHARES, affordable);
  const capCost = MAX_SHARES * sharePrice;
  return {
    side: best.side,
    beliefSide: p,
    effectivePrice: c,
    edge: p - c,
    kellyFraction: kelly,
    appliedFraction: applied,
    stakeMicros,
    shares,
    expectedProfitMicros: Math.round(stakeMicros * (p / c - 1)),
    expectedGrowth: growth(p, c, applied),
    blendedBelief: input.multiplier * p + (1 - input.multiplier) * c,
    feeKillsEdge: false,
    cap:
      affordable > MAX_SHARES
        ? {
            costMicros: capCost,
            expectedProfitMicros: Math.round(MAX_SHARES * p * MICRO) - capCost,
          }
        : null,
  };
}

/** Kelly stake for the side with an edge, or per-field errors with user-facing sentences. */
export function sizeBet(input: SizerInput): SizerResult {
  const errors = validate(input ?? {});
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const [yes, no] = sides(input);
  const best = yes.belief - yes.price >= no.belief - no.price ? yes : no;
  const sizing =
    best.belief > best.price ? withEdge(input, best) : noEdge(input, best);
  return { ok: true, sizing };
}

type Parsed<T> = { ok: true } & T;
type Failed = { ok: false; error: string };

/** "12.50" → 12_500_000. Rejects negatives, more than 2 decimals, more than 1e9 credits and non-numbers. */
export function parseCredits(
  text: string,
): Parsed<{ micros: number }> | Failed {
  const value = typeof text === "string" ? text.trim() : "";
  if (value === "")
    return { ok: false, error: "Enter a bankroll in practice credits." };
  if (/^-\s*\d/.test(value))
    return { ok: false, error: SIZER_MESSAGES.bankrollMicros };
  if (/^\d+\.\d{3,}$/.test(value))
    return { ok: false, error: "Use at most 2 decimal places." };
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value);
  if (!match)
    return {
      ok: false,
      error: "Enter a number of practice credits, like 250 or 12.50.",
    };
  const whole = Number(match[1]);
  if (
    whole > MAX_CREDITS ||
    (whole === MAX_CREDITS && /[1-9]/.test(match[2] ?? ""))
  )
    return {
      ok: false,
      error: "Enter at most 1,000,000,000 practice credits.",
    };
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  return { ok: true, micros: whole * MICRO + cents * 10_000 };
}

/** "35" → 0.35; whole percent 1–99 only (a trailing % is allowed). */
export function parsePercent(text: string): Parsed<{ value: number }> | Failed {
  const value = typeof text === "string" ? text.trim().replace(/%$/, "") : "";
  const whole = /^\d{1,2}$/.test(value) ? Number(value) : 0;
  if (whole < 1) return { ok: false, error: SIZER_MESSAGES.belief };
  return { ok: true, value: whole / 100 };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates stored preferences; anything unexpected falls back to quarter Kelly. */
export function parseSizerPrefs(raw: unknown): SizerPrefs {
  const stored = isRecord(raw) && raw.version === 1 ? raw : {};
  const multiplier = isMultiplier(stored.multiplier) ? stored.multiplier : 0.25;
  const id = stored.lastMarketId;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(id)
    ? { version: 1, multiplier, lastMarketId: id }
    : { version: 1, multiplier };
}

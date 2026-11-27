// Evidence updater: Bayes' rule in log-odds form, an odds converter and saved
// worksheets. Pure and deterministic: no DOM, no clock, no randomness, never throws.
// ponytail: naive-Bayes product; correlated evidence is a user-education problem, handled by the caveat line, not by modelling dependence.

export const MAX_EVIDENCE = 12;
export const MAX_WORKSHEETS = 20;
export const MAX_TITLE = 60;
export const MAX_LABEL = 80;
export const BAR_BITS = 10;

export const messages = {
  prior: "Prior must be from 0.1% to 99.9%.",
  ratio: "Ratio must be from 0.001 to 1000.",
  chances: "Each chance must be from 0.1% to 99.9%.",
  count: "Up to 12 pieces of evidence.",
  title: "Title must be 1 to 60 characters.",
} as const;

export interface Evidence {
  id: string;
  label: string;
  mode: "ratio" | "chances";
  /** Mode ratio: 0.001–1000. */
  ratio?: number;
  /** Mode chances: 0.001–0.999. */
  ifYes?: number;
  /** Mode chances: 0.001–0.999. */
  ifNo?: number;
}
export interface Step {
  id: string;
  ratio: number;
  bits: number;
  probabilityAfter: number;
}
export type ErrorField =
  | "prior"
  | "evidence"
  | `${string}.ratio`
  | `${string}.ifYes`
  | `${string}.ifNo`;
export interface FieldError {
  field: ErrorField;
  message: string;
}
export interface UpdateOk {
  ok: true;
  prior: number;
  posterior: number;
  /** Posterior log-odds in bits: logit2(prior) + Σ log2(ratio). */
  totalBits: number;
  /** Product of the likelihood ratios. */
  totalRatio: number;
  steps: Step[];
}
export type UpdateResult = UpdateOk | { ok: false; errors: FieldError[] };

/** Log-odds in bits. */
export const logit2 = (p: number): number => Math.log2(p / (1 - p));
export const fromBits = (bits: number): number => 1 / (1 + 2 ** -bits);

// Inclusive range check that forgives float noise such as 0.1 / 100.
const within = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= low - 1e-12 &&
  value <= high + 1e-12;
const validChance = (value: unknown) => within(value, 0.001, 0.999);

/** Null when the evidence is invalid. */
export function likelihoodRatio(e: Evidence): number | null {
  if (e.mode === "ratio") return within(e.ratio, 0.001, 1000) ? e.ratio : null;
  if (e.mode === "chances" && validChance(e.ifYes) && validChance(e.ifNo))
    return (e.ifYes as number) / (e.ifNo as number);
  return null;
}

function evidenceErrors(e: Evidence): FieldError[] {
  if (likelihoodRatio(e) !== null) return [];
  if (e.mode !== "chances")
    return [{ field: `${e.id}.ratio`, message: messages.ratio }];
  return (["ifYes", "ifNo"] as const)
    .filter((key) => !validChance(e[key]))
    .map((key) => ({ field: `${e.id}.${key}`, message: messages.chances }));
}

export function update(
  prior: number,
  evidence: readonly Evidence[],
): UpdateResult {
  const errors: FieldError[] = [
    ...(validChance(prior)
      ? []
      : [{ field: "prior", message: messages.prior }]),
    ...(evidence.length > MAX_EVIDENCE
      ? [{ field: "evidence", message: messages.count }]
      : []),
    ...evidence.flatMap(evidenceErrors),
  ] as FieldError[];
  if (errors.length) return { ok: false, errors };
  let running = logit2(prior);
  const steps = evidence.map((e): Step => {
    const ratio = likelihoodRatio(e) as number;
    const bits = Math.log2(ratio);
    running += bits;
    return { id: e.id, ratio, bits, probabilityAfter: fromBits(running) };
  });
  const moved = running - logit2(prior);
  return {
    ok: true,
    prior,
    posterior: fromBits(running),
    totalBits: running,
    totalRatio: 2 ** moved,
    steps,
  };
}

/** First error for a field, for inline display. */
export const errorFor = (
  errors: readonly FieldError[],
  field: ErrorField,
): string | undefined => errors.find((error) => error.field === field)?.message;

// ---------- Display ----------

const minus = "−";

/** "+1.58", "−0.58", "0.00": a Unicode minus and no sign on zero. */
export function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return (value < 0 ? minus : "+") + text;
}

/** Percent with one decimal; "<0.1%" and ">99.9%" outside that range. */
export function formatProbability(p: number): string {
  if (p < 0.001) return "<0.1%";
  if (p > 0.999) return ">99.9%";
  return `${(p * 100).toFixed(1)}%`;
}

/** "×3", "×0.5", "×4.9", "×120", "×1.0e36". */
export function formatRatio(ratio: number): string {
  const text =
    ratio >= 1e5 || ratio < 1e-3
      ? ratio.toExponential(1)
      : String(Number(ratio.toPrecision(ratio >= 100 ? 3 : 2)));
  return `×${text.replace("e+", "e")}`;
}

/** A probability as the prior field's percent: one decimal, kept within 0.1–99.9. */
export const priorPercent = (p: number): number =>
  Math.min(99.9, Math.max(0.1, Number((p * 100).toFixed(1))));

/** "Moved +2.3 bits (×4.9) from 30.0% to 67.6%". */
export function movedSentence(result: UpdateOk): string {
  const moved = result.totalBits - logit2(result.prior);
  return `Moved ${signed(moved, 1)} bits (${formatRatio(result.totalRatio)}) from ${formatProbability(result.prior)} to ${formatProbability(result.posterior)}`;
}

/** "That is 38 points above the crowd's 30%." */
export function crowdSentence(posterior: number, crowd: number): string {
  const crowdText = `the crowd's ${Math.round(crowd * 100)}%`;
  const points = Math.round((posterior - crowd) * 100);
  if (points === 0) return `That matches ${crowdText}.`;
  const size = Math.abs(points);
  return `That is ${size} ${size === 1 ? "point" : "points"} ${points > 0 ? "above" : "below"} ${crowdText}.`;
}

const unminus = (text: string): string => text.trim().replace(/−/g, "-");
const strict = (text: string): number => {
  const clean = unminus(text);
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(clean) ? Number(clean) : NaN;
};

/** Strict decimal parse of user text: trims, accepts a Unicode minus and a trailing "%". NaN otherwise. */
export const parseNumber = (text: string): number =>
  strict(text.trim().replace(/\s*%$/, ""));

// ---------- Odds converter ----------

export type OddsFormat =
  "percent" | "decimal" | "american" | "fractional" | "odds" | "oneIn";
export const oddsFormats: readonly OddsFormat[] = [
  "percent",
  "decimal",
  "american",
  "fractional",
  "odds",
  "oneIn",
];
export interface OddsForms {
  probability: number;
  percent: string;
  decimal: string;
  american: string;
  fractional: string;
  odds: string;
  oneIn: string;
  bits: string;
}
export const oddsErrors: Record<OddsFormat, string> = {
  percent: "Enter a percent between 0 and 100.",
  decimal: "Decimal odds must be greater than 1.",
  american: `American odds look like +150 or ${minus}200.`,
  fractional: "Fractional odds look like 3/2.",
  odds: "Odds look like 2:3.",
  oneIn: "Enter N greater than 1.",
};

/** "a/b", "a-b" or "a:b" with both parts positive. */
const pair = (text: string, separator: RegExp): [number, number] | null => {
  const parts = unminus(text).split(separator).map(strict);
  return parts.length === 2 && parts[0] > 0 && parts[1] > 0
    ? [parts[0], parts[1]]
    : null;
};
const parsers: Record<OddsFormat, (text: string) => number | null> = {
  percent: (text) => {
    const x = parseNumber(text);
    return x > 0 && x < 100 ? x / 100 : null;
  },
  decimal: (text) => {
    const x = strict(text);
    return x > 1 ? 1 / x : null;
  },
  american: (text) => {
    const x = strict(text);
    if (!(Math.abs(x) >= 100)) return null;
    return x > 0 ? 100 / (x + 100) : -x / (-x + 100);
  },
  fractional: (text) => {
    const parts = pair(text, /[/-]/);
    return parts && parts[1] / (parts[0] + parts[1]);
  },
  odds: (text) => {
    const parts = pair(text, /:/);
    return parts && parts[0] / (parts[0] + parts[1]);
  },
  oneIn: (text) => {
    const x = strict(text.replace(/^\s*1\s+in\s+/i, ""));
    return x > 1 ? 1 / x : null;
  },
};

export function parseOdds(
  format: OddsFormat,
  text: string,
): { ok: true; probability: number } | { ok: false; error: string } {
  const parse = parsers[format] as
    ((text: string) => number | null) | undefined;
  const probability = parse && typeof text === "string" ? parse(text) : null;
  if (probability !== null && probability > 0 && probability < 1)
    return { ok: true, probability };
  return { ok: false, error: oddsErrors[format] ?? "Choose an odds format." };
}

/** Closest rational a/b with b ≤ maxDen: continued-fraction convergents and semiconvergents; a, b coprime. */
export function approxFraction(x: number, maxDen = 100): [number, number] {
  if (!Number.isFinite(x) || x < 0) return [0, 1];
  const limit = Math.max(1, Math.floor(maxDen) || 1);
  let [p0, q0, p1, q1] = [0, 1, 1, 0];
  let rest = x;
  for (let i = 0; i < 64; i += 1) {
    const a = Math.floor(rest);
    const q2 = q0 + a * q1;
    if (q2 > limit) {
      // Best semiconvergent between the last two convergents.
      const k = Math.floor((limit - q0) / q1);
      const semi: [number, number] = [p0 + k * p1, q0 + k * q1];
      return Math.abs(semi[0] / semi[1] - x) < Math.abs(p1 / q1 - x)
        ? semi
        : [p1, q1];
    }
    [p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2];
    const fraction = rest - a;
    if (fraction < 1e-12) break;
    rest = 1 / fraction;
  }
  return [p1, q1];
}

/** All display forms of a probability (clamped into 0 < p < 1). */
export function toOddsForms(p: number): OddsForms {
  const probability = Number.isFinite(p)
    ? Math.min(Math.max(p, 1e-6), 1 - 1e-6)
    : 0.5;
  const q = 1 - probability;
  const american =
    probability >= 0.5 ? (-100 * probability) / q : (100 * q) / probability;
  const [fa, fb] = approxFraction(q / probability);
  const [oa, ob] = approxFraction(probability / q);
  return {
    probability,
    percent: `${(probability * 100).toFixed(1)}%`,
    decimal: (1 / probability).toFixed(2),
    american: signed(Math.round(american), 0),
    fractional: `${fa}/${fb}`,
    odds: `${oa}:${ob}`,
    oneIn: `1 in ${(1 / probability).toFixed(1)}`,
    bits: `${signed(logit2(probability), 2)} bits`,
  };
}

// ---------- Worksheets ----------

export interface Worksheet {
  id: string;
  title: string;
  prior: number;
  marketId?: string;
  evidence: Evidence[];
  updatedAt: string;
}
/** At most 20 worksheets, newest first. */
export interface BayesState {
  version: 1;
  worksheets: Worksheet[];
}

const empty = (): BayesState => ({ version: 1, worksheets: [] });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
/** Keeps the first item for each id: ids are React keys and lookup keys. */
const uniqueById = <T extends { id: string }>(items: T[]): T[] =>
  items.filter(
    (item, index) => items.findIndex((other) => other.id === item.id) === index,
  );

function parseEvidence(raw: unknown): Evidence | null {
  if (!isRecord(raw) || !text(raw.id)) return null;
  if (raw.mode !== "ratio" && raw.mode !== "chances") return null;
  const label =
    typeof raw.label === "string" ? raw.label.slice(0, MAX_LABEL) : "";
  return raw.mode === "ratio"
    ? { id: raw.id, label, mode: "ratio", ratio: finite(raw.ratio) }
    : {
        id: raw.id,
        label,
        mode: "chances",
        ifYes: finite(raw.ifYes),
        ifNo: finite(raw.ifNo),
      };
}

function parseWorksheet(raw: unknown): Worksheet | null {
  if (!isRecord(raw) || !text(raw.id) || !text(raw.title)) return null;
  if (!validChance(raw.prior) || !text(raw.updatedAt)) return null;
  const evidence = Array.isArray(raw.evidence)
    ? uniqueById(
        raw.evidence
          .map(parseEvidence)
          .filter((e): e is Evidence => e !== null),
      ).slice(0, MAX_EVIDENCE)
    : [];
  return {
    id: raw.id,
    title: raw.title.slice(0, MAX_TITLE),
    prior: raw.prior,
    ...(text(raw.marketId) ? { marketId: raw.marketId } : {}),
    evidence,
    updatedAt: raw.updatedAt,
  };
}

/** Validates stored data; anything missing, old or corrupt becomes an empty state. */
export function parseBayes(raw: unknown): BayesState {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.worksheets))
    return empty();
  return {
    version: 1,
    worksheets: uniqueById(
      raw.worksheets
        .map(parseWorksheet)
        .filter((sheet): sheet is Worksheet => sheet !== null),
    ).slice(0, MAX_WORKSHEETS),
  };
}

/** Replaces by id, else prepends; the saved sheet moves to the top and the oldest beyond 20 is dropped. */
export function saveWorksheet(state: BayesState, sheet: Worksheet): BayesState {
  return {
    version: 1,
    worksheets: [
      sheet,
      ...state.worksheets.filter((item) => item.id !== sheet.id),
    ].slice(0, MAX_WORKSHEETS),
  };
}

export function deleteWorksheet(state: BayesState, id: string): BayesState {
  return {
    version: 1,
    worksheets: state.worksheets.filter((item) => item.id !== id),
  };
}

/** Title used when the field is left empty: the market's title (shortened to fit) or "Worksheet". */
export function defaultTitle(marketTitle?: string): string {
  const title = marketTitle?.trim() || "Worksheet";
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

export function checkTitle(
  title: string,
): { ok: true; title: string } | { ok: false; error: string } {
  const clean = title.trim();
  return clean.length >= 1 && clean.length <= MAX_TITLE
    ? { ok: true, title: clean }
    : { ok: false, error: messages.title };
}

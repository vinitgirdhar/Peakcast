import type { DraftInput } from "./types.js";
import {
  AGENCIES,
  BINARY_START,
  BOUNDARY,
  CATCH_ALL,
  CHOICE,
  CLOCK,
  COMPARATOR,
  DAY_LEVEL,
  DAY_MONTH_YEAR,
  DURATION,
  GENERIC_HOST_LABELS,
  ISO_DATE,
  MODAL_MAY,
  MONTH_DAY_YEAR,
  MONTH_NAME,
  MONTH_YEAR,
  NAMED_ALTERNATIVES,
  NO_LABEL,
  NUMBER,
  OPEN_SOURCES,
  OUTAGE,
  PLACEHOLDER_HOSTS,
  PLACEHOLDER_SUFFIXES,
  POSTPONEMENT,
  PRIVATE_SUFFIXES,
  QUARTER_YEAR,
  REFUND,
  REVISION_TRIGGER,
  SCHEDULED_EVENT,
  SEARCH_ENGINES,
  SECRET_PARAM,
  SELF_REFERENCE,
  SHORTENER_HOSTS,
  SOCIAL_HOSTS,
  STOP_WORDS,
  SUBJECTIVE_JUDGE,
  THRESHOLD,
  VAGUE,
  VINTAGE,
  YEAR,
  YEAR_PHRASE,
  ZONE_ABBREVIATION,
  ZONE_WORDS,
  type Agency,
} from "./lint-data.js";

export type LintSeverity = "block" | "warn" | "info";
export type LintField = keyof DraftInput;
export interface LintFinding {
  id: string;
  severity: LintSeverity;
  field: LintField;
  message: string;
  /** The text that triggered the finding, for highlighting. */
  match?: string;
}
export interface LintReport {
  risk: number;
  label: "Blocked" | "Review" | "Clear";
  findings: LintFinding[];
}

const DAY = 86_400_000;
const RULES = ["yesRule", "noRule", "invalidRule"] as const;
const TEXTS = ["question", ...RULES] as const;
const ORDER: Record<LintSeverity, number> = { block: 0, warn: 1, info: 2 };
const WEIGHT: Record<LintSeverity, number> = { block: 40, warn: 12, info: 3 };

interface Context {
  draft: DraftInput;
  now: number;
  /** NaN until closesAt parses. */
  closes: number;
  url?: URL;
  host: string;
  agency?: Agency;
  eventEnd?: number;
}
type Check = (context: Context) => LintFinding[];

const finding = (
  id: string,
  severity: LintSeverity,
  field: LintField,
  message: string,
  match?: string,
): LintFinding => ({
  id,
  severity,
  field,
  message,
  ...(match !== undefined && { match }),
});
const all = (pattern: RegExp, text: string) => [
  ...text.matchAll(new RegExp(pattern.source, pattern.flags + "g")),
];
const hostIs = (host: string, domain: string) =>
  host === domain || host.endsWith("." + domain);
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
const normalized = (text: string) => words(text).join(" ");
const day = (at: number) => new Date(at).toISOString().slice(0, 10);
const monthIndex = (name: string) =>
  [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(name.slice(0, 3).toLowerCase());
const endOfDay = (year: number, month: number, date: number) =>
  month >= 0 && month < 12 && date >= 1 && date <= 31
    ? Date.UTC(year, month, date + 1)
    : undefined;

// Most specific first; each match is blanked so "12 April 2027" is not also
// read as "April 2027".
const DATE_READERS: [RegExp, (groups: string[]) => number | undefined][] = [
  [ISO_DATE, ([y, m, d]) => endOfDay(+y, +m - 1, +d)],
  [MONTH_DAY_YEAR, ([m, d, y]) => endOfDay(+y, monthIndex(m), +d)],
  [DAY_MONTH_YEAR, ([d, m, y]) => endOfDay(+y, monthIndex(m), +d)],
  [MONTH_YEAR, ([m, y]) => Date.UTC(+y, monthIndex(m) + 1, 1)],
  [QUARTER_YEAR, ([q, y]) => Date.UTC(+y, +q * 3, 1)],
  [
    YEAR_PHRASE,
    ([word, y]) =>
      /^(?:by|before|until|start of)$/i.test(word)
        ? Date.UTC(+y, 0, 1)
        : Date.UTC(+y + 1, 0, 1),
  ],
];

/** End times (UTC ms) of every date or period the text names. */
function dateMentions(text: string): number[] {
  const ends: number[] = [];
  let rest = text;
  for (const [pattern, read] of DATE_READERS)
    rest = rest.replace(
      new RegExp(pattern.source, pattern.flags + "g"),
      (match: string, ...groups: string[]) => {
        const end = read(groups);
        if (end !== undefined) ends.push(end);
        return " ".repeat(match.length);
      },
    );
  return ends;
}

function lagDays(context: Context): number | undefined {
  const { agency, draft } = context;
  if (!agency) return undefined;
  const text = `${draft.question} ${draft.yesRule}`;
  return (
    agency.series?.find((series) => series.pattern.test(text))?.lagDays ??
    agency.lagDays
  );
}

const comparatorWithoutNumber: Check = ({ draft }) => {
  const comparisons = (["question", "yesRule"] as const).flatMap((field) =>
    all(COMPARATOR, draft[field]).map((match) => ({ field, match })),
  );
  if (
    !comparisons.length ||
    comparisons.some(({ field, match }) =>
      NUMBER.test(draft[field].slice(match.index + match[0].length)),
    )
  )
    return [];
  const { field, match } = comparisons[0];
  return [
    finding(
      "comparator-without-number",
      "block",
      field,
      `"${match[0]}" compares against nothing measurable. Name the number, for example "above 25,000 points".`,
      match[0],
    ),
  ];
};

const rulesIdentical: Check = ({ draft }) =>
  (
    [
      ["yesRule", "noRule"],
      ["yesRule", "invalidRule"],
      ["noRule", "invalidRule"],
    ] as const
  )
    .filter(
      ([first, second]) =>
        normalized(draft[first]) &&
        normalized(draft[first]) === normalized(draft[second]),
    )
    .map(([first, second]) =>
      finding(
        "rules-identical",
        "block",
        second,
        `This rule says the same as the ${first === "yesRule" ? "YES" : "NO"} rule, so one result would settle two ways.`,
        draft[second].trim(),
      ),
    );

const subjectiveJudge: Check = ({ draft }) =>
  RULES.flatMap((field) => {
    const match = draft[field].match(SUBJECTIVE_JUDGE);
    return match
      ? [
          finding(
            "subjective-judge",
            "block",
            field,
            "A person, not a published record, would decide this rule. The creator also proposes the outcome, so name a source and a measurable criterion.",
            match[0],
          ),
        ]
      : [];
  });

const blockingUrl: Check = ({ url, host }) => {
  if (!url) return [];
  if (SHORTENER_HOSTS.some((domain) => hostIs(host, domain)))
    return [
      finding(
        "url-shortener",
        "block",
        "sourceUrl",
        "Shortened links can be pointed anywhere after launch. Link the source page directly.",
        host,
      ),
    ];
  const isPrivate =
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.startsWith("[") ||
    !host.includes(".") ||
    PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
  return isPrivate
    ? [
        finding(
          "url-not-public-host",
          "block",
          "sourceUrl",
          "Traders cannot open an IP address, local or internal host. Use the public page of the source.",
          host,
        ),
      ]
    : [];
};

const warningUrl: Check = ({ url, host }) => {
  if (!url) return [];
  const labels = host.split(".");
  const secret = [...url.searchParams.keys()].find((key) =>
    SECRET_PARAM.test(key),
  );
  const flags: [boolean, string, string, string?][] = [
    [
      PLACEHOLDER_HOSTS.some((domain) => hostIs(host, domain)) ||
        PLACEHOLDER_SUFFIXES.some((suffix) => host.endsWith(suffix)),
      "url-placeholder",
      "This is a placeholder domain, not a real source.",
      host,
    ],
    [
      SOCIAL_HOSTS.some((domain) => hostIs(host, domain)),
      "url-social",
      "Social posts can be edited or deleted and are not a primary record. Link the publisher's own page.",
      host,
    ],
    [
      labels.some((label) => SEARCH_ENGINES.includes(label)) &&
        (url.pathname.startsWith("/search") || url.searchParams.has("q")),
      "url-search-page",
      "Search results change over time. Link the page that publishes the figure.",
      host,
    ],
    [
      secret !== undefined,
      "url-secret-param",
      "The link carries what looks like a secret. Remove it before the link is published.",
      secret,
    ],
  ];
  return flags
    .filter(([flagged]) => flagged)
    .map(([, id, message, match]) =>
      finding(id, "warn", "sourceUrl", message, match),
    );
};

const closingWindow: Check = ({ closes, now }) => {
  if (!Number.isFinite(closes)) return [];
  if (closes - now < 3_600_000)
    return [
      finding(
        "closes-too-soon",
        "block",
        "closesAt",
        "Trading would close within an hour. Allow at least an hour of trading.",
      ),
    ];
  return closes - now > 2 * 365.25 * DAY
    ? [
        finding(
          "closes-too-far",
          "warn",
          "closesAt",
          "Trading stays open more than two years; sources and rules drift over that time.",
        ),
      ]
    : [];
};

const eventTiming: Check = (context) => {
  const { closes, eventEnd } = context;
  if (!Number.isFinite(closes) || eventEnd === undefined) return [];
  const lag = lagDays(context) ?? 1;
  if (closes > eventEnd + lag * DAY)
    return [
      finding(
        "close-after-event",
        "warn",
        "closesAt",
        `The event ends ${day(eventEnd - 1)} and the figure is expected about ${lag} day${lag === 1 ? "" : "s"} later, but trading stays open until ${day(closes)}. Close trading before the outcome can be public.`,
      ),
    ];
  return closes < eventEnd - 7 * DAY
    ? [
        finding(
          "close-before-event",
          "info",
          "closesAt",
          `Trading closes more than a week before the event ends (${day(eventEnd - 1)}).`,
        ),
      ]
    : [];
};

const thresholdBoundary: Check = ({ draft }) => {
  const fields = ["question", "yesRule"] as const;
  if (fields.some((field) => BOUNDARY.test(draft[field]))) return [];
  for (const field of fields) {
    const match = draft[field].match(THRESHOLD);
    if (match)
      return [
        finding(
          "threshold-boundary",
          "warn",
          field,
          'Say whether exactly the threshold counts: write "at least" or "strictly above".',
          match[0],
        ),
      ];
  }
  return [];
};

const ruleGap: Check = ({ draft }) =>
  draft.noRule.trim() &&
  !CATCH_ALL.test(
    draft.noRule.replace(
      new RegExp(NO_LABEL.source, NO_LABEL.flags + "g"),
      " ",
    ),
  )
    ? [
        finding(
          "rule-gap",
          "warn",
          "noRule",
          'A result that matches neither rule is not covered. Make NO the complement of YES, for example "Otherwise, resolves NO."',
        ),
      ]
    : [];

const vagueTerms: Check = ({ draft }) =>
  TEXTS.flatMap((field) => {
    const found = [...all(VAGUE, draft[field]), ...all(MODAL_MAY, draft[field])]
      .sort((a, b) => a.index - b.index)
      .map((match) => match[0]);
    if (!found.length) return [];
    const list = [...new Set(found.map((term) => term.toLowerCase()))];
    return [
      finding(
        "vague-term",
        field === "question" ? "info" : "warn",
        field,
        `Vague wording: ${list.map((term) => `"${term}"`).join(", ")}. Replace it with something a stranger could check.`,
        found[0],
      ),
    ];
  });

const eventDates: Check = ({ draft, eventEnd }) => {
  if (!draft.question.trim()) return [];
  if (eventEnd === undefined)
    return [
      finding(
        "event-date-missing",
        "warn",
        "question",
        'Name the date or period the outcome is measured over, for example "in October 2026" or "on 2027-04-12".',
      ),
    ];
  return [];
};

const dateWithoutYear: Check = ({ draft }) => {
  const month = draft.question.match(MONTH_NAME);
  return month && !YEAR.test(`${draft.question} ${draft.yesRule}`)
    ? [
        finding(
          "date-without-year",
          "warn",
          "question",
          `"${month[0]}" has no year. Add the year so the date cannot roll over.`,
          month[0],
        ),
      ]
    : [];
};

const timezone: Check = ({ draft }) => {
  if (
    TEXTS.some(
      (f) => ZONE_ABBREVIATION.test(draft[f]) || ZONE_WORDS.test(draft[f]),
    )
  )
    return [];
  for (const field of TEXTS) {
    const match = draft[field].match(DAY_LEVEL) ?? draft[field].match(CLOCK);
    if (match)
      return [
        finding(
          "timezone-missing",
          "warn",
          field,
          'A day or time without a zone can land on two dates. Add one, for example "23:59 UTC" or "IST".',
          match[0],
        ),
      ];
  }
  const field = (["question", "yesRule"] as const).find((f) =>
    YEAR.test(draft[f]),
  );
  const year = field && draft[field].match(YEAR);
  return field && year
    ? [
        finding(
          "timezone-missing",
          "info",
          field,
          "Periods have no time zone. If the boundary matters, say which zone ends the period.",
          year[0],
        ),
      ]
    : [];
};

const invalidRuleCoverage: Check = ({ draft }) => {
  const rule = draft.invalidRule;
  if (!rule.trim()) return [];
  const results: LintFinding[] = [];
  if (!dateMentions(rule).length && !DURATION.test(rule))
    results.push(
      finding(
        "no-publication-deadline",
        "warn",
        "invalidRule",
        'Say when a missing publication counts, for example "by 2027-02-28 23:59 UTC" or "within 30 days".',
      ),
    );
  if (!OUTAGE.test(rule))
    results.push(
      finding(
        "outage-unhandled",
        "warn",
        "invalidRule",
        "Say what happens if the source is unavailable, delayed, discontinued or does not publish.",
      ),
    );
  const refund = rule.match(REFUND);
  if (refund)
    results.push(
      finding(
        "invalid-refund-wording",
        "info",
        "invalidRule",
        "INVALID pays 0.5 credit per share to both sides; it is not a refund of what each trader paid.",
        refund[0],
      ),
    );
  return results;
};

const revisions: Check = ({ draft, agency }) => {
  if (!draft.yesRule.trim()) return [];
  const trigger = TEXTS.map((f) => draft[f].match(REVISION_TRIGGER)).find(
    Boolean,
  );
  if (!agency?.revisable && !trigger) return [];
  return RULES.some((f) => VINTAGE.test(draft[f]))
    ? []
    : [
        finding(
          "revision-unspecified",
          "warn",
          "yesRule",
          'This figure gets revised. Name the vintage, for example "as first published" or "revisions do not change the result".',
          trigger?.[0],
        ),
      ];
};

const postponement: Check = ({ draft }) => {
  const event = draft.question.match(SCHEDULED_EVENT);
  return event && !TEXTS.some((f) => POSTPONEMENT.test(draft[f]))
    ? [
        finding(
          "postponement-unhandled",
          "warn",
          "question",
          `Say how the market resolves if the ${event[0].toLowerCase()} is postponed, cancelled or abandoned.`,
          event[0],
        ),
      ]
    : [];
};

const multipleSources: Check = ({ draft }) =>
  RULES.flatMap((field) => {
    const match =
      draft[field].match(NAMED_ALTERNATIVES) ??
      draft[field].match(OPEN_SOURCES);
    return match
      ? [
          finding(
            "multiple-sources",
            "warn",
            field,
            "Alternative sources can disagree. Name one source and say which wins if it is silent.",
            match[0],
          ),
        ]
      : [];
  });

const sourceNotInRule: Check = ({ draft, host }) => {
  if (!draft.yesRule.trim()) return [];
  const names = [
    ...words(draft.sourceName).filter(
      (word) => word.length >= 3 && !STOP_WORDS.includes(word),
    ),
    ...host
      .split(".")
      .slice(0, -1)
      .filter((label) => label && !GENERIC_HOST_LABELS.includes(label)),
  ];
  const rule = new Set(words(draft.yesRule));
  return names.length && !names.some((name) => rule.has(name))
    ? [
        finding(
          "source-not-in-rule",
          "warn",
          "yesRule",
          "The YES rule does not name the source. Say which publication decides it.",
        ),
      ]
    : [];
};

const selfReference: Check = ({ draft }) => {
  const field = TEXTS.find((f) => SELF_REFERENCE.test(draft[f]));
  return field
    ? [
        finding(
          "self-reference",
          "warn",
          field,
          "The outcome depends on this market itself, which traders can move. Resolve on an outside record.",
          draft[field].match(SELF_REFERENCE)?.[0],
        ),
      ]
    : [];
};

const questionShape: Check = ({ draft }) => {
  const question = draft.question;
  if (!question.trim()) return [];
  const choice = question.match(CHOICE);
  return !BINARY_START.test(question) || choice
    ? [
        finding(
          "question-not-binary",
          "warn",
          "question",
          'Ask one yes-or-no question starting with "Will", "Is" or "Does", without offering alternatives.',
          choice?.[0],
        ),
      ]
    : [];
};

const sourceNotes: Check = (context) => {
  const { draft, url, host, agency } = context;
  if (!url) return [];
  const results: LintFinding[] = [];
  const lag = lagDays(context);
  if (agency && lag)
    results.push(
      finding(
        "publication-lag",
        "info",
        "sourceUrl",
        `Expect the figure about ${lag} days after the period ends; resolution waits for it.`,
        agency.host,
      ),
    );
  const source = draft.sourceName.toLowerCase();
  const named = AGENCIES.find((item) =>
    item.names.some((name) => new RegExp(`\\b${name}\\b`).test(source)),
  );
  if (named && !hostIs(host, named.host))
    results.push(
      finding(
        "source-host-mismatch",
        "info",
        "sourceUrl",
        `The source name points to ${named.host}, but the link goes to ${host}.`,
        host,
      ),
    );
  return results;
};

const CHECKS: Check[] = [
  comparatorWithoutNumber,
  rulesIdentical,
  subjectiveJudge,
  blockingUrl,
  closingWindow,
  thresholdBoundary,
  ruleGap,
  vagueTerms,
  eventDates,
  dateWithoutYear,
  timezone,
  eventTiming,
  invalidRuleCoverage,
  revisions,
  postponement,
  multipleSources,
  sourceNotInRule,
  selfReference,
  questionShape,
  warningUrl,
  sourceNotes,
];

function context(draft: DraftInput, now: number): Context {
  let url: URL | undefined;
  try {
    url = new URL(draft.sourceUrl);
  } catch {
    url = undefined;
  }
  const host = url?.hostname.toLowerCase().replace(/\.$/, "") ?? "";
  const ends = dateMentions(`${draft.question}\n${draft.yesRule}`);
  return {
    draft,
    now,
    closes: Date.parse(draft.closesAt),
    url,
    host,
    agency: url && AGENCIES.find((agency) => hostIs(host, agency.host)),
    eventEnd: ends.length ? Math.max(...ends) : undefined,
  };
}

/**
 * Deterministic rule check over a draft: no network, no clock unless `now` is
 * omitted. Checks on a field run once it has text, so a half-filled form only
 * reports what is already wrong.
 */
export function lintDraft(draft: DraftInput, now = Date.now()): LintReport {
  const shared = context(draft, now);
  const findings = CHECKS.flatMap((check) => check(shared)).sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );
  const risk = Math.min(
    100,
    findings.reduce((total, item) => total + WEIGHT[item.severity], 0),
  );
  return {
    risk,
    label: findings.some((item) => item.severity === "block")
      ? "Blocked"
      : risk >= 15
        ? "Review"
        : "Clear",
    findings,
  };
}

const distinctIds = (report: LintReport, severity: LintSeverity) => [
  ...new Set(
    report.findings
      .filter((item) => item.severity === severity)
      .map((item) => item.id),
  ),
];

/** Why launch is refused, or undefined when nothing blocks it. */
export function blockingReason(report: LintReport): string | undefined {
  const ids = distinctIds(report, "block");
  return ids.length
    ? `Fix ${ids.length} blocking rule problem${ids.length === 1 ? "" : "s"} before launch: ${ids.join(", ")}.`
    : undefined;
}

/** Distinct warning ids, as published on a launched market. */
export const warningIds = (report: LintReport) => distinctIds(report, "warn");

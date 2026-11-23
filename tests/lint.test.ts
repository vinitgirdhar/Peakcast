import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blockingReason,
  lintDraft,
  type LintReport,
  type LintSeverity,
} from "../shared/lint.js";
import { seedMarkets } from "../server/fixtures.js";
import { buildApp } from "../server/app.js";
import type { DraftInput } from "../shared/types.js";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const DAY = 86_400_000;

// A well-specified market: the reference every bad draft below is cut from.
const base: DraftInput = {
  question:
    "Will the U.S. BLS report a 12-month CPI-U change of at least 3.0% for December 2026?",
  sourceName: "U.S. Bureau of Labor Statistics",
  sourceUrl: "https://www.bls.gov/cpi/",
  closesAt: "2027-01-01T00:00:00Z",
  yesRule:
    "Resolves YES if the first BLS release of December 2026 CPI-U all-items, not seasonally adjusted, reports a 12-month change of at least 3.0%.",
  noRule: "Resolves NO if that first release reports any value below 3.0%.",
  invalidRule:
    "Resolves INVALID if BLS has not published December 2026 CPI-U by 2027-02-28 23:59 UTC or discontinues the series.",
};

const ids = (report: LintReport, severity: LintSeverity) =>
  report.findings
    .filter((finding) => finding.severity === severity)
    .map((finding) => finding.id);

function expectFindings(
  draft: DraftInput,
  expected: Partial<Record<LintSeverity, string[]>>,
  now = NOW,
) {
  const report = lintDraft(draft, now);
  for (const severity of ["block", "warn", "info"] as const)
    for (const id of expected[severity] ?? [])
      assert.ok(
        ids(report, severity).includes(id),
        `expected ${severity} ${id}; got ${JSON.stringify(report.findings)}`,
      );
  return report;
}

const noBlock = (report: LintReport) =>
  assert.deepEqual(ids(report, "block"), [], JSON.stringify(report.findings));

test("the reference draft is clear: no block, no warning", () => {
  const report = lintDraft(base, NOW);
  assert.deepEqual(ids(report, "block"), []);
  assert.deepEqual(ids(report, "warn"), [], JSON.stringify(report.findings));
  assert.equal(report.label, "Clear");
});

test("1: an undated Bitcoin threshold with a refund rule warns but does not block", () => {
  const report = expectFindings(
    {
      question: "Will Bitcoin go above $100k?",
      sourceName: "CoinMarketCap",
      sourceUrl: "https://coinmarketcap.com/currencies/bitcoin/",
      closesAt: "2027-06-30T00:00:00Z",
      yesRule: "Bitcoin price goes above 100k.",
      noRule: "Bitcoin stays under 100k.",
      invalidRule: "If unclear, refund everyone.",
    },
    {
      warn: [
        "threshold-boundary",
        "rule-gap",
        "event-date-missing",
        "source-not-in-rule",
        "outage-unhandled",
        "no-publication-deadline",
      ],
      info: ["invalid-refund-wording"],
    },
  );
  noBlock(report);
  assert.equal(report.label, "Review");
});

test("2: a comparison with no number blocks", () => {
  const report = expectFindings(
    {
      ...base,
      question: "Will Nifty 50 close higher?",
      yesRule: "Nifty 50 closes higher on the NSE.",
    },
    { block: ["comparator-without-number"], warn: ["event-date-missing"] },
  );
  assert.equal(report.label, "Blocked");
  assert.equal(report.findings[0].severity, "block");
  const finding = report.findings[0];
  assert.equal(finding.field, "question");
  assert.equal(finding.match, "higher");
});

test("3: MoSPI CPI closing after the figure is public warns about timing and revisions", () => {
  const report = expectFindings(
    {
      question: "Will India's CPI inflation fall below 4% in October 2026?",
      sourceName: "MoSPI",
      sourceUrl: "https://mospi.gov.in/",
      closesAt: "2026-11-30T18:30:00Z",
      yesRule: "MoSPI reports October 2026 all-India CPI inflation below 4%.",
      noRule: "Otherwise, resolves NO.",
      invalidRule: "If MoSPI does not publish the figure, INVALID.",
    },
    {
      warn: [
        "close-after-event",
        "revision-unspecified",
        "threshold-boundary",
        "no-publication-deadline",
      ],
      info: ["publication-lag"],
    },
  );
  noBlock(report);
  assert.ok(!ids(report, "warn").includes("rule-gap"));
  assert.ok(!ids(report, "warn").includes("outage-unhandled"));
});

test("4: source URL structure", () => {
  const cases: [string, LintSeverity, string[]][] = [
    ["https://bit.ly/3AbCdEf", "block", ["url-shortener"]],
    ["https://192.168.1.20/report", "block", ["url-not-public-host"]],
    ["https://x.com/RBI", "warn", ["url-social"]],
    ["https://www.google.com/search?q=cpi", "warn", ["url-search-page"]],
    [
      "https://data.example.org/x?token=abc123",
      "warn",
      ["url-placeholder", "url-secret-param"],
    ],
    ["https://intranet.local/cpi", "block", ["url-not-public-host"]],
    ["https://[::1]/cpi", "block", ["url-not-public-host"]],
    ["https://stats.example/cpi", "warn", ["url-placeholder"]],
    ["https://duckduckgo.com/?q=cpi", "warn", ["url-search-page"]],
  ];
  for (const [sourceUrl, severity, expected] of cases)
    expectFindings({ ...base, sourceUrl }, { [severity]: expected });
  // The Bureau named as source but a different host is only a note.
  expectFindings(
    { ...base, sourceUrl: "https://www.statista.com/cpi" },
    { info: ["source-host-mismatch"] },
  );
  // Unparseable URLs are the schema's job; the linter stays quiet.
  const report = lintDraft({ ...base, sourceUrl: "not a url" }, NOW);
  assert.ok(!report.findings.some((finding) => finding.field === "sourceUrl"));
});

test("5: an IPL match without a time zone or a postponement rule", () => {
  const report = expectFindings(
    {
      question: "Will Mumbai Indians beat CSK in the match on 2027-04-12?",
      sourceName: "Indian Premier League",
      sourceUrl: "https://www.iplt20.com/matches/results",
      closesAt: "2027-04-12T14:00:00Z",
      yesRule: "Mumbai Indians win the match on 12 April 2027.",
      noRule: "Chennai Super Kings win the match.",
      invalidRule: "If there is no result, refund.",
    },
    {
      warn: [
        "postponement-unhandled",
        "timezone-missing",
        "rule-gap",
        "outage-unhandled",
      ],
      info: ["invalid-refund-wording"],
    },
  );
  noBlock(report);
});

test("6: the creator as judge blocks; subjective success is vague", () => {
  const report = expectFindings(
    {
      ...base,
      yesRule:
        "Resolves YES if, in the creator's opinion, the product launch was successful.",
    },
    { block: ["subjective-judge"], warn: ["vague-term"] },
  );
  const vague = report.findings.find((finding) => finding.id === "vague-term");
  assert.equal(vague?.field, "yesRule");
  assert.equal(vague?.match, "successful");
  for (const yesRule of [
    "Resolves YES at the discretion of the market creator.",
    "Resolves YES as determined by the creator after the event.",
    "We will decide the outcome once the event has happened.",
  ])
    expectFindings({ ...base, yesRule }, { block: ["subjective-judge"] });
});

test("7: identical YES and NO rules block", () => {
  const report = expectFindings(
    {
      ...base,
      yesRule: "Any other outcome applies here.",
      noRule: "any other outcome   applies here!",
    },
    { block: ["rules-identical"] },
  );
  assert.equal(
    blockingReason(report),
    "Fix 1 blocking rule problem before launch: rules-identical.",
  );
});

test("8: alternative sources warn", () => {
  for (const yesRule of [
    "Reuters or Bloomberg reports that the merger closed by 2027-03-31 23:59 UTC.",
    "Any major outlet reports that the merger closed by 2027-03-31 23:59 UTC.",
    "BLS and/or BEA data show the merger closed by 2027-03-31 23:59 UTC.",
  ])
    expectFindings({ ...base, yesRule }, { warn: ["multiple-sources"] });
});

test("9: markets about Wildcatter itself warn", () => {
  expectFindings(
    { ...base, question: "Will this market reach 70% probability by 2027?" },
    { warn: ["self-reference"] },
  );
});

test("10: closing windows", () => {
  const soon = expectFindings(
    { ...base, closesAt: new Date(NOW + 30 * 60_000).toISOString() },
    { block: ["closes-too-soon"] },
  );
  assert.equal(soon.risk >= 40, true);
  expectFindings(
    { ...base, closesAt: "2030-01-01T00:00:00Z" },
    { warn: ["closes-too-far"] },
  );
  expectFindings(
    { ...base, closesAt: "2026-12-01T00:00:00Z" },
    { info: ["close-before-event"] },
  );
});

test("11: the BLS control has no block and no warning", () => {
  const control: DraftInput = {
    question:
      "Will the U.S. BLS report a 12-month CPI-U change of at least 3.0% for September 2026?",
    sourceName: "U.S. Bureau of Labor Statistics",
    sourceUrl: "https://www.bls.gov/cpi/",
    closesAt: "2026-10-01T00:00:00Z",
    yesRule:
      "Resolves YES if the first BLS release of September 2026 CPI-U all-items, not seasonally adjusted, reports a 12-month change of at least 3.0%.",
    noRule: "Resolves NO if that first release reports any value below 3.0%.",
    invalidRule:
      "Resolves INVALID if BLS has not published September 2026 CPI-U by 2026-11-30 23:59 UTC or discontinues the series.",
  };
  const report = lintDraft(control, Date.parse("2026-09-15T00:00:00Z"));
  assert.deepEqual(ids(report, "block"), []);
  assert.deepEqual(ids(report, "warn"), [], JSON.stringify(report.findings));
  assert.ok(ids(report, "info").includes("publication-lag"));
  assert.equal(blockingReason(report), undefined);
});

test("12: every seed market passes with no block", () => {
  assert.equal(seedMarkets.length, 12);
  for (const market of seedMarkets)
    noBlock(
      lintDraft(
        {
          question: market.title,
          sourceName: market.sourceName,
          sourceUrl: market.sourceUrl,
          closesAt: market.closesAt,
          yesRule: market.yesRule,
          noRule: market.noRule,
          invalidRule: market.invalidRule,
        },
        NOW,
      ),
    );
});

test("13: the drafts existing tests launch have no block", () => {
  const rules = {
    sourceName: "Official source",
    sourceUrl: "https://example.org/data",
    closesAt: "2028-01-01T00:00:00.000Z",
    yesRule:
      "The official source publishes a qualifying measurement before the deadline.",
    noRule:
      "No qualifying measurement exists in the complete published record by the deadline.",
    invalidRule:
      "If the source is missing or incomplete, hold for human review.",
  };
  for (const question of [
    "Will a measurable event occur before 2028?",
    "Will the lifecycle journey resolve before 2028?",
  ]) {
    const report = lintDraft({ ...rules, question }, NOW);
    noBlock(report);
    // example.org stays a warning so these fixtures keep launching.
    assert.ok(ids(report, "warn").includes("url-placeholder"));
  }
});

test("more realistic slips: vague, dateless, non-binary and unrevised wording", () => {
  expectFindings(
    {
      ...base,
      question: "Will inflation rise significantly in March?",
      yesRule:
        "Resolves YES if BLS reports a 12-month CPI-U change of at least 3.0% for March.",
    },
    { warn: ["date-without-year"], info: ["vague-term"] },
  );
  for (const question of [
    "Which party wins the 2027 vote in Goa?",
    "Will the Fed cut or hold rates in December 2026?",
  ])
    expectFindings({ ...base, question }, { warn: ["question-not-binary"] });
  expectFindings(
    {
      ...base,
      yesRule:
        "Resolves YES if the BLS preliminary estimate for December 2026 shows at least 3.0%.",
      noRule: "Resolves NO if the BLS estimate shows any value below 3.0%.",
    },
    { warn: ["revision-unspecified"] },
  );
  expectFindings(
    {
      ...base,
      invalidRule:
        "Resolves INVALID if BLS has not published the figure by 5 pm on 2027-02-26.",
    },
    { warn: ["timezone-missing"] },
  );
  const report = lintDraft(
    {
      ...base,
      question: "Will the U.S. BLS report CPI-U of at least 3.0% in 2026?",
      yesRule:
        "Resolves YES if the first BLS release reports a 12-month CPI-U change of at least 3.0% during 2026.",
      invalidRule:
        "Resolves INVALID if BLS has not published the figure within 60 days or discontinues it.",
    },
    NOW,
  );
  assert.ok(ids(report, "info").includes("timezone-missing"));
  assert.ok(!ids(report, "warn").includes("no-publication-deadline"));
});

test("findings point at a field and are ordered block, warn, info", () => {
  const report = lintDraft(
    {
      ...base,
      sourceUrl: "https://bit.ly/3AbCdEf",
      yesRule: "Bitcoin price goes above 100k soon.",
      noRule: "Bitcoin price goes above 100k soon.",
      invalidRule: "If unclear, refund everyone.",
    },
    NOW,
  );
  const order = { block: 0, warn: 1, info: 2 };
  const severities = report.findings.map((finding) => order[finding.severity]);
  assert.deepEqual(
    severities,
    [...severities].sort((a, b) => a - b),
  );
  assert.equal(report.risk, 100);
  assert.match(
    blockingReason(report) ?? "",
    /^Fix 2 blocking rule problems before launch: (rules-identical, url-shortener|url-shortener, rules-identical)\.$/,
  );
  for (const finding of report.findings) {
    assert.ok(finding.field in base, finding.id);
    assert.ok(finding.message.length > 10, finding.id);
  }
});

test("partly filled forms lint without throwing and skip empty fields", () => {
  const empty: DraftInput = {
    question: "",
    sourceName: "",
    sourceUrl: "",
    closesAt: "",
    yesRule: "",
    noRule: "",
    invalidRule: "",
  };
  assert.deepEqual(lintDraft(empty, NOW).findings, []);
  const report = lintDraft(
    { ...empty, question: "Will the index close above the record?" },
    NOW,
  );
  assert.deepEqual(ids(report, "block"), ["comparator-without-number"]);
  const fixed = lintDraft(
    { ...empty, question: "Will the index close above 25,000 in 2027?" },
    NOW,
  );
  assert.deepEqual(ids(fixed, "block"), []);
  assert.ok(ids(fixed, "warn").includes("threshold-boundary"));
});

test("the linter never touches the network", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("The linter must not fetch.");
  };
  try {
    lintDraft({ ...base, sourceUrl: "https://bit.ly/3AbCdEf" }, NOW);
    lintDraft(base);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("14: 500 random schema-valid drafts never throw and lint deterministically", () => {
  let seed = 20261122;
  const random = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)];
  const words = [
    "Will",
    "Which",
    "above",
    "below",
    "over",
    "at least",
    "more than",
    "strictly",
    "or",
    "and/or",
    "not",
    "never",
    "otherwise",
    "May",
    "may",
    "March",
    "October 2026",
    "12 April 2027",
    "2027-04-12",
    "Q3 2026",
    "5 pm",
    "23:59",
    "UTC",
    "IST",
    "midnight",
    "end of the month",
    "in 2027",
    "before 2028",
    "by 2026-11-30",
    "within 30 days",
    "100k",
    "$150,000",
    "4%",
    "3.0%",
    "refund",
    "INVALID",
    "Resolves NO",
    "NO:",
    "postponed",
    "match",
    "election",
    "launch",
    "estimate",
    "first release",
    "this market",
    "Reuters",
    "Bloomberg",
    "reports",
    "news reports",
    "in the creator's opinion",
    "significantly",
    "about",
    "BLS",
    "MoSPI",
    "GDP",
    "CPI",
    "does not publish",
    "discontinued",
    "?",
    ".",
    ",",
    "’",
    "—",
    "Ünïcødé",
    "(",
    ")",
    "[",
    "]",
    "\\",
    "*",
    "+",
  ] as const;
  const hosts = [
    "www.bls.gov",
    "bit.ly",
    "192.168.1.20",
    "x.com",
    "www.google.com",
    "data.example.org",
    "mospi.gov.in",
    "bea.gov",
    "stats.local",
    "[::1]",
    "xn--bcher-kva.example",
    "a.b.c.d.e.f.org",
    "rbi.org.in",
  ] as const;
  const sentence = (min: number) => {
    let text = "";
    while (text.length < min || random() < 0.5)
      text += (text ? " " : "") + pick(words);
    return text;
  };
  for (let index = 0; index < 500; index++) {
    const draft: DraftInput = {
      question: sentence(12).slice(0, 240),
      sourceName: sentence(2).slice(0, 120),
      sourceUrl:
        `https://${pick(hosts)}/${pick(["", "search", "x"])}` +
        pick(["", "?q=cpi", "?token=a&key=b", "?Signature=z#top"]),
      closesAt: new Date(NOW + (random() * 6 - 1) * 365 * DAY).toISOString(),
      yesRule: sentence(15).slice(0, 2000),
      noRule: sentence(15).slice(0, 2000),
      invalidRule: sentence(15).slice(0, 2000),
    };
    const report = lintDraft(draft, NOW);
    assert.deepEqual(lintDraft(draft, NOW), report);
    assert.ok(report.risk >= 0 && report.risk <= 100);
    assert.equal(
      report.label,
      report.findings.some((finding) => finding.severity === "block")
        ? "Blocked"
        : report.risk >= 15
          ? "Review"
          : "Clear",
    );
  }
});

test("launch refuses blocking drafts without side effects and publishes the rule check", async () => {
  const app = await buildApp({ databasePath: ":memory:", rateLimiting: false });
  try {
    const token = (
      await app.inject({ method: "POST", url: "/api/v1/sessions" })
    ).json().token;
    const headers = { authorization: `Bearer ${token}` };
    const closesAt = new Date(Date.now() + 30 * DAY).toISOString();
    const save = async (draft: DraftInput) => {
      const saved = await app.inject({
        method: "POST",
        url: "/api/v1/drafts",
        headers,
        payload: { ...draft, closesAt },
      });
      assert.equal(saved.statusCode, 201, saved.body);
      return saved.json().id as string;
    };
    const launch = (id: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/drafts/${id}/launch`,
        headers,
        payload: { category: "Economy" },
      });

    const judged = await save({
      ...base,
      yesRule:
        "Resolves YES if, in the creator's opinion, the product launch was successful.",
    });
    const refused = await launch(judged);
    assert.equal(refused.statusCode, 409, refused.body);
    assert.match(refused.json().message, /subjective-judge/);
    const portfolio = (
      await app.inject({ url: "/api/v1/portfolio", headers })
    ).json();
    assert.equal(portfolio.balanceMicros, 10_000_000_000);
    assert.equal(portfolio.created.length, 0);
    assert.deepEqual(
      (await app.inject({ url: "/api/v1/drafts", headers }))
        .json()
        .items.map((draft: { id: string }) => draft.id),
      [judged],
    );

    const bitcoin = await save({
      question: "Will Bitcoin go above $100k?",
      sourceName: "CoinMarketCap",
      sourceUrl: "https://coinmarketcap.com/currencies/bitcoin/",
      closesAt,
      yesRule: "Bitcoin price goes above 100k.",
      noRule: "Bitcoin stays under 100k.",
      invalidRule: "If unclear, refund everyone.",
    });
    const launched = await launch(bitcoin);
    assert.equal(launched.statusCode, 201, launched.body);
    const market = (
      await app.inject(`/api/v1/markets/${launched.json().id}`)
    ).json();
    assert.ok(market.ruleCheck.risk > 0);
    for (const id of [
      "threshold-boundary",
      "rule-gap",
      "event-date-missing",
      "outage-unhandled",
    ])
      assert.ok(market.ruleCheck.warnings.includes(id), id);
    assert.equal(
      new Set(market.ruleCheck.warnings).size,
      market.ruleCheck.warnings.length,
    );
    // Seed markets never passed through launch, so they carry no rule check.
    assert.equal(
      (await app.inject("/api/v1/markets/fed-rate")).json().ruleCheck,
      undefined,
    );
  } finally {
    await app.close();
  }
});

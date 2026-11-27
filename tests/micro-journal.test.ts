import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrationBuckets } from "../server/calibration.js";
import type {
  Market,
  MarketStatus,
  ResolutionOutcome,
} from "../shared/types.js";
import {
  EMPTY_JOURNAL,
  MESSAGES,
  addCustomQuestion,
  addMarketForecast,
  deleteQuestion,
  dueQuestions,
  isDay,
  latestForecast,
  oneInLabel,
  parseJournal,
  questionOutcome,
  questionStatus,
  reopenCustom,
  resolveCustom,
  shiftYears,
  summarize,
  updateForecast,
  type JournalResult,
  type JournalState,
} from "../shared/micro/journal.js";

const NOW = "2026-11-27T12:00:00.000Z";
const TODAY = "2026-11-27";

const market = (
  id: string,
  probability = 0.5,
  status: MarketStatus = "open",
  outcome?: ResolutionOutcome,
): Market => ({
  id,
  title: `Will ${id} happen by 2027?`,
  description: "",
  category: "World",
  symbol: id.toUpperCase(),
  color: "#000000",
  sourceName: "Source",
  sourceUrl: "https://example.com",
  closesAt: "2027-01-01T00:00:00.000Z",
  yesRule: "",
  noRule: "",
  invalidRule: "",
  initialProbability: 0.5,
  probability,
  change24h: 0,
  volumeMicros: 0,
  trades: 0,
  status,
  feeBps: 0,
  ...(outcome
    ? {
        resolution: {
          outcome,
          evidenceUrl: "",
          proposedAt: NOW,
          challengeEndsAt: NOW,
          disputed: false,
        },
      }
    : {}),
});

const ok = (result: JournalResult): JournalState => {
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.state;
};
const err = (result: JournalResult): string => {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.error;
};
const custom = (
  state: JournalState,
  uuid: string,
  pct: number,
  overrides: Partial<{ title: string; checkBy: string; note: string }> = {},
) =>
  addCustomQuestion(
    state,
    {
      uuid,
      title: `Question number ${uuid} resolves YES`,
      checkBy: "2026-12-31",
      pct,
      note: "",
      ...overrides,
    },
    NOW,
  );
const close = (actual: number | null, expected: number, tolerance = 1e-9) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );

test("two custom questions score Brier 0.065 and log score ≈ −0.28991", () => {
  let state = ok(custom(EMPTY_JOURNAL, "a", 80));
  state = ok(resolveCustom(state, "c:a", "YES", NOW));
  state = ok(custom(state, "b", 30));
  state = ok(resolveCustom(state, "c:b", "NO", NOW));
  const summary = summarize(state, []);
  assert.equal(summary.scored, 2);
  close(summary.brier, 0.065);
  close(summary.logScore, -0.28991, 1e-5);
  assert.equal(summary.skill, null);
  assert.equal(summary.linkedScored, 0);
});

test("a linked market scores against the crowd when it resolves YES", () => {
  const state = ok(addMarketForecast(EMPTY_JOURNAL, market("m1"), 70, "", NOW));
  assert.equal(state.questions[0].forecasts[0].crowd, 0.5);
  const summary = summarize(state, [market("m1", 1, "resolved", "YES")]);
  close(summary.brier, 0.09);
  close(summary.skill, 0.16);
  assert.equal(summary.linkedScored, 1);
});

test("a market resolved INVALID is voided and left out of the scores", () => {
  const state = ok(addMarketForecast(EMPTY_JOURNAL, market("m1"), 70, "", NOW));
  const summary = summarize(state, [market("m1", 0.5, "resolved", "INVALID")]);
  assert.equal(summary.voided, 1);
  assert.equal(summary.scored, 0);
  assert.equal(summary.brier, null);
  assert.equal(summary.logScore, null);
  assert.equal(summary.skill, null);
});

test("only the final forecast is scored", () => {
  let state = ok(custom(EMPTY_JOURNAL, "a", 40));
  state = ok(updateForecast(state, "c:a", 90, " changed my mind ", NOW));
  assert.equal(state.questions[0].forecasts.length, 2);
  assert.equal(latestForecast(state.questions[0])?.note, "changed my mind");
  state = ok(resolveCustom(state, "c:a", "YES", NOW));
  close(summarize(state, []).brier, 0.01);
});

test("every validation message", () => {
  const m = market("m1");
  assert.equal(
    err(addMarketForecast(EMPTY_JOURNAL, m, 0, "", NOW)),
    MESSAGES.pct,
  );
  assert.equal(
    err(addMarketForecast(EMPTY_JOURNAL, m, 100, "", NOW)),
    MESSAGES.pct,
  );
  assert.equal(
    err(addMarketForecast(EMPTY_JOURNAL, m, 50.5, "", NOW)),
    MESSAGES.pct,
  );
  assert.equal(
    err(addMarketForecast(EMPTY_JOURNAL, m, 50, "x".repeat(281), NOW)),
    MESSAGES.note,
  );
  ok(addMarketForecast(EMPTY_JOURNAL, m, 50, ` ${"x".repeat(280)} `, NOW));
  assert.equal(
    err(custom(EMPTY_JOURNAL, "a", 50, { title: " short  " })),
    MESSAGES.title,
  );
  assert.equal(
    err(custom(EMPTY_JOURNAL, "a", 50, { title: "x".repeat(201) })),
    MESSAGES.title,
  );
  const one = ok(
    custom(EMPTY_JOURNAL, "a", 50, { title: "Will it  rain in Paris?" }),
  );
  assert.equal(
    err(custom(one, "b", 50, { title: " will IT rain in   paris? " })),
    MESSAGES.duplicate,
  );
  for (const checkBy of ["2026-11-26", "2031-11-29", "2026-02-30", "soon", ""])
    assert.equal(
      err(custom(EMPTY_JOURNAL, "a", 50, { checkBy })),
      MESSAGES.checkBy,
      checkBy,
    );
  ok(custom(EMPTY_JOURNAL, "a", 50, { checkBy: TODAY }));
  ok(custom(EMPTY_JOURNAL, "a", 50, { checkBy: "2031-11-27" }));
  assert.equal(
    err(
      addCustomQuestion(
        EMPTY_JOURNAL,
        {
          uuid: "a",
          title: "A valid question here",
          checkBy: TODAY,
          pct: 50,
          note: "",
        },
        "not a time",
      ),
    ),
    MESSAGES.checkBy,
  );
  assert.equal(err(custom(EMPTY_JOURNAL, "a", 0)), MESSAGES.pct);
  assert.equal(
    err(custom(EMPTY_JOURNAL, "a", 50, { note: "y".repeat(300) })),
    MESSAGES.note,
  );
  assert.equal(
    err(
      addMarketForecast(
        EMPTY_JOURNAL,
        market("m1", 0.5, "closed"),
        50,
        "",
        NOW,
      ),
    ),
    MESSAGES.closed,
  );
  const resolved = ok(resolveCustom(one, "c:a", "NO", NOW));
  assert.equal(
    err(updateForecast(resolved, "c:a", 60, "", NOW)),
    MESSAGES.resolved,
  );
  assert.equal(
    err(updateForecast(one, "c:nope", 60, "", NOW)),
    MESSAGES.missing,
  );
  assert.equal(err(updateForecast(one, "c:a", 101, "", NOW)), MESSAGES.pct);
  assert.equal(err(resolveCustom(one, "c:nope", "YES", NOW)), MESSAGES.missing);
  assert.equal(err(reopenCustom(one, "c:nope")), MESSAGES.missing);
  assert.equal(
    err(resolveCustom(one, "c:a", "MAYBE" as "YES", NOW)),
    MESSAGES.outcome,
  );
});

test("linked questions update only while their market is open", () => {
  const state = ok(
    addMarketForecast(EMPTY_JOURNAL, market("m1", 0.5), 50, "", NOW),
  );
  const updated = ok(
    updateForecast(state, "m:m1", 60, "", NOW, market("m1", 0.61234)),
  );
  assert.equal(updated.questions[0].forecasts[1].crowd, 0.6123);
  assert.equal(
    err(updateForecast(state, "m:m1", 60, "", NOW)),
    MESSAGES.closed,
  );
  assert.equal(
    err(updateForecast(state, "m:m1", 60, "", NOW, market("m2"))),
    MESSAGES.closed,
  );
  assert.equal(
    err(
      updateForecast(state, "m:m1", 60, "", NOW, market("m1", 0.5, "proposed")),
    ),
    MESSAGES.closed,
  );
  assert.equal(
    err(resolveCustom(state, "m:m1", "YES", NOW)),
    MESSAGES.notCustom,
  );
  assert.equal(err(reopenCustom(state, "m:m1")), MESSAGES.notCustom);
});

test("a market forecast appends to its question instead of duplicating it", () => {
  let state = ok(addMarketForecast(EMPTY_JOURNAL, market("m1"), 50, "", NOW));
  state = ok(addMarketForecast(state, market("m1", 0.7), 65, "again", NOW));
  assert.equal(state.questions.length, 1);
  assert.deepEqual(
    state.questions[0].forecasts.map((f) => [f.pct, f.crowd]),
    [
      [50, 0.5],
      [65, 0.7],
    ],
  );
});

test("caps: 20 forecasts per question and 200 questions", () => {
  let state = ok(custom(EMPTY_JOURNAL, "a", 50));
  for (let i = 1; i < 20; i += 1)
    state = ok(updateForecast(state, "c:a", 50, "", NOW));
  assert.equal(state.questions[0].forecasts.length, 20);
  assert.equal(
    err(updateForecast(state, "c:a", 50, "", NOW)),
    MESSAGES.forecastCap,
  );
  let linked = ok(addMarketForecast(EMPTY_JOURNAL, market("m1"), 50, "", NOW));
  for (let i = 1; i < 20; i += 1)
    linked = ok(addMarketForecast(linked, market("m1"), 50, "", NOW));
  assert.equal(
    err(addMarketForecast(linked, market("m1"), 50, "", NOW)),
    MESSAGES.forecastCap,
  );

  let full: JournalState = EMPTY_JOURNAL;
  for (let i = 0; i < 200; i += 1) full = ok(custom(full, `q${i}`, 50));
  assert.equal(full.questions.length, 200);
  assert.equal(full.questions[0].id, "c:q199", "newest first");
  assert.equal(err(custom(full, "extra", 50)), MESSAGES.questionCap);
  assert.equal(
    err(addMarketForecast(full, market("m1"), 50, "", NOW)),
    MESSAGES.questionCap,
  );
});

test("a proposed market refuses new forecasts", () => {
  assert.equal(
    err(
      addMarketForecast(
        EMPTY_JOURNAL,
        market("m1", 0.5, "proposed"),
        50,
        "",
        NOW,
      ),
    ),
    MESSAGES.closed,
  );
});

test("dueQuestions: check-by today or earlier, unresolved custom questions only", () => {
  let state = ok(custom(EMPTY_JOURNAL, "today", 50, { checkBy: TODAY }));
  state = ok(custom(state, "tomorrow", 50, { checkBy: "2026-11-28" }));
  state = ok(custom(state, "done", 50, { checkBy: TODAY }));
  state = ok(resolveCustom(state, "c:done", "YES", NOW));
  state = ok(addMarketForecast(state, market("m1"), 50, "", NOW));
  assert.deepEqual(
    dueQuestions(state, TODAY).map((q) => q.id),
    ["c:today"],
  );
  assert.deepEqual(
    dueQuestions(state, "2026-12-01").map((q) => q.id),
    ["c:tomorrow", "c:today"],
  );
  const byId = (id: string) => state.questions.find((q) => q.id === id)!;
  assert.equal(questionStatus(byId("c:today"), [], TODAY), "due");
  assert.equal(questionStatus(byId("c:tomorrow"), [], TODAY), "open");
  assert.equal(questionStatus(byId("c:done"), [], TODAY), "YES");
  assert.equal(questionStatus(byId("m:m1"), [], TODAY), "open");
});

test("reopen clears the resolution and allows updates again", () => {
  let state = ok(custom(EMPTY_JOURNAL, "a", 50));
  state = ok(resolveCustom(state, "c:a", "VOID", NOW));
  assert.equal(summarize(state, []).voided, 1);
  state = ok(reopenCustom(state, "c:a"));
  assert.equal("resolution" in state.questions[0], false);
  assert.equal("resolvedAt" in state.questions[0], false);
  ok(updateForecast(state, "c:a", 60, "", NOW));
  assert.equal(summarize(state, []).pending, 1);
});

test("questionOutcome reads linked markets and ignores open or missing ones", () => {
  const state = ok(addMarketForecast(EMPTY_JOURNAL, market("m1"), 50, "", NOW));
  const q = state.questions[0];
  assert.equal(questionOutcome(q, []), null);
  assert.equal(questionOutcome(q, [market("m1")]), null);
  assert.equal(questionOutcome(q, [market("m1", 0, "resolved", "NO")]), "NO");
  assert.equal(questionOutcome(q, [market("m1", 0, "resolved")]), null);
});

test("parseJournal drops what is invalid and round-trips valid data", () => {
  assert.deepEqual(parseJournal(undefined), EMPTY_JOURNAL);
  assert.deepEqual(parseJournal("x"), EMPTY_JOURNAL);
  assert.deepEqual(parseJournal({ version: 2 }), EMPTY_JOURNAL);
  assert.deepEqual(parseJournal({ version: 1, questions: {} }), EMPTY_JOURNAL);

  let valid = ok(custom(EMPTY_JOURNAL, "a", 80, { note: "base rate" }));
  valid = ok(resolveCustom(valid, "c:a", "YES", NOW));
  valid = ok(addMarketForecast(valid, market("m1", 0.42), 30, "", NOW));
  assert.deepEqual(parseJournal(JSON.parse(JSON.stringify(valid))), valid);

  const forecast = { at: NOW, pct: 50, note: "" };
  const base = {
    id: "c:x",
    kind: "custom",
    title: "A valid question title",
    checkBy: TODAY,
    createdAt: NOW,
    forecasts: [forecast],
  };
  const parsed = parseJournal({
    version: 1,
    questions: [
      { ...base, forecasts: [{ ...forecast, pct: 150 }] },
      {
        ...base,
        id: "c:mixed",
        forecasts: [
          { ...forecast, pct: 150 },
          forecast,
          { ...forecast, crowd: 2 },
          { ...forecast, note: "z".repeat(281) },
          null,
        ],
      },
      { ...base, id: "c:mixed" },
      { ...base, id: "c:crowd", forecasts: [{ ...forecast, crowd: 0.3 }] },
      { ...base, id: "x:bad" },
      { ...base, id: "c:date", checkBy: "2026-13-01" },
      { ...base, id: "c:res", resolution: "MAYBE", resolvedAt: NOW },
      { ...base, id: "c:res2", resolution: "YES" },
      { ...base, id: "c:title", title: "  " },
      { ...base, id: "c:nof", forecasts: "nope" },
      { ...base, id: 7 },
      { ...base, id: "m:m1", kind: "market", marketId: "m2" },
      { ...base, id: "m:", kind: "market", marketId: "" },
      { ...base, id: "q:1", kind: "other" },
      "junk",
    ],
  });
  assert.deepEqual(
    parsed.questions.map((q) => [q.id, q.forecasts.length]),
    [
      ["c:mixed", 1],
      ["c:crowd", 1],
    ],
  );
});

test("mutators never change their input", () => {
  let state = ok(custom(EMPTY_JOURNAL, "a", 50));
  state = ok(addMarketForecast(state, market("m1"), 50, "", NOW));
  const before = structuredClone(state);
  custom(state, "b", 60);
  addMarketForecast(state, market("m1"), 70, "", NOW);
  addMarketForecast(state, market("m2"), 70, "", NOW);
  updateForecast(state, "c:a", 55, "", NOW);
  resolveCustom(state, "c:a", "YES", NOW);
  reopenCustom(ok(resolveCustom(state, "c:a", "YES", NOW)), "c:a");
  deleteQuestion(state, "c:a");
  summarize(state, [market("m1", 1, "resolved", "YES")]);
  assert.deepEqual(state, before);
  assert.deepEqual(
    deleteQuestion(state, "c:a").questions.map((q) => q.id),
    ["m:m1"],
  );
});

test("summary buckets match calibrationBuckets on the same forecasts", () => {
  let state: JournalState = EMPTY_JOURNAL;
  const outcomes = ["YES", "NO", "YES", "YES", "NO", "NO"] as const;
  [5, 15, 55, 95, 99, 45].forEach((pct, i) => {
    state = ok(custom(state, `b${i}`, pct));
    state = ok(resolveCustom(state, `c:b${i}`, outcomes[i], NOW));
  });
  const summary = summarize(state, []);
  const expected = state.questions.map((q) => ({
    forecast: latestForecast(q)!.pct / 100,
    baseline: latestForecast(q)!.pct / 100,
    outcome: q.resolution === "YES" ? (1 as const) : (0 as const),
  }));
  assert.equal(summary.buckets.length, 10);
  assert.deepEqual(summary.buckets, calibrationBuckets(expected));
});

test("summarize skips malformed questions and linked forecasts without a crowd", () => {
  const state: JournalState = {
    version: 1,
    questions: [
      {
        id: "c:empty",
        kind: "custom",
        title: "Empty one",
        checkBy: TODAY,
        createdAt: NOW,
        forecasts: [],
      },
      {
        id: "m:m1",
        kind: "market",
        marketId: "m1",
        title: "Old",
        createdAt: NOW,
        forecasts: [{ at: NOW, pct: 60, note: "" }],
      },
    ],
  };
  const summary = summarize(state, [market("m1", 1, "resolved", "YES")]);
  assert.equal(summary.scored, 1);
  assert.equal(summary.linkedScored, 0);
  assert.equal(summary.skill, null);
  assert.equal(latestForecast(state.questions[0]), null);
});

test("helpers: one-in labels, calendar days and year shifts", () => {
  assert.equal(oneInLabel(75), "about 1 in 1.3");
  assert.equal(oneInLabel(50), "about 1 in 2");
  assert.equal(oneInLabel(3), "about 1 in 33");
  assert.equal(oneInLabel(0), "");
  assert.equal(isDay("2028-02-29"), true);
  assert.equal(isDay("2027-02-29"), false);
  assert.equal(isDay(20270101), false);
  assert.equal(shiftYears("2028-02-29", 1), "2029-03-01");
  assert.equal(shiftYears("2026-11-27", 5), "2031-11-27");
});

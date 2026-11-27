import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approxFraction,
  checkTitle,
  crowdSentence,
  defaultTitle,
  deleteWorksheet,
  errorFor,
  formatProbability,
  formatRatio,
  fromBits,
  likelihoodRatio,
  logit2,
  messages,
  movedSentence,
  oddsErrors,
  oddsFormats,
  parseBayes,
  parseNumber,
  parseOdds,
  priorPercent,
  saveWorksheet,
  signed,
  toOddsForms,
  update,
  type BayesState,
  type Evidence,
  type OddsFormat,
  type UpdateOk,
  type Worksheet,
} from "../shared/micro/bayes.js";

const ratio = (id: string, value: number): Evidence => ({
  id,
  label: "",
  mode: "ratio",
  ratio: value,
});
const chances = (id: string, ifYes?: number, ifNo?: number): Evidence => ({
  id,
  label: "",
  mode: "chances",
  ifYes,
  ifNo,
});
const ok = (prior: number, evidence: Evidence[]): UpdateOk => {
  const result = update(prior, evidence);
  assert.ok(result.ok, "expected a valid update");
  return result;
};
const close = (actual: number, expected: number, tolerance = 1e-12) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
const sheet = (id: string, extra: Partial<Worksheet> = {}): Worksheet => ({
  id,
  title: `Sheet ${id}`,
  prior: 0.3,
  evidence: [ratio(`${id}-e`, 2)],
  updatedAt: "2026-11-27T12:00:00.000Z",
  ...extra,
});

test("prior 0.5 with ratio 3 gives 0.75", () => {
  close(ok(0.5, [ratio("a", 3)]).posterior, 0.75);
});

test("prior 0.2 with ratios 4 then 2 gives 2/3, one step at a time", () => {
  const result = ok(0.2, [ratio("a", 4), ratio("b", 2)]);
  close(result.posterior, 2 / 3);
  close(result.steps[0].probabilityAfter, 0.5);
  close(result.steps[1].probabilityAfter, 2 / 3);
  close(result.totalRatio, 8);
  assert.deepEqual(
    result.steps.map((step) => step.id),
    ["a", "b"],
  );
});

test("prior 1/3 with ratio 8 gives 0.8 and 2 bits (LessWrong log-odds example)", () => {
  const result = ok(1 / 3, [ratio("a", 8)]);
  close(result.posterior, 0.8);
  close(result.totalBits, 2);
  close(result.steps[0].bits, 3);
});

test("two chances 0.9 and 0.3 give ratio 3 and about 1.58496 bits", () => {
  const e = chances("a", 0.9, 0.3);
  close(likelihoodRatio(e) as number, 3);
  close(ok(0.5, [e]).steps[0].bits, 1.58496, 1e-5);
});

test("twelve ratios of 1000 stay finite and display as >99.9%", () => {
  const evidence = Array.from({ length: 12 }, (_, i) => ratio(`e${i}`, 1000));
  const result = ok(0.5, evidence);
  close(result.totalBits, 12 * Math.log2(1000), 1e-9);
  assert.equal(result.posterior, 1);
  assert.ok(Number.isFinite(result.totalRatio));
  assert.equal(formatProbability(result.posterior), ">99.9%");
  const down = ok(
    0.5,
    evidence.map((e) => ({ ...e, ratio: 0.001 })),
  );
  assert.ok(down.posterior >= 0 && !Number.isNaN(down.posterior));
  assert.equal(formatProbability(down.posterior), "<0.1%");
});

test("no evidence leaves the prior unchanged", () => {
  const result = ok(0.3, []);
  close(result.posterior, 0.3);
  assert.equal(result.totalRatio, 1);
  assert.equal(
    movedSentence(result),
    "Moved 0.0 bits (×1) from 30.0% to 30.0%",
  );
});

test("range edges are accepted despite float noise", () => {
  assert.ok(update(0.1 / 100, [ratio("a", 0.001)]).ok);
  assert.ok(update(99.9 / 100, [ratio("a", 1000)]).ok);
  assert.ok(update(0.5, [chances("a", 0.1 / 100, 99.9 / 100)]).ok);
});

test("toOddsForms gives every display form", () => {
  assert.deepEqual(toOddsForms(0.25), {
    probability: 0.25,
    percent: "25.0%",
    decimal: "4.00",
    american: "+300",
    fractional: "3/1",
    odds: "1:3",
    oneIn: "1 in 4.0",
    bits: "−1.58 bits",
  });
  const high = toOddsForms(0.8);
  assert.equal(high.decimal, "1.25");
  assert.equal(high.american, "−400");
  assert.equal(high.fractional, "1/4");
  assert.equal(high.odds, "4:1");
  assert.equal(high.bits, "+2.00 bits");
  const forty = toOddsForms(0.4);
  assert.deepEqual(
    [
      forty.percent,
      forty.decimal,
      forty.american,
      forty.fractional,
      forty.odds,
      forty.oneIn,
      forty.bits,
    ],
    ["40.0%", "2.50", "+150", "3/2", "2:3", "1 in 2.5", "−0.58 bits"],
  );
  assert.equal(toOddsForms(0.5).bits, "0.00 bits");
  assert.equal(toOddsForms(Number.NaN).percent, "50.0%");
  assert.ok(toOddsForms(1).probability < 1);
  assert.ok(toOddsForms(0).probability > 0);
});

test("parseOdds reads every format", () => {
  const cases: [OddsFormat, string, number][] = [
    ["american", "+150", 0.4],
    ["american", "−200", 2 / 3],
    ["american", "-200", 2 / 3],
    ["american", " 150 ", 0.4],
    ["decimal", "2.5", 0.4],
    ["fractional", "3/2", 0.4],
    ["fractional", "3-2", 0.4],
    ["odds", "2:3", 0.4],
    ["percent", "35%", 0.35],
    ["percent", "35.5", 0.355],
    ["oneIn", "4", 0.25],
    ["oneIn", "1 in 4", 0.25],
  ];
  for (const [format, text, expected] of cases) {
    const result = parseOdds(format, text);
    assert.ok(result.ok, `${format} "${text}" should parse`);
    close(result.probability, expected);
  }
});

test("parseOdds rejects malformed text with the exact message", () => {
  const cases: [OddsFormat, string, string][] = [
    ["american", "+50", "American odds look like +150 or −200."],
    ["decimal", "1", "Decimal odds must be greater than 1."],
    ["fractional", "0/3", "Fractional odds look like 3/2."],
    ["percent", "100", "Enter a percent between 0 and 100."],
    ["percent", "abc", "Enter a percent between 0 and 100."],
    ["percent", "", "Enter a percent between 0 and 100."],
    ["odds", "2:3:4", "Odds look like 2:3."],
    ["odds", "-2:3", "Odds look like 2:3."],
    ["oneIn", "1", "Enter N greater than 1."],
    ["decimal", "2.5%", "Decimal odds must be greater than 1."],
  ];
  for (const [format, text, error] of cases)
    assert.deepEqual(parseOdds(format, text), { ok: false, error });
  assert.deepEqual(parseOdds("nope" as OddsFormat, "2"), {
    ok: false,
    error: "Choose an odds format.",
  });
  assert.equal(parseOdds("decimal", null as unknown as string).ok, false);
  assert.equal(oddsFormats.length, Object.keys(oddsErrors).length);
});

test("decimal odds round-trip for 200 seeded probabilities", () => {
  let seed = 42;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  for (let i = 0; i < 200; i += 1) {
    const p = 0.01 + next() * 0.98;
    const back = parseOdds("decimal", toOddsForms(p).decimal);
    assert.ok(back.ok);
    close(back.probability, p, 0.005);
  }
});

test("every format round-trips through its own display form", () => {
  const forms = toOddsForms(0.4);
  for (const format of oddsFormats) {
    const shown = format === "oneIn" ? forms.oneIn : forms[format];
    const back = parseOdds(format, shown);
    assert.ok(back.ok, `${format} "${shown}"`);
    close(back.probability, 0.4, 1e-9);
  }
});

test("approxFraction finds the closest small fraction", () => {
  assert.deepEqual(approxFraction(1 / 3), [1, 3]);
  assert.deepEqual(approxFraction(0.6667), [2, 3]);
  assert.deepEqual(approxFraction(Math.PI, 100), [311, 99]);
  assert.deepEqual(approxFraction(Math.PI, 7), [22, 7]);
  assert.deepEqual(approxFraction(4), [4, 1]);
  assert.deepEqual(approxFraction(0), [0, 1]);
  assert.deepEqual(approxFraction(-1), [0, 1]);
  assert.deepEqual(approxFraction(Number.NaN), [0, 1]);
  // A max denominator below 1 is treated as 1.
  assert.deepEqual(approxFraction(0.7, 0), [1, 1]);
  // Irrational input runs the expansion to its depth limit and still answers.
  const [a, b] = approxFraction(Math.SQRT2, 1e12);
  close(a / b, Math.SQRT2, 1e-12);
});

test("worksheets: newest first, replace by id, cap at 20", () => {
  let state: BayesState = parseBayes(undefined);
  for (let i = 1; i <= 21; i += 1) state = saveWorksheet(state, sheet(`s${i}`));
  assert.equal(state.worksheets.length, 20);
  assert.equal(state.worksheets[0].id, "s21");
  assert.equal(
    state.worksheets.some((item) => item.id === "s1"),
    false,
  );
  const replaced = saveWorksheet(state, sheet("s5", { title: "Renamed" }));
  assert.equal(replaced.worksheets.length, 20);
  assert.equal(replaced.worksheets[0].title, "Renamed");
  assert.equal(
    replaced.worksheets.filter((item) => item.id === "s5").length,
    1,
  );
  const removed = deleteWorksheet(replaced, "s5");
  assert.equal(removed.worksheets.length, 19);
  assert.equal(state.worksheets.length, 20, "inputs are not mutated");
});

test("parseBayes survives garbage and drops invalid parts", () => {
  for (const raw of [
    undefined,
    null,
    7,
    "x",
    [],
    { version: 2 },
    { version: 1 },
  ])
    assert.deepEqual(parseBayes(raw), { version: 1, worksheets: [] });
  const parsed = parseBayes({
    version: 1,
    worksheets: [
      {
        ...sheet("good", { marketId: "fed-rate", title: "x".repeat(90) }),
        evidence: [
          ratio("r", 3),
          { id: "c", label: 5, mode: "chances", ifYes: 0.9, ifNo: "0.3" },
          { id: "bad", label: "", mode: "vibes", ratio: 2 },
          { label: "no id", mode: "ratio", ratio: 2 },
          "junk",
        ],
      },
      { ...sheet("no-evidence"), evidence: "nope", marketId: "" },
      { ...sheet("bad-prior"), prior: 1.5 },
      { ...sheet("no-date"), updatedAt: 3 },
      { id: "", title: "t" },
      null,
    ],
  });
  assert.deepEqual(
    parsed.worksheets.map((item) => item.id),
    ["good", "no-evidence"],
  );
  const [good, bare] = parsed.worksheets;
  assert.equal(good.title.length, 60);
  assert.equal(good.marketId, "fed-rate");
  assert.deepEqual(good.evidence, [
    ratio("r", 3),
    { id: "c", label: "", mode: "chances", ifYes: 0.9, ifNo: undefined },
  ]);
  assert.deepEqual(bare.evidence, []);
  assert.equal("marketId" in bare, false);
  const many = parseBayes({
    version: 1,
    worksheets: Array.from({ length: 25 }, (_, i) => sheet(`m${i}`)),
  });
  assert.equal(many.worksheets.length, 20);
});

test("every validation message", () => {
  assert.equal(messages.prior, "Prior must be from 0.1% to 99.9%.");
  const bad = update(0.0005, [
    ratio("r", 0),
    chances("c", 0.5, 1),
    chances("d"),
    { id: "m", label: "", mode: "vibes" as "ratio" },
  ]);
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.deepEqual(bad.errors, [
    { field: "prior", message: "Prior must be from 0.1% to 99.9%." },
    { field: "r.ratio", message: "Ratio must be from 0.001 to 1000." },
    { field: "c.ifNo", message: "Each chance must be from 0.1% to 99.9%." },
    { field: "d.ifYes", message: "Each chance must be from 0.1% to 99.9%." },
    { field: "d.ifNo", message: "Each chance must be from 0.1% to 99.9%." },
    { field: "m.ratio", message: "Ratio must be from 0.001 to 1000." },
  ]);
  assert.equal(errorFor(bad.errors, "c.ifNo"), messages.chances);
  assert.equal(errorFor(bad.errors, "c.ifYes"), undefined);
  const tooMany = update(
    0.5,
    Array.from({ length: 13 }, (_, i) => ratio(`e${i}`, 2)),
  );
  assert.deepEqual(tooMany, {
    ok: false,
    errors: [{ field: "evidence", message: "Up to 12 pieces of evidence." }],
  });
  assert.equal(update(Number.NaN, []).ok, false);
  assert.equal(update(0.5, [ratio("big", 1001)]).ok, false);
  assert.equal(likelihoodRatio(ratio("x", Number.POSITIVE_INFINITY)), null);
  assert.deepEqual(checkTitle(""), {
    ok: false,
    error: "Title must be 1 to 60 characters.",
  });
  assert.deepEqual(checkTitle("y".repeat(61)), {
    ok: false,
    error: messages.title,
  });
  assert.deepEqual(checkTitle("  My sheet "), { ok: true, title: "My sheet" });
});

test("display helpers", () => {
  assert.equal(signed(1.584, 2), "+1.58");
  assert.equal(signed(-0.584, 2), "−0.58");
  assert.equal(signed(-0.001, 2), "0.00");
  assert.equal(formatProbability(0.676), "67.6%");
  assert.equal(formatProbability(0.999), "99.9%");
  assert.equal(formatRatio(3), "×3");
  assert.equal(formatRatio(0.5), "×0.5");
  assert.equal(formatRatio(4.87), "×4.9");
  assert.equal(formatRatio(123.4), "×123");
  assert.equal(formatRatio(0.001), "×0.001");
  assert.equal(formatRatio(1e36), "×1.0e36");
  assert.equal(formatRatio(1e-36), "×1.0e-36");
  const moved = ok(0.3, [ratio("a", 4.87)]);
  assert.equal(
    movedSentence(moved),
    `Moved +2.3 bits (×4.9) from 30.0% to ${formatProbability(moved.posterior)}`,
  );
  assert.equal(
    movedSentence(ok(0.5, [ratio("a", 0.5)])),
    "Moved −1.0 bits (×0.5) from 50.0% to 33.3%",
  );
  assert.equal(
    crowdSentence(0.676, 0.3),
    "That is 38 points above the crowd's 30%.",
  );
  assert.equal(
    crowdSentence(0.29, 0.3),
    "That is 1 point below the crowd's 30%.",
  );
  assert.equal(crowdSentence(0.302, 0.3), "That matches the crowd's 30%.");
  close(logit2(0.8), 2);
  close(fromBits(-2), 0.2);
});

test("parseBayes drops duplicate worksheet and evidence ids, keeping the first", () => {
  const parsed = parseBayes({
    version: 1,
    worksheets: [
      {
        ...sheet("a"),
        evidence: [ratio("e", 2), ratio("e", 9), ratio("f", 3)],
      },
      sheet("a", { title: "Duplicate" }),
      sheet("b"),
    ],
  });
  assert.deepEqual(
    parsed.worksheets.map((item) => [item.id, item.title]),
    [
      ["a", "Sheet a"],
      ["b", "Sheet b"],
    ],
  );
  assert.deepEqual(parsed.worksheets[0].evidence, [
    ratio("e", 2),
    ratio("f", 3),
  ]);
});

test("priorPercent rounds to one decimal and clamps to the prior range", () => {
  assert.equal(priorPercent(0.3), 30);
  assert.equal(priorPercent(0.6667), 66.7);
  assert.equal(priorPercent(0.0001), 0.1);
  assert.equal(priorPercent(0.99999), 99.9);
});

test("parseNumber is strict", () => {
  assert.equal(parseNumber(" 30.5 "), 30.5);
  assert.equal(parseNumber("30%"), 30);
  assert.equal(parseNumber("−2"), -2);
  assert.equal(parseNumber(".5"), 0.5);
  for (const text of ["", "abc", "1e3", "1,5", "Infinity", "2.5.1"])
    assert.ok(Number.isNaN(parseNumber(text)), text);
});

test("default worksheet titles fit the limit", () => {
  assert.equal(defaultTitle(), "Worksheet");
  assert.equal(defaultTitle("   "), "Worksheet");
  assert.equal(defaultTitle("Will it rain?"), "Will it rain?");
  const long = defaultTitle("z".repeat(80));
  assert.equal(long.length, 60);
  assert.ok(long.endsWith("…"));
  assert.ok(checkTitle(long).ok);
});

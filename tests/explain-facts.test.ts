import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chanceSentence,
  explainFacts,
  timeLeftSentence,
} from "../shared/explain.js";
import type { Market } from "../shared/types.js";

const hour = 3_600_000;
const market: Market = {
  id: "example",
  title: "Will the example happen?",
  description: "An example market.",
  category: "World",
  symbol: "EX",
  color: "#000000",
  sourceName: "Example Agency",
  sourceUrl: "https://example.org/data",
  closesAt: "2027-01-01T00:00:00.000Z",
  yesRule: "YES if the agency reports it.",
  noRule: "Otherwise NO.",
  invalidRule: "INVALID if nothing is published by Feb 1, 2027.",
  initialProbability: 0.5,
  probability: 0.33,
  change24h: 0.04,
  volumeMicros: 1_234_400_000,
  trades: 12,
  status: "open",
  feeBps: 0,
};
const close = Date.parse(market.closesAt);

test("the facts block says what the market says in plain words", () => {
  assert.deepEqual(explainFacts(market, close - 60 * hour), [
    { label: "Chance", text: "The crowd puts this at about 1 in 3 (33%)." },
    { label: "24-hour move", text: "Up 4 points in 24 hours." },
    { label: "Activity", text: "12 demo trades worth 1,234 credits in total." },
    { label: "Time left", text: "Closes in 2 days." },
    {
      label: "How it resolves",
      text: "Resolves using Example Agency; trading closes Jan 1, 2027 (UTC).",
    },
  ]);
});

test("a new, flat market with launch warnings", () => {
  const facts = explainFacts(
    {
      ...market,
      probability: 0.5,
      change24h: 0,
      trades: 0,
      volumeMicros: 0,
      ruleCheck: { risk: 45, warnings: ["timezone-missing", "unknown-check"] },
    },
    close - 0.5 * hour,
  );
  assert.deepEqual(
    facts.map((fact) => fact.text),
    [
      "The crowd sees this as roughly a coin flip (50%).",
      "Flat over the last 24 hours.",
      "No trades yet, so the price is still the starting estimate.",
      "Closes in under an hour.",
      "Resolves using Example Agency; trading closes Jan 1, 2027 (UTC).",
      "Launched with 2 unresolved rule warnings (risk 45 of 100): No time zone; unknown-check.",
    ],
  );
  assert.equal(facts.at(-1)?.label, "Rule check");
});

test("a resolved market with a clear rule check", () => {
  const facts = explainFacts(
    {
      ...market,
      status: "resolved",
      change24h: -0.12,
      trades: 1,
      volumeMicros: 900_000,
      resolution: {
        outcome: "NO",
        evidenceUrl: "",
        proposedAt: market.closesAt,
        challengeEndsAt: market.closesAt,
        disputed: false,
      },
      ruleCheck: { risk: 0, warnings: [] },
    },
    close + hour,
  );
  assert.deepEqual(
    facts.map((fact) => fact.text),
    [
      "Resolved NO.",
      "Down 12 points in 24 hours.",
      "1 demo trade worth 1 credit in total.",
      "Trading has closed.",
      "Resolves using Example Agency; trading closed Jan 1, 2027 (UTC).",
      "Clear at launch (risk 0 of 100).",
    ],
  );
});

test("probabilities become simple odds", () => {
  for (const [probability, text] of [
    [0.004, "The crowd puts this at less than 1 in 100 (0%)."],
    [0.993, "The crowd puts this at more than 99 in 100 (99%)."],
    [0.04, "The crowd puts this at about 1 in 25 (4%)."],
    [0.96, "The crowd puts this at about 24 in 25 (96%)."],
    [0.2, "The crowd puts this at about 1 in 5 (20%)."],
    [0.62, "The crowd puts this at about 3 in 5 (62%)."],
    [0.67, "The crowd puts this at about 2 in 3 (67%)."],
    [0.75, "The crowd puts this at about 3 in 4 (75%)."],
    [0.9, "The crowd puts this at about 9 in 10 (90%)."],
    [0.47, "The crowd sees this as roughly a coin flip (47%)."],
  ] as const)
    assert.equal(chanceSentence(probability), text, String(probability));
});

test("time left is rounded to a readable unit", () => {
  for (const [ms, text] of [
    [3 * hour, "Closes in 3 hours."],
    [hour, "Closes in 1 hour."],
    [100 * 24 * hour, "Closes in about 3 months."],
    [1000 * 24 * hour, "Closes in about 3 years."],
    [0, "Trading has closed."],
  ] as const)
    assert.equal(timeLeftSentence(market.closesAt, close - ms), text);
});

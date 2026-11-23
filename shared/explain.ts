import { moveLabel, percent } from "./format.js";
import { CHECK_TITLES } from "./lint-data.js";
import type { Market } from "./types.js";

/** One line of the "What the market says" block. */
export interface ExplainFact {
  label: string;
  text: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const plural = (count: number, word: string) =>
  `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

/**
 * Simple odds for a probability: "about 1 in 3". Tails use "1 in N"; the
 * middle picks the nearest fraction with a denominator of 2, 3, 4, 5 or 10.
 */
function odds(probability: number): string {
  if (probability < 0.01) return "less than 1 in 100";
  if (probability > 0.99) return "more than 99 in 100";
  if (probability < 0.2) return `about 1 in ${Math.round(1 / probability)}`;
  if (probability > 0.8) {
    const total = Math.round(1 / (1 - probability));
    return `about ${total - 1} in ${total}`;
  }
  let best = { k: 1, n: 2 };
  for (const n of [2, 3, 4, 5, 10]) {
    const k = Math.min(n - 1, Math.max(1, Math.round(probability * n)));
    if (Math.abs(k / n - probability) < Math.abs(best.k / best.n - probability))
      best = { k, n };
  }
  return best.n === 2 ? "even" : `about ${best.k} in ${best.n}`;
}

/** "The crowd puts this at about 1 in 3 (33%)." */
export function chanceSentence(probability: number): string {
  const phrase = odds(probability);
  return phrase === "even"
    ? `The crowd sees this as roughly a coin flip (${percent(probability)}).`
    : `The crowd puts this at ${phrase} (${percent(probability)}).`;
}

/** Time until trading closes, in the largest unit that reads naturally. */
export function timeLeftSentence(closesAt: string, now: number): string {
  const left = Date.parse(closesAt) - now;
  if (left <= 0) return "Trading has closed.";
  if (left < HOUR) return "Closes in under an hour.";
  if (left < 2 * DAY)
    return `Closes in ${plural(Math.floor(left / HOUR), "hour")}.`;
  const days = left / DAY;
  if (days < 60) return `Closes in ${plural(Math.floor(days), "day")}.`;
  if (days < 730)
    return `Closes in about ${plural(Math.round(days / 30.44), "month")}.`;
  return `Closes in about ${plural(Math.round(days / 365.25), "year")}.`;
}

function activitySentence(market: Market): string {
  if (!market.trades)
    return "No trades yet, so the price is still the starting estimate.";
  const credits = Math.round(market.volumeMicros / 1_000_000);
  return `${plural(market.trades, "demo trade")} worth ${plural(credits, "credit")} in total.`;
}

function ruleCheckSentence(check: NonNullable<Market["ruleCheck"]>): string {
  const risk = `(risk ${check.risk} of 100)`;
  if (!check.warnings.length) return `Clear at launch ${risk}.`;
  const titles = check.warnings.map((id) => CHECK_TITLES[id] ?? id);
  return `Launched with ${plural(check.warnings.length, "unresolved rule warning")} ${risk}: ${titles.join("; ")}.`;
}

/**
 * Plain-language facts about a market from data the app already holds:
 * odds, 24-hour move, activity, time left, how it resolves and the launch
 * rule check. No AI and no network.
 */
export function explainFacts(market: Market, now = Date.now()): ExplainFact[] {
  const closed = Date.parse(market.closesAt) <= now;
  const deadline = new Date(market.closesAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const facts: ExplainFact[] = [
    {
      label: "Chance",
      text:
        market.status === "resolved" && market.resolution
          ? `Resolved ${market.resolution.outcome}.`
          : chanceSentence(market.probability),
    },
    {
      label: "24-hour move",
      text: `${moveLabel(market.change24h) ?? "Flat over the last 24 hours"}.`,
    },
    { label: "Activity", text: activitySentence(market) },
    { label: "Time left", text: timeLeftSentence(market.closesAt, now) },
    {
      label: "How it resolves",
      text: `Resolves using ${market.sourceName}; trading ${closed ? "closed" : "closes"} ${deadline} (UTC).`,
    },
  ];
  return market.ruleCheck
    ? [
        ...facts,
        { label: "Rule check", text: ruleCheckSentence(market.ruleCheck) },
      ]
    : facts;
}

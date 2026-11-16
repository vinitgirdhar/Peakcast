import { MICRO } from "./amm.js";
import { DAY_MS, DomainError, type Store } from "./database.js";
import type { AccountStats, BonusClaim, DailyBonus } from "../shared/types.js";

const BONUS_BASE_MICROS = 50 * MICRO;
const BONUS_STEP_MICROS = 10 * MICRO;
const BONUS_CAP_MICROS = 100 * MICRO;
// ponytail: a streak longer than this many days is reported as this many.
const STREAK_LOOKBACK_DAYS = 400;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function bonusStatus(store: Store, accountId: string): DailyBonus {
  const days = (
    store.db
      .prepare(
        "SELECT DISTINCT substr(created_at,1,10) AS day FROM ledger WHERE account_id=? AND kind='daily_bonus' ORDER BY day DESC LIMIT ?",
      )
      .all(accountId, STREAK_LOOKBACK_DAYS) as { day: string }[]
  ).map((row) => row.day);
  const now = Date.now();
  const available = days[0] !== utcDay(now);
  // The streak runs back from today once claimed, otherwise from yesterday;
  // either way it is exactly the count the next claim is paid for.
  const from = available ? now - DAY_MS : now;
  let streak = 0;
  while (days[streak] === utcDay(from - streak * DAY_MS)) streak += 1;
  return {
    available,
    streak,
    nextAmountMicros: Math.min(
      BONUS_BASE_MICROS + streak * BONUS_STEP_MICROS,
      BONUS_CAP_MICROS,
    ),
  };
}

export function claimBonus(store: Store, accountId: string): BonusClaim {
  return store.transaction(() => {
    const { available, nextAmountMicros } = bonusStatus(store, accountId);
    if (!available)
      throw new DomainError(
        "You already claimed today's bonus. The next one opens at midnight UTC.",
        409,
      );
    const balanceMicros = store.credit(
      accountId,
      nextAmountMicros,
      "daily_bonus",
      null,
    );
    return {
      amountMicros: nextAmountMicros,
      balanceMicros,
      bonus: bonusStatus(store, accountId),
    };
  });
}

export function accountStats(store: Store, accountId: string): AccountStats {
  const trades = store.db
    .prepare(
      "SELECT COUNT(*) AS tradeCount, COALESCE(SUM(json_extract(payload,'$.amountMicros')),0) AS volumeMicros FROM trades WHERE account_id=?",
    )
    .get(accountId) as { tradeCount: number; volumeMicros: number };
  const ledger = store.db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN kind='creator_fee' THEN amount_micros END),0) AS creatorFeesMicros, COALESCE(SUM(CASE WHEN kind='payout' THEN amount_micros END),0) AS payoutsMicros FROM ledger WHERE account_id=?",
    )
    .get(accountId) as { creatorFeesMicros: number; payoutsMicros: number };
  // A win is a resolved market the account traded in and was paid out on.
  const markets = store.db
    .prepare(
      `SELECT COUNT(*) AS resolvedMarkets,
        COALESCE(SUM(EXISTS (SELECT 1 FROM ledger l WHERE l.account_id=? AND l.kind='payout' AND l.market_id=m.id)),0) AS wins
       FROM markets m
       WHERE m.id IN (SELECT market_id FROM trades WHERE account_id=?)
         AND json_extract(m.resolution,'$.status')='resolved'`,
    )
    .get(accountId, accountId) as { resolvedMarkets: number; wins: number };
  return {
    ...trades,
    ...markets,
    winRate: markets.resolvedMarkets
      ? markets.wins / markets.resolvedMarkets
      : 0,
    ...ledger,
  };
}

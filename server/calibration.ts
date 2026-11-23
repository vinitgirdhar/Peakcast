import type { Store } from "./database.js";
import type {
  Calibration,
  CalibrationBucket,
  ForecasterRank,
  ResolutionOutcome,
} from "../shared/types.js";

// Accuracy scoring: rank forecasters by being right, not by being rich.
// The math below is pure; the two SQL readers at the end only feed it.
export const MIN_RANKED_MARKETS = 3;
const BOARD_SIZE = 20;
const BUCKETS = 10;

/** One trade in a resolved market. */
export interface ResolvedTrade {
  marketId: string;
  /** The market's final outcome. */
  outcome: ResolutionOutcome;
  /** Credits the trade moved, fees included: the trade's weight. */
  weightMicros: number;
  /** YES probability just before the trade: the crowd's forecast. */
  probabilityBefore: number;
  /** YES probability the trade left behind: the trader's forecast. */
  probabilityAfter: number;
}
export interface MarketForecast {
  forecast: number;
  baseline: number;
  outcome: 0 | 1;
}
export interface ScoredAccount {
  id: string;
  resolvedMarkets: number;
  brier: number | null;
}

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const squaredError = (probability: number, outcome: 0 | 1) =>
  (probability - outcome) ** 2;

/** One size-weighted forecast per market; INVALID and weightless markets drop out. */
export function marketForecasts(
  trades: readonly ResolvedTrade[],
): MarketForecast[] {
  const totals = new Map<
    string,
    { weight: number; after: number; before: number; yes: boolean }
  >();
  for (const trade of trades) {
    if (trade.outcome === "INVALID") continue;
    const total = totals.get(trade.marketId);
    totals.set(trade.marketId, {
      weight: (total?.weight ?? 0) + trade.weightMicros,
      after: (total?.after ?? 0) + trade.weightMicros * trade.probabilityAfter,
      before:
        (total?.before ?? 0) + trade.weightMicros * trade.probabilityBefore,
      yes: trade.outcome === "YES",
    });
  }
  return [...totals.values()]
    .filter((total) => total.weight > 0)
    .map((total) => ({
      forecast: total.after / total.weight,
      baseline: total.before / total.weight,
      outcome: total.yes ? 1 : 0,
    }));
}

export function calibrationBuckets(
  forecasts: readonly MarketForecast[],
): CalibrationBucket[] {
  return Array.from({ length: BUCKETS }, (_, index) => {
    // A forecast of exactly 1 belongs to the top bucket.
    const members = forecasts.filter(
      (item) =>
        Math.min(Math.floor(item.forecast * BUCKETS), BUCKETS - 1) === index,
    );
    return {
      from: index / BUCKETS,
      to: (index + 1) / BUCKETS,
      count: members.length,
      meanForecast: members.length
        ? mean(members.map((item) => item.forecast))
        : null,
      observedRate: members.length
        ? mean(members.map((item) => item.outcome))
        : null,
    };
  });
}

/** Mean Brier per market, so one heavily traded market does not dominate. */
export function scoreForecasts(
  forecasts: readonly MarketForecast[],
): Calibration {
  const buckets = calibrationBuckets(forecasts);
  if (!forecasts.length) return { resolvedMarkets: 0, brier: null, buckets };
  const brier = mean(
    forecasts.map((item) => squaredError(item.forecast, item.outcome)),
  );
  const baseline = mean(
    forecasts.map((item) => squaredError(item.baseline, item.outcome)),
  );
  return {
    resolvedMarkets: forecasts.length,
    brier,
    skill: baseline - brier,
    buckets,
  };
}

/** Lowest Brier first (more resolved markets breaks ties); top 20 plus the viewer. */
export function rankForecasters(
  accounts: readonly ScoredAccount[],
  viewerId?: string,
): (ScoredAccount & { rank: number; brier: number })[] {
  return (
    accounts
      .filter(
        (account): account is ScoredAccount & { brier: number } =>
          account.brier !== null &&
          account.resolvedMarkets >= MIN_RANKED_MARKETS,
      )
      // filter() returned a fresh array, so sorting it leaves the input untouched.
      .sort(
        (a, b) => a.brier - b.brier || b.resolvedMarkets - a.resolvedMarkets,
      )
      .map((account, index) => ({ ...account, rank: index + 1 }))
      .filter((row) => row.rank <= BOARD_SIZE || row.id === viewerId)
  );
}

// Only trades move an LMSR price, so the price before a trade is the one the
// previous trade in that market left, or the market's opening probability.
// ponytail: scans every trade in resolved markets per request; store scores
// at settlement once that history grows large.
// Public markets by default; one workspace's private markets when given its id.
function resolvedTrades(
  store: Store,
  accountId: string | null,
  workspaceId: string | null = null,
): (ResolvedTrade & { accountId: string })[] {
  return store.db
    .prepare(
      `SELECT * FROM (
        SELECT t.account_id AS accountId, t.market_id AS marketId,
          json_extract(m.resolution,'$.outcome') AS outcome,
          json_extract(t.payload,'$.amountMicros') AS weightMicros,
          COALESCE(
            LAG(json_extract(t.payload,'$.probabilityAfter')) OVER (PARTITION BY t.market_id ORDER BY t.rowid),
            json_extract(m.definition,'$.initialProbability')
          ) AS probabilityBefore,
          json_extract(t.payload,'$.probabilityAfter') AS probabilityAfter
        FROM trades t JOIN markets m ON m.id=t.market_id
        WHERE json_extract(m.resolution,'$.status')='resolved' AND m.workspace_id IS ?
      ) WHERE ? IS NULL OR accountId=?`,
    )
    .all(workspaceId, accountId, accountId) as unknown as (ResolvedTrade & {
    accountId: string;
  })[];
}

export function accountCalibration(
  store: Store,
  accountId: string,
): Calibration {
  return scoreForecasts(marketForecasts(resolvedTrades(store, accountId)));
}

/** Public accuracy board, or one workspace's; accounts appear only under their alias. */
export function forecasterBoard(
  store: Store,
  viewerId?: string,
  workspaceId: string | null = null,
): ForecasterRank[] {
  const byAccount = new Map<string, ResolvedTrade[]>();
  for (const row of resolvedTrades(store, null, workspaceId)) {
    const list = byAccount.get(row.accountId) ?? [];
    list.push(row);
    byAccount.set(row.accountId, list);
  }
  const scored = [...byAccount].map(([id, trades]) => ({
    id,
    ...scoreForecasts(marketForecasts(trades)),
  }));
  return rankForecasters(scored, viewerId).map((row) => ({
    rank: row.rank,
    trader: store.handle(row.id),
    you: row.id === viewerId,
    resolvedMarkets: row.resolvedMarkets,
    brier: row.brier,
  }));
}

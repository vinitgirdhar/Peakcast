export const MICRO = 1_000_000;
export type Outcome = "YES" | "NO";
export type Action = "buy" | "sell";
export interface Pool {
  yes: number;
  no: number;
  liquidity: number;
}

export function probability(
  yes: number,
  no: number,
  liquidity: number,
): number {
  const difference = (yes - no) / liquidity;
  return difference >= 0
    ? 1 / (1 + Math.exp(-difference))
    : Math.exp(difference) / (1 + Math.exp(difference));
}

function cost(yes: number, no: number, liquidity: number): number {
  const maximum = Math.max(yes, no);
  return (
    maximum + liquidity * Math.log1p(Math.exp(-Math.abs(yes - no) / liquidity))
  );
}

export function quoteTrade(
  pool: Pool,
  outcome: Outcome,
  action: Action,
  shares: number,
): { amountMicros: number; priceAfter: number } {
  if (
    !Number.isSafeInteger(shares) ||
    shares < 1 ||
    shares > 10_000 ||
    !Number.isFinite(pool.yes) ||
    !Number.isFinite(pool.no) ||
    !Number.isFinite(pool.liquidity) ||
    pool.liquidity <= 0 ||
    !["YES", "NO"].includes(outcome) ||
    !["buy", "sell"].includes(action)
  )
    throw new Error("Invalid quote parameters");
  const change = action === "buy" ? shares : -shares;
  const yes = pool.yes + (outcome === "YES" ? change : 0);
  const no = pool.no + (outcome === "NO" ? change : 0);
  const difference =
    Math.abs(
      cost(yes, no, pool.liquidity) - cost(pool.yes, pool.no, pool.liquidity),
    ) * MICRO;
  // Round in the pool's favor so repeated buy/sell cycles cannot mint demo credits.
  const amountMicros =
    action === "buy" ? Math.ceil(difference) : Math.floor(difference);
  return { amountMicros, priceAfter: probability(yes, no, pool.liquidity) };
}

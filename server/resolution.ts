import { MICRO } from "./amm.js";
import { cancelMarketOrders } from "./orders.js";
import {
  announceOutcome,
  holderIds,
  marketTitle,
  notify,
} from "./notifications.js";
import {
  DomainError,
  LAUNCH_STAKE_MICROS,
  type Store,
  type StoredResolution,
} from "./database.js";
import type { Market, ResolutionOutcome } from "../shared/types.js";

// Market lifecycle after trading: the creator proposes an outcome, anyone may
// dispute it during the challenge window by posting a bond, undisputed
// proposals settle permissionlessly and disputed ones wait for the operator.
export const DISPUTE_BOND_MICROS = 100 * MICRO;

export function propose(
  store: Store,
  accountId: string,
  marketId: string,
  outcome: ResolutionOutcome,
  evidenceUrl: string,
  windowMs: number,
): Market {
  return store.transaction(() => {
    const row = store.row(marketId);
    if (row.creator_id !== accountId)
      throw new DomainError(
        "Only the account that launched this market can propose its outcome.",
        403,
      );
    if (row.resolution)
      throw new DomainError("This market already has a proposed outcome.", 409);
    const now = Date.now();
    store.setResolution(marketId, {
      status: "proposed",
      outcome,
      evidenceUrl,
      proposedAt: new Date(now).toISOString(),
      challengeEndsAt: new Date(now + windowMs).toISOString(),
    });
    const title = marketTitle(store, marketId);
    for (const holderId of holderIds(store, marketId))
      if (holderId !== accountId)
        notify(
          store,
          holderId,
          "outcome_proposed",
          marketId,
          `"${title}" was proposed to resolve ${outcome}. You can dispute it during the challenge window.`,
        );
    return store.market(marketId);
  });
}

export function dispute(
  store: Store,
  accountId: string,
  marketId: string,
): Market {
  return store.transaction(() => {
    const row = store.row(marketId);
    const resolution = store.resolution(marketId);
    if (row.creator_id === accountId)
      throw new DomainError("You cannot dispute your own proposal.", 403);
    if (
      resolution?.status !== "proposed" ||
      resolution.challengeEndsAt <= new Date().toISOString()
    )
      throw new DomainError(
        "This market has no open challenge window to dispute.",
        409,
      );
    store.credit(
      accountId,
      -DISPUTE_BOND_MICROS,
      "dispute_bond",
      marketId,
      "Disputing posts a 100-credit bond; your balance is too low.",
    );
    store.setResolution(marketId, {
      ...resolution,
      status: "disputed",
      disputerId: accountId,
    });
    // Only the creator can propose, so a proposed market always has one.
    notify(
      store,
      row.creator_id!,
      "dispute_filed",
      marketId,
      `Your proposed outcome on "${marketTitle(store, marketId)}" was disputed. An operator will rule.`,
    );
    return store.market(marketId);
  });
}

export function settle(store: Store, marketId: string): Market {
  return store.transaction(() => {
    const resolution = store.resolution(marketId);
    if (resolution?.status === "disputed")
      throw new DomainError(
        "This outcome is disputed and waits for an operator ruling.",
        409,
      );
    if (resolution?.status !== "proposed")
      throw new DomainError("This market has no proposal to settle.", 409);
    if (resolution.challengeEndsAt > new Date().toISOString())
      throw new DomainError("The challenge window is still open.", 409);
    return payOut(store, marketId, resolution, resolution.outcome);
  });
}

/** Pays out every undisputed proposal whose challenge window has ended. */
export function settleDue(store: Store): number {
  let settled = 0;
  for (const id of store.proposedMarketIds())
    try {
      settle(store, id);
      settled += 1;
    } catch (error) {
      // A DomainError here only means the challenge window is still open.
      if (!(error instanceof DomainError)) throw error;
    }
  return settled;
}

export function rule(
  store: Store,
  marketId: string,
  outcome: ResolutionOutcome,
): Market {
  return store.transaction(() => {
    store.row(marketId);
    const resolution = store.resolution(marketId);
    if (resolution?.status === "resolved")
      throw new DomainError("This market is already resolved.", 409);
    const now = new Date().toISOString();
    return payOut(
      store,
      marketId,
      resolution ?? {
        status: "proposed",
        outcome,
        evidenceUrl: "",
        proposedAt: now,
        challengeEndsAt: now,
      },
      outcome,
    );
  });
}

function payOut(
  store: Store,
  marketId: string,
  resolution: StoredResolution,
  outcome: ResolutionOutcome,
): Market {
  const row = store.row(marketId);
  const holders = store.db
    .prepare(
      "SELECT account_id,outcome,shares FROM positions WHERE market_id=? AND shares>0",
    )
    .all(marketId) as unknown as {
    account_id: string;
    outcome: "YES" | "NO";
    shares: number;
  }[];
  let paidMicros = 0;
  const paid = new Map<string, number>();
  for (const holder of holders) {
    // A winning share redeems for 1 credit; INVALID splits it evenly.
    const payout =
      outcome === "INVALID"
        ? (holder.shares * MICRO) / 2
        : holder.outcome === outcome
          ? holder.shares * MICRO
          : 0;
    if (!payout) continue;
    store.credit(holder.account_id, payout, "payout", marketId);
    paidMicros += payout;
    paid.set(holder.account_id, (paid.get(holder.account_id) ?? 0) + payout);
  }
  store.db
    .prepare("UPDATE positions SET shares=0,cost_micros=0 WHERE market_id=?")
    .run(marketId);
  cancelMarketOrders(
    store,
    marketId,
    "Market resolved before the price arrived.",
  );
  if (row.creator_id) {
    // The LMSR bound guarantees stake + trader payments cover every payout;
    // whatever the pool did not need goes back to the creator.
    let refundMicros = Math.max(
      0,
      LAUNCH_STAKE_MICROS + row.pool_micros - paidMicros,
    );
    if (resolution.disputerId && outcome === resolution.outcome)
      store.credit(row.creator_id, DISPUTE_BOND_MICROS, "bond_award", marketId);
    else if (resolution.disputerId) {
      const penaltyMicros = Math.min(refundMicros, DISPUTE_BOND_MICROS);
      refundMicros -= penaltyMicros;
      store.credit(
        resolution.disputerId,
        DISPUTE_BOND_MICROS,
        "bond_return",
        marketId,
      );
      if (penaltyMicros)
        store.credit(
          resolution.disputerId,
          penaltyMicros,
          "dispute_reward",
          marketId,
        );
    }
    if (refundMicros)
      store.credit(row.creator_id, refundMicros, "stake_return", marketId);
  }
  store.setResolution(marketId, {
    ...resolution,
    status: "resolved",
    outcome,
    resolvedAt: new Date().toISOString(),
  });
  announceOutcome(
    store,
    marketId,
    outcome,
    [
      ...(row.creator_id ? [row.creator_id] : []),
      ...holders.map((holder) => holder.account_id),
    ],
    paid,
  );
  return store.market(marketId);
}

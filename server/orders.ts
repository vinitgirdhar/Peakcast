import { randomUUID } from "node:crypto";
import { DomainError, Store } from "./database.js";
import { marketTitle, notify } from "./notifications.js";
import type { LimitOrder, TradeInput } from "../shared/types.js";

const MAX_OPEN_ORDERS = 20;

interface OrderRow {
  id: string;
  account_id: string;
  market_id: string;
  outcome: "YES" | "NO";
  action: "buy" | "sell";
  shares: number;
  limit_price: number;
  status: LimitOrder["status"];
  note: string | null;
  created_at: string;
  closed_at: string | null;
}

const toOrder = (store: Store, row: OrderRow): LimitOrder => ({
  id: row.id,
  marketId: row.market_id,
  title: store.market(row.market_id).title,
  outcome: row.outcome,
  action: row.action,
  shares: row.shares,
  limitPrice: row.limit_price,
  status: row.status,
  ...(row.note && { note: row.note }),
  createdAt: row.created_at,
  ...(row.closed_at && { closedAt: row.closed_at }),
});

type OrderSummary = Pick<
  OrderRow,
  "account_id" | "market_id" | "outcome" | "action" | "shares"
>;

/** Tells the owner the server filled or cancelled their order. */
function notifyOwner(store: Store, order: OrderSummary, note: string | null) {
  const what = `Your order to ${order.action} ${order.shares} ${order.outcome} on "${marketTitle(store, order.market_id)}"`;
  notify(
    store,
    order.account_id,
    note === null ? "order_filled" : "order_cancelled",
    order.market_id,
    note === null ? `${what} filled.` : `${what} was cancelled. ${note}`,
  );
}

/** Closes an open order on the server's initiative and notifies its owner. */
function close(store: Store, order: OrderRow, note: string | null): void {
  const changed = store.db
    .prepare(
      "UPDATE orders SET status=?,note=?,closed_at=? WHERE id=? AND status='open'",
    )
    .run(
      note === null ? "filled" : "cancelled",
      note,
      new Date().toISOString(),
      order.id,
    ).changes;
  if (changed) notifyOwner(store, order, note);
}

/** Open orders first, then the most recent closed ones. */
export function listOrders(store: Store, accountId: string): LimitOrder[] {
  return (
    store.db
      .prepare(
        "SELECT * FROM orders WHERE account_id=? ORDER BY (status='open') DESC, rowid DESC LIMIT 50",
      )
      .all(accountId) as unknown as OrderRow[]
  ).map((row) => toOrder(store, row));
}

export function placeOrder(
  store: Store,
  accountId: string,
  input: TradeInput & { limitPrice: number },
): LimitOrder {
  if (store.market(input.marketId).status !== "open")
    throw new DomainError("This market is closed.", 409);
  const open = store.db
    .prepare(
      "SELECT COUNT(*) AS total FROM orders WHERE account_id=? AND status='open'",
    )
    .get(accountId) as { total: number };
  if (open.total >= MAX_OPEN_ORDERS)
    throw new DomainError(
      `You can keep at most ${MAX_OPEN_ORDERS} open orders. Cancel one first.`,
      409,
    );
  const id = randomUUID();
  store.db
    .prepare("INSERT INTO orders VALUES (?,?,?,?,?,?,?,'open',NULL,?,NULL)")
    .run(
      id,
      accountId,
      input.marketId,
      input.outcome,
      input.action,
      input.shares,
      input.limitPrice,
      new Date().toISOString(),
    );
  // An order that is already inside its limit fills straight away.
  matchOrders(store, input.marketId);
  return toOrder(
    store,
    store.db
      .prepare("SELECT * FROM orders WHERE id=?")
      .get(id) as unknown as OrderRow,
  );
}

export function cancelOrder(store: Store, accountId: string, id: string): void {
  // Another account's order looks the same as a missing one. The owner
  // cancelled it themselves, so nobody is notified.
  const changed = store.db
    .prepare(
      "UPDATE orders SET status='cancelled',closed_at=? WHERE id=? AND account_id=? AND status='open'",
    )
    .run(new Date().toISOString(), id, accountId).changes;
  if (!changed) throw new DomainError("Open order not found.", 404);
}

export function cancelMarketOrders(
  store: Store,
  marketId: string,
  note: string,
): void {
  const closed = store.db
    .prepare(
      "UPDATE orders SET status='cancelled',note=?,closed_at=? WHERE market_id=? AND status='open' RETURNING account_id,market_id,outcome,action,shares",
    )
    .all(note, new Date().toISOString(), marketId) as unknown as OrderSummary[];
  for (const order of closed) notifyOwner(store, order, note);
}

/**
 * Fills every resting order whose limit the pool price now satisfies.
 * Returns the number of fills.
 *
 * ponytail: all-or-nothing fills against the AMM, oldest first, re-scanned
 * after each fill because a fill moves the price. Credits are checked at fill
 * time, not reserved. Add partial fills and reservations if depth matters.
 */
export function matchOrders(store: Store, marketId: string): number {
  if (store.market(marketId).status !== "open") return 0;
  let fills = 0;
  for (let pass = 0; pass < 50; pass += 1) {
    const open = store.db
      .prepare(
        "SELECT * FROM orders WHERE market_id=? AND status='open' ORDER BY rowid",
      )
      .all(marketId) as unknown as OrderRow[];
    let filled = false;
    for (const order of open) {
      const input = {
        marketId,
        outcome: order.outcome,
        action: order.action,
        shares: order.shares,
      };
      try {
        const quote = store.quote(input);
        if (
          order.action === "buy"
            ? quote.averagePrice > order.limit_price
            : quote.averagePrice < order.limit_price
        )
          continue;
        store.trade(
          order.account_id,
          { ...input, limitMicros: quote.amountMicros },
          "order-" + order.id,
        );
        close(store, order, null);
        fills += 1;
        filled = true;
        break;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        // Not enough credits or shares when the price arrived.
        close(store, order, error.message);
      }
    }
    if (!filled) break;
  }
  return fills;
}

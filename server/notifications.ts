import { MICRO } from "./amm.js";
import type { Store } from "./database.js";
import type {
  Inbox,
  InboxNotification,
  MarketDefinition,
  NotificationKind,
  ResolutionOutcome,
} from "../shared/types.js";

// ponytail: rows are kept forever; prune read rows older than N days once
// the table gets large.
const INBOX_SIZE = 50;

interface NotificationRow {
  id: number;
  kind: NotificationKind;
  market_id: string | null;
  text: string;
  created_at: string;
  read_at: string | null;
}

export const marketTitle = (store: Store, marketId: string): string =>
  (JSON.parse(store.row(marketId).definition) as MarketDefinition).title;

export function notify(
  store: Store,
  accountId: string,
  kind: NotificationKind,
  marketId: string | null,
  text: string,
): void {
  store.db
    .prepare(
      "INSERT INTO notifications (account_id,kind,market_id,text,created_at) VALUES (?,?,?,?,?)",
    )
    .run(accountId, kind, marketId, text, new Date().toISOString());
}

/** Accounts that currently hold shares on a market. */
export function holderIds(store: Store, marketId: string): string[] {
  return (
    store.db
      .prepare(
        "SELECT DISTINCT account_id FROM positions WHERE market_id=? AND shares>0",
      )
      .all(marketId) as { account_id: string }[]
  ).map((row) => row.account_id);
}

/** Tells payout recipients what they got and everyone involved the outcome. */
export function announceOutcome(
  store: Store,
  marketId: string,
  outcome: ResolutionOutcome,
  involved: string[],
  paid: Map<string, number>,
): void {
  const title = marketTitle(store, marketId);
  for (const [accountId, micros] of paid)
    notify(
      store,
      accountId,
      "payout",
      marketId,
      `You received ${micros / MICRO} credits from "${title}".`,
    );
  for (const accountId of new Set(involved))
    notify(
      store,
      accountId,
      "market_resolved",
      marketId,
      `"${title}" resolved ${outcome}.`,
    );
}

export function inbox(store: Store, accountId: string): Inbox {
  const rows = store.db
    .prepare(
      "SELECT id,kind,market_id,text,created_at,read_at FROM notifications WHERE account_id=? ORDER BY id DESC LIMIT ?",
    )
    .all(accountId, INBOX_SIZE) as unknown as NotificationRow[];
  const { unread } = store.db
    .prepare(
      "SELECT COUNT(*) AS unread FROM notifications WHERE account_id=? AND read_at IS NULL",
    )
    .get(accountId) as { unread: number };
  return {
    items: rows.map((row): InboxNotification => ({
      id: row.id,
      kind: row.kind,
      ...(row.market_id && { marketId: row.market_id }),
      text: row.text,
      createdAt: row.created_at,
      read: row.read_at !== null,
    })),
    unread,
  };
}

export function markAllRead(store: Store, accountId: string): { unread: 0 } {
  store.db
    .prepare(
      "UPDATE notifications SET read_at=? WHERE account_id=? AND read_at IS NULL",
    )
    .run(new Date().toISOString(), accountId);
  return { unread: 0 };
}

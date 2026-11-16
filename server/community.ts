import { DomainError, Store } from "./database.js";
import { marketTitle, notify } from "./notifications.js";
import type { MarketComment, Outcome } from "../shared/types.js";

const COMMENT_COOLDOWN_MS = 5_000;

interface CommentRow {
  id: number;
  account_id: string;
  body: string;
  created_at: string;
}

function toComment(
  store: Store,
  marketId: string,
  row: CommentRow,
  viewerId?: string,
): MarketComment {
  // Showing which side a commenter holds lets readers weigh the argument.
  const held = store.db
    .prepare(
      "SELECT outcome FROM positions WHERE account_id=? AND market_id=? AND shares>0 ORDER BY shares DESC LIMIT 1",
    )
    .get(row.account_id, marketId) as { outcome: Outcome } | undefined;
  return {
    id: row.id,
    trader: store.handle(row.account_id),
    you: row.account_id === viewerId,
    ...(held && { holds: held.outcome }),
    body: row.body,
    createdAt: row.created_at,
  };
}

export function listComments(
  store: Store,
  marketId: string,
  viewerId?: string,
): MarketComment[] {
  store.row(marketId);
  return (
    store.db
      .prepare(
        "SELECT id,account_id,body,created_at FROM comments WHERE market_id=? ORDER BY id DESC LIMIT 50",
      )
      .all(marketId) as unknown as CommentRow[]
  ).map((row) => toComment(store, marketId, row, viewerId));
}

export function addComment(
  store: Store,
  accountId: string,
  marketId: string,
  text: string,
): MarketComment {
  const { creator_id: creatorId } = store.row(marketId);
  const body = text.trim();
  if (!body) throw new DomainError("Write a comment first.", 400);
  const last = store.db
    .prepare(
      "SELECT created_at FROM comments WHERE account_id=? ORDER BY id DESC LIMIT 1",
    )
    .get(accountId) as { created_at: string } | undefined;
  if (last && Date.now() - Date.parse(last.created_at) < COMMENT_COOLDOWN_MS)
    throw new DomainError("Wait a few seconds before commenting again.", 429);
  const row = {
    account_id: accountId,
    body,
    created_at: new Date().toISOString(),
  };
  const id = Number(
    store.db
      .prepare(
        "INSERT INTO comments(market_id,account_id,body,created_at) VALUES (?,?,?,?)",
      )
      .run(marketId, accountId, body, row.created_at).lastInsertRowid,
  );
  if (creatorId && creatorId !== accountId)
    notify(
      store,
      creatorId,
      "comment",
      marketId,
      `${store.handle(accountId)} commented on "${marketTitle(store, marketId)}".`,
    );
  return toComment(store, marketId, { id, ...row }, accountId);
}

export function setWatching(
  store: Store,
  accountId: string,
  marketId: string,
  watching: boolean,
): void {
  store.row(marketId);
  store.db
    .prepare(
      watching
        ? "INSERT OR IGNORE INTO watchlist VALUES (?,?)"
        : "DELETE FROM watchlist WHERE account_id=? AND market_id=?",
    )
    .run(accountId, marketId);
}

export function watchlist(store: Store, accountId: string): string[] {
  return (
    store.db
      .prepare(
        "SELECT market_id FROM watchlist WHERE account_id=? ORDER BY rowid DESC",
      )
      .all(accountId) as { market_id: string }[]
  ).map((row) => row.market_id);
}

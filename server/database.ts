import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedMarkets } from "./fixtures.js";
import { MICRO, probability, quoteTrade } from "./amm.js";
import { blockingReason, lintDraft, warningIds } from "../shared/lint.js";
import type {
  Category,
  Draft,
  DraftInput,
  LedgerEntry,
  Leaderboard,
  LedgerKind,
  Market,
  MarketTrade,
  MarketDefinition,
  Portfolio,
  Position,
  ResolutionOutcome,
  Trade,
  TradeInput,
} from "../shared/types.js";

/** Practice credits granted to every new personal account. */
export const STARTING_CREDITS = 5_000;
const STARTING_MICROS = STARTING_CREDITS * MICRO;

/** Prefix of a deleted member's name; `handle` shows only this. */
export const FORMER_MEMBER = "Former member ";

export class DomainError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

interface MarketRow {
  id: string;
  definition: string;
  q_yes: number;
  q_no: number;
  liquidity: number;
  volume_micros: number;
  created_at: string;
  creator_id: string | null;
  creator_fees_micros: number;
  /** Net credits traders have paid into the pool, creator fees excluded. */
  pool_micros: number;
  resolution: string | null;
  /** Set on a private market; NULL for public ones. */
  workspace_id: string | null;
}
export interface StoredResolution {
  status: "proposed" | "disputed" | "resolved";
  outcome: ResolutionOutcome;
  evidenceUrl: string;
  proposedAt: string;
  challengeEndsAt: string;
  disputerId?: string;
  resolvedAt?: string;
}
interface AccountRow {
  id: string;
  balance_micros: number;
  expires_at: string;
}
interface PositionRow {
  market_id: string;
  outcome: "YES" | "NO";
  shares: number;
  cost_micros: number;
}
interface TradeRow {
  payload: string;
  fingerprint: string;
}

// A creator stakes the pool's worst-case loss: an LMSR market opened at 50%
// can lose at most liquidity * ln(2) credits, so the stake fully funds it.
export const LAUNCH_STAKE_MICROS = 500 * MICRO;
export const CREATOR_FEE_BPS = 100;
export const DAY_MS = 86_400_000;
// Trades stored before creator fees existed have no feeMicros.
const parseTrade = (payload: string): Trade => {
  const trade = JSON.parse(payload) as Trade;
  return { ...trade, feeMicros: trade.feeMicros ?? 0 };
};

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class Store {
  readonly db: DatabaseSync;
  /**
   * Show players by display name instead of an anonymous alias. On for the
   * on-device apps, where every account lives on the user's own device; off on
   * a shared server, where display names stay private to workspaces.
   */
  showDisplayNames = false;

  /** `database` is the on-device SQLite (src/local/sqlite.ts); a path opens node:sqlite. */
  constructor(path: string, database?: DatabaseSync) {
    if (!database && path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true });
    this.db = database ?? new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS markets (id TEXT PRIMARY KEY, definition TEXT NOT NULL, q_yes REAL NOT NULL, q_no REAL NOT NULL, liquidity REAL NOT NULL, volume_micros INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, balance_micros INTEGER NOT NULL CHECK(balance_micros >= 0), expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS positions (account_id TEXT NOT NULL REFERENCES accounts(id), market_id TEXT NOT NULL REFERENCES markets(id), outcome TEXT NOT NULL CHECK(outcome IN ('YES','NO')), shares INTEGER NOT NULL CHECK(shares >= 0), cost_micros INTEGER NOT NULL CHECK(cost_micros >= 0), PRIMARY KEY(account_id,market_id,outcome));
      CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), market_id TEXT NOT NULL REFERENCES markets(id), idempotency_key TEXT NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(account_id,idempotency_key));
      CREATE INDEX IF NOT EXISTS trades_market ON trades(market_id,created_at);
      CREATE INDEX IF NOT EXISTS trades_account ON trades(account_id,created_at);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL REFERENCES accounts(id), kind TEXT NOT NULL, market_id TEXT, amount_micros INTEGER NOT NULL, balance_micros INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ledger_account ON ledger(account_id,id);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), market_id TEXT NOT NULL REFERENCES markets(id), outcome TEXT NOT NULL CHECK(outcome IN ('YES','NO')), action TEXT NOT NULL CHECK(action IN ('buy','sell')), shares INTEGER NOT NULL CHECK(shares > 0), limit_price REAL NOT NULL, status TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, closed_at TEXT);
      CREATE INDEX IF NOT EXISTS orders_market ON orders(market_id,status);
      CREATE INDEX IF NOT EXISTS orders_account ON orders(account_id,status);
      CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, market_id TEXT NOT NULL REFERENCES markets(id), account_id TEXT NOT NULL REFERENCES accounts(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS comments_market ON comments(market_id,id);
      CREATE TABLE IF NOT EXISTS watchlist (account_id TEXT NOT NULL REFERENCES accounts(id), market_id TEXT NOT NULL REFERENCES markets(id), PRIMARY KEY(account_id,market_id));
      CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL REFERENCES accounts(id), kind TEXT NOT NULL, market_id TEXT REFERENCES markets(id), text TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);
      CREATE INDEX IF NOT EXISTS notifications_account ON notifications(account_id,id);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspace_members (id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL REFERENCES workspaces(id), account_id TEXT NOT NULL REFERENCES accounts(id), wallet_id TEXT NOT NULL UNIQUE REFERENCES accounts(id), role TEXT NOT NULL CHECK(role IN ('owner','admin','resolver','member')), display_name TEXT NOT NULL, joined_at TEXT NOT NULL, removed_at TEXT, PRIMARY KEY(workspace_id,account_id));
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_name ON workspace_members(workspace_id, display_name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS workspace_members_account ON workspace_members(account_id);
      CREATE TABLE IF NOT EXISTS workspace_invites (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('member','resolver')), created_by TEXT NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 500), uses INTEGER NOT NULL DEFAULT 0, revoked_at TEXT);
      CREATE INDEX IF NOT EXISTS workspace_invites_workspace ON workspace_invites(workspace_id);
    `);
    const columns = (table: string) =>
      (
        this.db.prepare(`PRAGMA table_info(${table})`).all() as {
          name: string;
        }[]
      ).map((column) => column.name);
    for (const [table, name, type] of [
      ["markets", "creator_id", "TEXT REFERENCES accounts(id)"],
      ["markets", "creator_fees_micros", "INTEGER NOT NULL DEFAULT 0"],
      ["markets", "pool_micros", "INTEGER NOT NULL DEFAULT 0"],
      ["markets", "resolution", "TEXT"],
      ["markets", "workspace_id", "TEXT REFERENCES workspaces(id)"],
      ["accounts", "workspace_id", "TEXT REFERENCES workspaces(id)"],
      // Accounts created before onboarding started with 10,000 credits.
      [
        "accounts",
        "starting_micros",
        `INTEGER NOT NULL DEFAULT ${10_000 * MICRO}`,
      ],
      ["accounts", "display_name", "TEXT"],
      ["accounts", "terms_version", "TEXT"],
      ["accounts", "terms_accepted_at", "TEXT"],
      ["accounts", "adult_confirmed_at", "TEXT"],
      ["accounts", "playground", "INTEGER NOT NULL DEFAULT 1"],
      ["accounts", "deleted_at", "TEXT"],
    ])
      if (!columns(table).includes(name))
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    // Only after the loop: on an older database these columns are new.
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS markets_workspace ON markets(workspace_id);
      CREATE INDEX IF NOT EXISTS accounts_workspace ON accounts(workspace_id);
    `);
    if (!this.db.prepare("SELECT id FROM markets LIMIT 1").get()) {
      const insert = this.db.prepare(
        "INSERT INTO markets (id,definition,q_yes,q_no,liquidity,created_at) VALUES (?,?,?,?,?,?)",
      );
      this.db.exec("BEGIN IMMEDIATE");
      try {
        for (const market of seedMarkets) {
          const difference =
            1000 *
            Math.log(
              market.initialProbability / (1 - market.initialProbability),
            );
          insert.run(
            market.id,
            JSON.stringify(market),
            Math.max(difference, 0),
            Math.max(-difference, 0),
            1000,
            new Date().toISOString(),
          );
        }
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  createSession() {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    this.db
      .prepare(
        "INSERT INTO accounts (id,token_hash,balance_micros,starting_micros,expires_at) VALUES (?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        hashToken(token),
        STARTING_MICROS,
        STARTING_MICROS,
        expiresAt,
      );
    return { token, expiresAt, balanceMicros: STARTING_MICROS };
  }

  account(token?: string): AccountRow {
    const account =
      token &&
      (this.db
        .prepare(
          "SELECT id,balance_micros,expires_at FROM accounts WHERE token_hash=? AND deleted_at IS NULL",
        )
        .get(hashToken(token)) as AccountRow | undefined);
    if (!account || account.expires_at <= new Date().toISOString())
      throw new DomainError("Start a demo session to continue.", 401);
    // Sliding 30 days: an account in use never expires, an abandoned one does.
    // Renewed at most once a day so reads do not write every time.
    if (Date.parse(account.expires_at) < Date.now() + 29 * DAY_MS)
      this.db
        .prepare("UPDATE accounts SET expires_at=? WHERE id=?")
        .run(new Date(Date.now() + 30 * DAY_MS).toISOString(), account.id);
    return account;
  }

  row(id: string): MarketRow {
    const row = this.db
      .prepare("SELECT * FROM markets WHERE id=?")
      .get(id) as unknown as MarketRow | undefined;
    if (!row) throw new DomainError("Market not found.", 404);
    return row;
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Moves credits and writes the matching ledger row; call inside a transaction. */
  credit(
    accountId: string,
    deltaMicros: number,
    kind: LedgerKind,
    marketId: string | null,
    shortMessage = "Insufficient demo credits.",
  ): number {
    const changed = this.db
      .prepare(
        "UPDATE accounts SET balance_micros=balance_micros+? WHERE id=? AND balance_micros+?>=0",
      )
      .run(deltaMicros, accountId, deltaMicros);
    if (!changed.changes) throw new DomainError(shortMessage, 409);
    const { balance_micros: balanceMicros } = this.db
      .prepare("SELECT balance_micros FROM accounts WHERE id=?")
      .get(accountId) as { balance_micros: number };
    this.db
      .prepare(
        "INSERT INTO ledger (account_id,kind,market_id,amount_micros,balance_micros,created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(
        accountId,
        kind,
        marketId,
        deltaMicros,
        balanceMicros,
        new Date().toISOString(),
      );
    return balanceMicros;
  }

  resolution(id: string): StoredResolution | undefined {
    const stored = this.row(id).resolution;
    return stored ? (JSON.parse(stored) as StoredResolution) : undefined;
  }

  setResolution(id: string, resolution: StoredResolution): void {
    this.db
      .prepare("UPDATE markets SET resolution=? WHERE id=?")
      .run(JSON.stringify(resolution), id);
  }

  market(id: string): Market {
    const row = this.row(id);
    const resolution = row.resolution
      ? (JSON.parse(row.resolution) as StoredResolution)
      : undefined;
    const definition = JSON.parse(row.definition) as MarketDefinition;
    // Both lookups ride the (market_id, created_at) index, so list endpoints
    // stay one cheap query per market.
    const count = this.db
      .prepare(
        "SELECT COUNT(*) AS total, (SELECT json_extract(payload,'$.probabilityAfter') FROM trades WHERE market_id=? AND created_at<=? ORDER BY created_at DESC, rowid DESC LIMIT 1) AS dayAgo FROM trades WHERE market_id=?",
      )
      .get(id, new Date(Date.now() - DAY_MS).toISOString(), id) as {
      total: number;
      dayAgo: number | null;
    };
    const current = probability(row.q_yes, row.q_no, row.liquidity);
    return {
      ...definition,
      probability: current,
      change24h: count.total
        ? current - (count.dayAgo ?? definition.initialProbability)
        : 0,
      volumeMicros: row.volume_micros,
      trades: count.total,
      status:
        resolution?.status ??
        (definition.closesAt > new Date().toISOString() ? "open" : "closed"),
      feeBps: row.creator_id ? CREATOR_FEE_BPS : 0,
      // The disputer's account stays private; only the fact of a dispute is public.
      ...(resolution && {
        resolution: {
          outcome: resolution.outcome,
          evidenceUrl: resolution.evidenceUrl,
          proposedAt: resolution.proposedAt,
          challengeEndsAt: resolution.challengeEndsAt,
          disputed: Boolean(resolution.disputerId),
          resolvedAt: resolution.resolvedAt,
        },
      }),
      ...(row.workspace_id && { workspaceId: row.workspace_id }),
    };
  }

  /** Public markets by default; a workspace's private markets when given its id. */
  markets(search = "", category = "", workspaceId: string | null = null) {
    const rows = this.db
      .prepare("SELECT id FROM markets WHERE workspace_id IS ? ORDER BY rowid")
      .all(workspaceId) as { id: string }[];
    return rows
      .map((row) => this.market(row.id))
      .filter(
        (market) =>
          (!category || market.category === category) &&
          (!search ||
            `${market.title} ${market.description} ${market.category}`
              .toLowerCase()
              .includes(search.toLowerCase())),
      );
  }

  quote(input: TradeInput) {
    const row = this.row(input.marketId);
    if (this.market(input.marketId).status !== "open")
      throw new DomainError("This market is closed.", 409);
    const quote = quoteTrade(
      { yes: row.q_yes, no: row.q_no, liquidity: row.liquidity },
      input.outcome,
      input.action,
      input.shares,
    );
    // The creator fee is charged on top of a buy and withheld from a sell,
    // rounded against the trader so splitting an order never avoids it.
    const feeMicros = row.creator_id
      ? Math.min(
          Math.ceil((quote.amountMicros * CREATOR_FEE_BPS) / 10_000),
          input.action === "buy" ? Infinity : quote.amountMicros,
        )
      : 0;
    const amountMicros =
      quote.amountMicros + (input.action === "buy" ? feeMicros : -feeMicros);
    return {
      ...input,
      amountMicros,
      feeMicros,
      priceAfter: quote.priceAfter,
      averagePrice: amountMicros / MICRO / input.shares,
    };
  }

  trade(
    accountId: string,
    input: TradeInput & { limitMicros: number },
    key: string,
  ): Trade {
    const fingerprint = JSON.stringify([
      input.marketId,
      input.outcome,
      input.action,
      input.shares,
      input.limitMicros,
    ]);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare(
          "SELECT payload,fingerprint FROM trades WHERE account_id=? AND idempotency_key=?",
        )
        .get(accountId, key) as TradeRow | undefined;
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new DomainError(
            "This idempotency key was used for a different trade.",
            409,
          );
        this.db.exec("COMMIT");
        return parseTrade(previous.payload);
      }
      const quote = this.quote(input);
      if (
        (input.action === "buy" && quote.amountMicros > input.limitMicros) ||
        (input.action === "sell" && quote.amountMicros < input.limitMicros)
      )
        throw new DomainError(
          "The price changed beyond your limit. Refresh the quote.",
          409,
        );
      const account = this.db
        .prepare("SELECT balance_micros FROM accounts WHERE id=?")
        .get(accountId) as { balance_micros: number };
      const held = this.db
        .prepare(
          "SELECT * FROM positions WHERE account_id=? AND market_id=? AND outcome=?",
        )
        .get(accountId, input.marketId, input.outcome) as unknown as
        PositionRow | undefined;
      if (input.action === "buy" && account.balance_micros < quote.amountMicros)
        throw new DomainError("Insufficient demo credits.", 409);
      if (input.action === "sell" && (!held || held.shares < input.shares))
        throw new DomainError("You do not own enough shares to sell.", 409);
      const direction = input.action === "buy" ? 1 : -1;
      const shares = (held?.shares ?? 0) + direction * input.shares;
      const costMicros =
        input.action === "buy"
          ? (held?.cost_micros ?? 0) + quote.amountMicros
          : shares === 0
            ? 0
            : Math.floor((held!.cost_micros * shares) / held!.shares);
      this.db
        .prepare(
          "INSERT INTO positions VALUES (?,?,?,?,?) ON CONFLICT(account_id,market_id,outcome) DO UPDATE SET shares=excluded.shares,cost_micros=excluded.cost_micros",
        )
        .run(accountId, input.marketId, input.outcome, shares, costMicros);
      this.db
        .prepare(
          "UPDATE markets SET q_yes=q_yes+?,q_no=q_no+?,volume_micros=volume_micros+?,pool_micros=pool_micros+? WHERE id=?",
        )
        .run(
          input.outcome === "YES" ? direction * input.shares : 0,
          input.outcome === "NO" ? direction * input.shares : 0,
          quote.amountMicros,
          direction * quote.amountMicros - quote.feeMicros,
          input.marketId,
        );
      const creatorId = this.row(input.marketId).creator_id;
      if (creatorId && quote.feeMicros) {
        this.credit(creatorId, quote.feeMicros, "creator_fee", input.marketId);
        this.db
          .prepare(
            "UPDATE markets SET creator_fees_micros=creator_fees_micros+? WHERE id=?",
          )
          .run(quote.feeMicros, input.marketId);
      }
      const trade: Trade = {
        ...input,
        id: randomUUID(),
        amountMicros: quote.amountMicros,
        feeMicros: quote.feeMicros,
        balanceMicros: this.credit(
          accountId,
          -direction * quote.amountMicros,
          "trade",
          input.marketId,
        ),
        probabilityAfter: quote.priceAfter,
        createdAt: new Date().toISOString(),
      };
      this.db
        .prepare("INSERT INTO trades VALUES (?,?,?,?,?,?,?)")
        .run(
          trade.id,
          accountId,
          input.marketId,
          key,
          fingerprint,
          JSON.stringify(trade),
          trade.createdAt,
        );
      this.db.exec("COMMIT");
      return trade;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  portfolio(
    accountId: string,
  ): Omit<Portfolio, "orders" | "watchlist" | "bonus" | "stats"> {
    const account = this.db
      .prepare("SELECT balance_micros,starting_micros FROM accounts WHERE id=?")
      .get(accountId) as { balance_micros: number; starting_micros: number };
    const rows = this.db
      .prepare(
        "SELECT market_id,outcome,shares,cost_micros FROM positions WHERE account_id=? AND shares>0",
      )
      .all(accountId) as unknown as PositionRow[];
    const positions: Position[] = rows.map((row) => {
      const market = this.market(row.market_id);
      const price =
        row.outcome === "YES" ? market.probability : 1 - market.probability;
      return {
        marketId: row.market_id,
        title: market.title,
        outcome: row.outcome,
        shares: row.shares,
        costMicros: row.cost_micros,
        valueMicros: Math.floor(row.shares * price * MICRO),
        probability: price,
      };
    });
    const trades = this.db
      .prepare(
        "SELECT payload FROM trades WHERE account_id=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(accountId) as { payload: string }[];
    const valueMicros = positions.reduce(
      (sum, position) => sum + position.valueMicros,
      0,
    );
    const investedMicros = positions.reduce(
      (sum, position) => sum + position.costMicros,
      0,
    );
    return {
      balanceMicros: account.balance_micros,
      equityMicros: account.balance_micros + valueMicros,
      investedMicros,
      // Bonus credits are a gift, not trading profit.
      pnlMicros:
        account.balance_micros +
        valueMicros -
        (
          this.db
            .prepare(
              "SELECT COALESCE(SUM(amount_micros),0) AS total FROM ledger WHERE account_id=? AND kind='daily_bonus'",
            )
            .get(accountId) as { total: number }
        ).total -
        account.starting_micros,
      positions,
      trades: trades.map((row) => parseTrade(row.payload)),
      created: (
        this.db
          .prepare(
            "SELECT id,creator_fees_micros FROM markets WHERE creator_id=? ORDER BY rowid DESC",
          )
          .all(accountId) as { id: string; creator_fees_micros: number }[]
      ).map((row) => {
        const market = this.market(row.id);
        return {
          marketId: market.id,
          title: market.title,
          probability: market.probability,
          volumeMicros: market.volumeMicros,
          trades: market.trades,
          feesMicros: row.creator_fees_micros,
          status: market.status,
        };
      }),
      ledger: (
        this.db
          .prepare(
            "SELECT id,kind,market_id,amount_micros,balance_micros,created_at FROM ledger WHERE account_id=? ORDER BY id DESC LIMIT 100",
          )
          .all(accountId) as unknown as {
          id: number;
          kind: LedgerKind;
          market_id: string | null;
          amount_micros: number;
          balance_micros: number;
          created_at: string;
        }[]
      ).map((row): LedgerEntry => ({
        id: row.id,
        kind: row.kind,
        ...(row.market_id && { marketId: row.market_id }),
        amountMicros: row.amount_micros,
        balanceMicros: row.balance_micros,
        createdAt: row.created_at,
      })),
    };
  }

  /**
   * Stable public alias; the account id itself never leaves the server. A
   * workspace wallet shows its member's display name, which only members see.
   */
  handle(accountId: string): string {
    const member = this.db
      .prepare("SELECT display_name FROM workspace_members WHERE wallet_id=?")
      .get(accountId) as { display_name: string } | undefined;
    if (member)
      return member.display_name.startsWith(FORMER_MEMBER)
        ? FORMER_MEMBER.trim()
        : member.display_name;
    if (this.showDisplayNames) {
      const account = this.db
        .prepare(
          "SELECT display_name FROM accounts WHERE id=? AND deleted_at IS NULL",
        )
        .get(accountId) as { display_name: string | null } | undefined;
      if (account?.display_name) return account.display_name;
    }
    return (
      "Trader " +
      createHash("sha256")
        .update(accountId)
        .digest("hex")
        .slice(0, 4)
        .toUpperCase()
    );
  }

  marketTrades(id: string): MarketTrade[] {
    this.row(id);
    return (
      this.db
        .prepare(
          "SELECT account_id,payload FROM trades WHERE market_id=? ORDER BY rowid DESC LIMIT 30",
        )
        .all(id) as { account_id: string; payload: string }[]
    ).map((row) => {
      const trade = parseTrade(row.payload);
      return {
        id: trade.id,
        trader: this.handle(row.account_id),
        outcome: trade.outcome,
        action: trade.action,
        shares: trade.shares,
        amountMicros: trade.amountMicros,
        probabilityAfter: trade.probabilityAfter,
        createdAt: trade.createdAt,
      };
    });
  }

  // ponytail: ranks every active account per request; cache or materialise
  // the ranking once accounts reach the tens of thousands.
  // Public accounts by default; one workspace's wallets when given its id.
  leaderboard(
    viewerId?: string,
    workspaceId: string | null = null,
  ): Omit<Leaderboard, "forecasters"> {
    const prices = new Map<string, number>();
    const price = (marketId: string) => {
      if (!prices.has(marketId))
        prices.set(marketId, this.market(marketId).probability);
      return prices.get(marketId)!;
    };
    const held = new Map<string, number>();
    for (const row of this.db
      .prepare(
        "SELECT p.account_id,p.market_id,p.outcome,p.shares FROM positions p JOIN accounts a ON a.id=p.account_id WHERE p.shares>0 AND a.workspace_id IS ?",
      )
      .all(workspaceId) as unknown as (PositionRow & {
      account_id: string;
    })[]) {
      const yes = price(row.market_id);
      held.set(
        row.account_id,
        (held.get(row.account_id) ?? 0) +
          Math.floor(
            row.shares * (row.outcome === "YES" ? yes : 1 - yes) * MICRO,
          ),
      );
    }
    const top = <T extends { id: string }>(rows: T[]) =>
      rows
        .map((row, index) => ({ ...row, rank: index + 1 }))
        .filter((row) => row.rank <= 20 || row.id === viewerId);
    const traders = (
      this.db
        .prepare(
          "SELECT a.id,a.balance_micros,a.starting_micros,(SELECT COUNT(*) FROM trades t WHERE t.account_id=a.id) AS trades,(SELECT COALESCE(SUM(amount_micros),0) FROM ledger b WHERE b.account_id=a.id AND b.kind='daily_bonus') AS bonus FROM accounts a WHERE a.workspace_id IS ? AND EXISTS (SELECT 1 FROM ledger l WHERE l.account_id=a.id)",
        )
        .all(workspaceId) as {
        id: string;
        balance_micros: number;
        starting_micros: number;
        trades: number;
        bonus: number;
      }[]
    )
      .map((row) => ({
        id: row.id,
        trades: row.trades,
        pnlMicros:
          // Bonus credits are a gift, not trading profit.
          row.balance_micros +
          (held.get(row.id) ?? 0) -
          row.bonus -
          row.starting_micros,
      }))
      .sort((a, b) => b.pnlMicros - a.pnlMicros);
    const creators = this.db
      .prepare(
        "SELECT creator_id AS id,COUNT(*) AS markets,SUM(volume_micros) AS volume,SUM(creator_fees_micros) AS fees FROM markets WHERE creator_id IS NOT NULL AND workspace_id IS ? GROUP BY creator_id ORDER BY fees DESC, volume DESC",
      )
      .all(workspaceId) as {
      id: string;
      markets: number;
      volume: number;
      fees: number;
    }[];
    return {
      traders: top(traders).map((row) => ({
        rank: row.rank,
        trader: this.handle(row.id),
        you: row.id === viewerId,
        pnlMicros: row.pnlMicros,
        trades: row.trades,
      })),
      creators: top(creators).map((row) => ({
        rank: row.rank,
        trader: this.handle(row.id),
        you: row.id === viewerId,
        markets: row.markets,
        volumeMicros: row.volume,
        feesMicros: row.fees,
      })),
    };
  }

  /** Markets with an outcome proposal that nobody has disputed yet. */
  proposedMarketIds(): string[] {
    return (
      this.db
        .prepare(
          "SELECT id,resolution FROM markets WHERE resolution IS NOT NULL",
        )
        .all() as { id: string; resolution: string }[]
    )
      .filter(
        (row) =>
          (JSON.parse(row.resolution) as StoredResolution).status ===
          "proposed",
      )
      .map((row) => row.id);
  }

  history(id: string) {
    const row = this.row(id);
    const definition = JSON.parse(row.definition) as MarketDefinition;
    const trades = this.db
      .prepare(
        "SELECT payload FROM (SELECT rowid,payload FROM trades WHERE market_id=? ORDER BY rowid DESC LIMIT 99) ORDER BY rowid",
      )
      .all(id) as { payload: string }[];
    return [
      { at: row.created_at, probability: definition.initialProbability },
      ...trades.map((row) => {
        const trade = JSON.parse(row.payload) as Trade;
        return { at: trade.createdAt, probability: trade.probabilityAfter };
      }),
    ];
  }

  saveDraft(
    accountId: string,
    input: DraftInput,
    mode: Draft["mode"],
    reviewNotes: string[],
  ): Draft {
    const draft: Draft = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mode,
      status: "draft",
      reviewNotes,
    };
    this.db
      .prepare("INSERT INTO drafts VALUES (?,?,?,?)")
      .run(draft.id, accountId, JSON.stringify(draft), draft.createdAt);
    return draft;
  }

  drafts(accountId: string): Draft[] {
    const rows = this.db
      .prepare(
        "SELECT payload FROM drafts WHERE account_id=? ORDER BY rowid DESC LIMIT 50",
      )
      .all(accountId) as { payload: string }[];
    return rows.map((row) => JSON.parse(row.payload) as Draft);
  }

  deleteDraft(accountId: string, id: string): void {
    const result = this.db
      .prepare("DELETE FROM drafts WHERE id=? AND account_id=?")
      .run(id, accountId);
    if (!result.changes) throw new DomainError("Draft not found.", 404);
  }

  /** With a target the market is private: the member's wallet stakes and creates it. */
  launchDraft(
    accountId: string,
    id: string,
    category: Category,
    target?: { walletId: string; workspaceId: string },
  ): Market {
    const creatorId = target?.walletId ?? accountId;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const saved = this.db
        .prepare("SELECT payload FROM drafts WHERE id=? AND account_id=?")
        .get(id, accountId) as { payload: string } | undefined;
      if (!saved) throw new DomainError("Draft not found.", 404);
      const draft = JSON.parse(saved.payload) as Draft;
      const now = new Date().toISOString();
      if (draft.closesAt <= now)
        throw new DomainError(
          "This draft's closing time has passed. Save a new draft with a future deadline.",
          409,
        );
      const report = lintDraft(draft, Date.now());
      const blocked = blockingReason(report);
      if (blocked) throw new DomainError(blocked, 409);
      const slug = draft.question
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
      const definition: MarketDefinition = {
        // A private id carries no slug, so its title never reaches URLs or logs.
        id: target
          ? `ws-${randomUUID()}`
          : `${slug || "market"}-${randomUUID().slice(0, 8)}`,
        title: draft.question,
        description: `Community market. Resolves using ${draft.sourceName}.`,
        category,
        symbol: "◆",
        color: "#eef0f6",
        sourceName: draft.sourceName,
        sourceUrl: draft.sourceUrl,
        closesAt: draft.closesAt,
        yesRule: draft.yesRule,
        noRule: draft.noRule,
        invalidRule: draft.invalidRule,
        initialProbability: 0.5,
        ruleCheck: { risk: report.risk, warnings: warningIds(report) },
      };
      this.db
        .prepare(
          "INSERT INTO markets (id,definition,q_yes,q_no,liquidity,created_at,creator_id,workspace_id) VALUES (?,?,0,0,?,?,?,?)",
        )
        .run(
          definition.id,
          JSON.stringify(definition),
          LAUNCH_STAKE_MICROS / MICRO / Math.LN2,
          now,
          creatorId,
          target?.workspaceId ?? null,
        );
      this.credit(
        creatorId,
        -LAUNCH_STAKE_MICROS,
        "launch_stake",
        definition.id,
        "Launching a market stakes 500 demo credits; your balance is too low.",
      );
      this.db.prepare("DELETE FROM drafts WHERE id=?").run(id);
      this.db.exec("COMMIT");
      return this.market(definition.id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

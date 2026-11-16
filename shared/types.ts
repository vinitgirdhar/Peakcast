export type Outcome = "YES" | "NO";
export type Action = "buy" | "sell";
export type ResolutionOutcome = Outcome | "INVALID";
export type MarketStatus =
  "open" | "closed" | "proposed" | "disputed" | "resolved";
export interface MarketResolution {
  outcome: ResolutionOutcome;
  /** Empty when an operator ruled without a creator proposal. */
  evidenceUrl: string;
  proposedAt: string;
  challengeEndsAt: string;
  disputed: boolean;
  resolvedAt?: string;
}
export type AIProvider = "gemini" | "groq" | "openai" | "ollama";
export interface AIProviderInfo {
  id: AIProvider;
  label: string;
  model: string;
  configured: boolean;
}
export type Category =
  "Economy" | "Technology" | "Crypto" | "Science" | "Climate" | "World";
export interface MarketDefinition {
  id: string;
  title: string;
  description: string;
  category: Category;
  symbol: string;
  color: string;
  sourceName: string;
  sourceUrl: string;
  closesAt: string;
  yesRule: string;
  noRule: string;
  invalidRule: string;
  initialProbability: number;
}
export interface Market extends MarketDefinition {
  probability: number;
  /**
   * YES probability now minus 24 hours ago (from stored trades; the initial
   * probability when no trade is that old). 0 before the first trade.
   */
  change24h: number;
  volumeMicros: number;
  trades: number;
  status: MarketStatus;
  resolution?: MarketResolution;
  /** Creator fee in basis points; 0 on house markets. */
  feeBps: number;
}
export interface HistoryPoint {
  at: string;
  probability: number;
}
/** A public trade on a market; the trader is an alias, never an account id. */
export interface MarketTrade {
  id: string;
  trader: string;
  outcome: Outcome;
  action: Action;
  shares: number;
  amountMicros: number;
  probabilityAfter: number;
  createdAt: string;
}
export interface LimitOrder {
  id: string;
  marketId: string;
  title: string;
  outcome: Outcome;
  action: Action;
  shares: number;
  /** Average price per share, 0.01 to 0.99: maximum for a buy, minimum for a sell. */
  limitPrice: number;
  status: "open" | "filled" | "cancelled";
  /** Why the server cancelled the order, when it did. */
  note?: string;
  createdAt: string;
  closedAt?: string;
}
export interface MarketComment {
  id: number;
  trader: string;
  you: boolean;
  /** The side the commenter currently holds on this market, if any. */
  holds?: Outcome;
  body: string;
  createdAt: string;
}
export interface TraderRank {
  rank: number;
  trader: string;
  /** True for the signed-in viewer's own row. */
  you: boolean;
  pnlMicros: number;
  trades: number;
}
export interface CreatorRank {
  rank: number;
  trader: string;
  you: boolean;
  markets: number;
  volumeMicros: number;
  feesMicros: number;
}
export interface Leaderboard {
  /** Top 20 by profit, plus the viewer's own row when outside the top 20. */
  traders: TraderRank[];
  creators: CreatorRank[];
}
export interface TradeInput {
  marketId: string;
  outcome: Outcome;
  action: Action;
  shares: number;
}
export interface Quote extends TradeInput {
  /** Total the trader pays (buy) or receives (sell), creator fee included. */
  amountMicros: number;
  feeMicros: number;
  averagePrice: number;
  priceAfter: number;
}
export interface Trade extends TradeInput {
  id: string;
  amountMicros: number;
  feeMicros: number;
  balanceMicros: number;
  probabilityAfter: number;
  createdAt: string;
}
export interface Position {
  marketId: string;
  title: string;
  outcome: Outcome;
  shares: number;
  costMicros: number;
  valueMicros: number;
  probability: number;
}
export interface CreatedMarket {
  marketId: string;
  title: string;
  probability: number;
  volumeMicros: number;
  trades: number;
  feesMicros: number;
  status: MarketStatus;
}
export type LedgerKind =
  | "trade"
  | "creator_fee"
  | "launch_stake"
  | "stake_return"
  | "payout"
  | "dispute_bond"
  | "bond_return"
  | "bond_award"
  | "dispute_reward"
  | "daily_bonus";
export interface LedgerEntry {
  id: number;
  kind: LedgerKind;
  marketId?: string;
  /** Signed: positive credits the account, negative debits it. */
  amountMicros: number;
  balanceMicros: number;
  createdAt: string;
}
export interface Portfolio {
  balanceMicros: number;
  equityMicros: number;
  investedMicros: number;
  pnlMicros: number;
  positions: Position[];
  trades: Trade[];
  /** Markets this account launched, with creator fees earned so far. */
  created: CreatedMarket[];
  /** Last 100 credit movements, newest first. */
  ledger: LedgerEntry[];
  /** Open limit orders first, then recently closed ones. */
  orders: LimitOrder[];
  /** Ids of watched markets, most recently added first. */
  watchlist: string[];
  bonus: DailyBonus;
  stats: AccountStats;
}
export interface DailyBonus {
  /** False once today's (UTC) bonus has been claimed. */
  available: boolean;
  /** Consecutive UTC days claimed, ending today if claimed, else yesterday. */
  streak: number;
  /** What the next claim pays: 50 credits + 10 per streak day, max 100. */
  nextAmountMicros: number;
}
export interface BonusClaim {
  amountMicros: number;
  /** Balance after the bonus was credited. */
  balanceMicros: number;
  /** Status after this claim: available is false until the next UTC day. */
  bonus: DailyBonus;
}
export interface AccountStats {
  tradeCount: number;
  /** Total paid and received across own trades, fees included. */
  volumeMicros: number;
  /** Resolved markets this account traded in. */
  resolvedMarkets: number;
  /** Resolved markets where this account received a payout. */
  wins: number;
  /** wins / resolvedMarkets, from 0 to 1; 0 when nothing has resolved. */
  winRate: number;
  creatorFeesMicros: number;
  payoutsMicros: number;
}
export type NotificationKind =
  | "order_filled"
  | "order_cancelled"
  | "payout"
  | "outcome_proposed"
  | "dispute_filed"
  | "market_resolved"
  | "comment";
export interface InboxNotification {
  id: number;
  kind: NotificationKind;
  marketId?: string;
  /** Short plain-text message for display. */
  text: string;
  createdAt: string;
  read: boolean;
}
export interface Inbox {
  /** Last 50 notifications, newest first. */
  items: InboxNotification[];
  /** All unread notifications, including any older than the last 50. */
  unread: number;
}
export interface DraftInput {
  question: string;
  sourceName: string;
  sourceUrl: string;
  closesAt: string;
  yesRule: string;
  noRule: string;
  invalidRule: string;
}
export interface Draft extends DraftInput {
  id: string;
  createdAt: string;
  mode: "manual" | AIProvider;
  status: "draft";
  reviewNotes: string[];
}
export interface Capabilities {
  mode: "demo";
  aiConfigured: boolean;
  aiAccessManaged?: boolean;
  aiProviders: AIProviderInfo[];
  defaultAIProvider: AIProvider | null;
  marketCount: number;
  version: string;
}

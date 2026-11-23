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
  /** Rule-linter summary stored at launch; absent on seed and older markets. */
  ruleCheck?: RuleCheck;
}
export interface RuleCheck {
  /** 0 to 100; see lintDraft in shared/lint.ts. */
  risk: number;
  /** Distinct ids of the warnings the creator launched with. */
  warnings: string[];
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
  /** Set only on a private market: the workspace it belongs to. */
  workspaceId?: string;
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
export interface ForecasterRank {
  rank: number;
  trader: string;
  you: boolean;
  /** Markets resolved YES or NO that this forecaster traded; at least 3. */
  resolvedMarkets: number;
  /** Mean Brier score over those markets: 0 is perfect, lower ranks first. */
  brier: number;
}
export interface Leaderboard {
  /** Top 20 by profit, plus the viewer's own row when outside the top 20. */
  traders: TraderRank[];
  creators: CreatorRank[];
  /** Top 20 by lowest Brier score among accounts with 3+ resolved markets. */
  forecasters: ForecasterRank[];
}
/** Forecasts from `from` (inclusive) to `to`; the last bucket includes 1. */
export interface CalibrationBucket {
  from: number;
  to: number;
  /** Resolved markets whose forecast falls in this bucket. */
  count: number;
  /** Mean forecast of those markets; null when the bucket is empty. */
  meanForecast: number | null;
  /** Share of those markets that resolved YES; null when empty. */
  observedRate: number | null;
}
/**
 * Accuracy over markets resolved YES or NO. A market's forecast is the
 * size-weighted mean YES probability the account's trades left behind.
 */
export interface Calibration {
  resolvedMarkets: number;
  /** Mean of (forecast − outcome)² per market; null before any resolves. */
  brier: number | null;
  /**
   * Crowd baseline Brier (prices just before each trade) minus `brier`;
   * positive means the account improved on the market. Absent when `brier` is null.
   */
  skill?: number;
  /** Ten buckets of width 0.1 for a reliability diagram. */
  buckets: CalibrationBucket[];
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
  /** Set when the notification is about a private market of this workspace. */
  workspaceId?: string;
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
/** Advisory AI review of a draft; never saved and never blocks a launch. */
export interface DraftCritique {
  provider: AIProvider;
  summary: string;
  findings: {
    field: keyof DraftInput;
    severity: "warn" | "info";
    message: string;
    suggestion: string;
    /** Verbatim (case-insensitive) text from `field`. */
    quote: string;
  }[];
}
/**
 * AI-written explainer of one market, from its own text and numbers only.
 * Advisory and not financial advice; plain text, never HTML.
 */
export interface MarketExplanation {
  provider: AIProvider;
  generatedAt: string;
  /** YES probability when generated; a move over 5 points regenerates it. */
  probability: number;
  summary: string;
  /** At most 5. */
  drivers: string[];
  /** At most 3 each. */
  wouldMoveUp: string[];
  wouldMoveDown: string[];
  /** May be empty. */
  baseRateNote: string;
  caveats: string[];
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
  /**
   * Origin for shareable market links and embeds. Null when this server is
   * reachable only from this device (the Windows desktop app).
   */
  shareOrigin?: string | null;
  /** False where workspaces are unavailable (the Windows app): hide Teams. */
  teams: boolean;
}
/** oEmbed 1.0 "rich" response for a market link; `html` is a ready-to-paste iframe. */
export interface OEmbed {
  version: "1.0";
  type: "rich";
  provider_name: "Wildcatter";
  provider_url: string;
  title: string;
  html: string;
  width: number;
  height: number;
}
export type WorkspaceRole = "owner" | "admin" | "resolver" | "member";
/** Invites never grant owner or admin; the owner promotes afterwards. */
export type InviteRole = "member" | "resolver";
/** A workspace as one of its members sees it. */
export interface Workspace {
  id: string;
  name: string;
  /** The viewer's own role. */
  role: WorkspaceRole;
  /** Active members; removed members are not counted. */
  memberCount: number;
  createdAt: string;
}
export interface WorkspaceMember {
  /** Opaque member id for role changes and removal; never an account id. */
  id: string;
  displayName: string;
  role: WorkspaceRole;
  joinedAt: string;
  /** True for the viewer's own membership. */
  you: boolean;
}
export interface WorkspaceDetail extends Workspace {
  /** Active members in join order. */
  members: WorkspaceMember[];
}
export interface WorkspaceInvite {
  id: string;
  role: InviteRole;
  expiresAt: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
}
/** Returned once, at creation. The invite link is `${origin}/join#${token}`. */
export interface CreatedInvite extends WorkspaceInvite {
  token: string;
}
export interface InviteInput {
  role: InviteRole;
  /** 1–720; default 168 (7 days). */
  expiresInHours?: number;
  /** 1–500; default 25. */
  maxUses?: number;
}
export interface InvitePreview {
  workspaceName: string;
  role: InviteRole;
  expiresAt: string;
}

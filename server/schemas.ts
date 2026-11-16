import { Type } from "@sinclair/typebox";

export const AIProviderSchema = Type.Union([
  Type.Literal("ollama"),
  Type.Literal("gemini"),
  Type.Literal("groq"),
  Type.Literal("openai"),
]);

export const TradeInputSchema = Type.Object(
  {
    marketId: Type.String({
      minLength: 1,
      maxLength: 100,
      pattern: "^[a-z0-9-]+$",
    }),
    outcome: Type.Union([Type.Literal("YES"), Type.Literal("NO")]),
    action: Type.Union([Type.Literal("buy"), Type.Literal("sell")]),
    shares: Type.Integer({ minimum: 1, maximum: 10_000 }),
  },
  { additionalProperties: false },
);

export const ExecutionSchema = Type.Object(
  {
    ...TradeInputSchema.properties,
    limitMicros: Type.Integer({ minimum: 0, maximum: 10_000_000_000 }),
  },
  { additionalProperties: false },
);

export const DraftSchema = Type.Object(
  {
    question: Type.String({ minLength: 12, maxLength: 240 }),
    sourceName: Type.String({ minLength: 2, maxLength: 120 }),
    sourceUrl: Type.String({
      minLength: 10,
      maxLength: 1000,
      pattern: "^https://",
    }),
    closesAt: Type.String({ format: "date-time" }),
    yesRule: Type.String({ minLength: 15, maxLength: 2000 }),
    noRule: Type.String({ minLength: 15, maxLength: 2000 }),
    invalidRule: Type.String({ minLength: 15, maxLength: 2000 }),
  },
  { additionalProperties: false },
);

const Text = Type.String();
export const ErrorSchema = Type.Object({ message: Type.String() });
const Units = Type.Integer({ minimum: 0 });
export const MarketSchema = Type.Object({
  id: Text,
  title: Text,
  description: Text,
  category: Text,
  symbol: Text,
  color: Text,
  sourceName: Text,
  sourceUrl: Text,
  closesAt: Text,
  yesRule: Text,
  noRule: Text,
  invalidRule: Text,
  initialProbability: Type.Number(),
  probability: Type.Number(),
  change24h: Type.Number(),
  volumeMicros: Units,
  trades: Units,
  status: Text,
  feeBps: Units,
  resolution: Type.Optional(
    Type.Object({
      outcome: Text,
      evidenceUrl: Text,
      proposedAt: Text,
      challengeEndsAt: Text,
      disputed: Type.Boolean(),
      resolvedAt: Type.Optional(Text),
    }),
  ),
});
const ResolutionOutcomeSchema = Type.Union([
  Type.Literal("YES"),
  Type.Literal("NO"),
  Type.Literal("INVALID"),
]);
export const ProposalSchema = Type.Object(
  {
    outcome: ResolutionOutcomeSchema,
    evidenceUrl: Type.String({
      minLength: 10,
      maxLength: 1000,
      pattern: "^https://",
    }),
  },
  { additionalProperties: false },
);
export const RulingSchema = Type.Object(
  { outcome: ResolutionOutcomeSchema },
  { additionalProperties: false },
);
export const LaunchSchema = Type.Object(
  {
    category: Type.Union(
      ["Economy", "Technology", "Crypto", "Science", "Climate", "World"].map(
        (category) => Type.Literal(category),
      ),
    ),
  },
  { additionalProperties: false },
);
export const QuoteSchema = Type.Object({
  ...TradeInputSchema.properties,
  amountMicros: Units,
  feeMicros: Units,
  averagePrice: Type.Number(),
  priceAfter: Type.Number(),
});
export const FillSchema = Type.Object({
  ...TradeInputSchema.properties,
  id: Text,
  amountMicros: Units,
  feeMicros: Units,
  balanceMicros: Units,
  probabilityAfter: Type.Number(),
  createdAt: Text,
});
export const SavedDraftSchema = Type.Object({
  ...DraftSchema.properties,
  id: Text,
  createdAt: Text,
  mode: Text,
  status: Text,
  reviewNotes: Type.Array(Text),
});
export const OrderSchema = Type.Object({
  id: Text,
  marketId: Text,
  title: Text,
  outcome: Text,
  action: Text,
  shares: Units,
  limitPrice: Type.Number(),
  status: Text,
  note: Type.Optional(Text),
  createdAt: Text,
  closedAt: Type.Optional(Text),
});
export const OrderInputSchema = Type.Object(
  {
    ...TradeInputSchema.properties,
    limitPrice: Type.Number({ minimum: 0.01, maximum: 0.99 }),
  },
  { additionalProperties: false },
);
export const CommentSchema = Type.Object({
  id: Type.Integer(),
  trader: Text,
  you: Type.Boolean(),
  holds: Type.Optional(Text),
  body: Text,
  createdAt: Text,
});
/** For POST routes that take no input: no body or `{}`; anything else is 400. */
export const NoBodySchema = Type.Union([
  Type.Null(),
  Type.Object({}, { additionalProperties: false }),
]);
export const BonusSchema = Type.Object({
  available: Type.Boolean(),
  streak: Units,
  nextAmountMicros: Units,
});
export const BonusClaimSchema = Type.Object({
  amountMicros: Units,
  balanceMicros: Units,
  bonus: BonusSchema,
});
export const StatsSchema = Type.Object({
  tradeCount: Units,
  volumeMicros: Units,
  resolvedMarkets: Units,
  wins: Units,
  winRate: Type.Number(),
  creatorFeesMicros: Units,
  payoutsMicros: Units,
});
export const InboxSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      id: Type.Integer(),
      kind: Text,
      marketId: Type.Optional(Text),
      text: Text,
      createdAt: Text,
      read: Type.Boolean(),
    }),
  ),
  unread: Units,
});
export const PortfolioSchema = Type.Object({
  balanceMicros: Units,
  equityMicros: Units,
  investedMicros: Units,
  pnlMicros: Type.Integer(),
  positions: Type.Array(
    Type.Object({
      marketId: Text,
      title: Text,
      outcome: Text,
      shares: Units,
      costMicros: Units,
      valueMicros: Units,
      probability: Type.Number(),
    }),
  ),
  trades: Type.Array(FillSchema),
  created: Type.Array(
    Type.Object({
      marketId: Text,
      title: Text,
      probability: Type.Number(),
      volumeMicros: Units,
      trades: Units,
      feesMicros: Units,
      status: Text,
    }),
  ),
  ledger: Type.Array(
    Type.Object({
      id: Type.Integer(),
      kind: Text,
      marketId: Type.Optional(Text),
      amountMicros: Type.Integer(),
      balanceMicros: Units,
      createdAt: Text,
    }),
  ),
  orders: Type.Array(OrderSchema),
  watchlist: Type.Array(Text),
  bonus: BonusSchema,
  stats: StatsSchema,
});

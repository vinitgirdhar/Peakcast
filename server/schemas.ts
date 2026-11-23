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

/** Advisory AI critique; checked after parsing the provider's output. */
export const CritiqueSchema = Type.Object(
  {
    summary: Type.String({ maxLength: 400 }),
    findings: Type.Array(
      Type.Object(
        {
          field: Type.Union(
            (
              [
                "question",
                "sourceName",
                "sourceUrl",
                "closesAt",
                "yesRule",
                "noRule",
                "invalidRule",
              ] as const
            ).map((field) => Type.Literal(field)),
          ),
          severity: Type.Union([Type.Literal("warn"), Type.Literal("info")]),
          message: Type.String({ minLength: 1, maxLength: 300 }),
          suggestion: Type.String({ maxLength: 300 }),
          quote: Type.String({ maxLength: 200 }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 8 },
    ),
  },
  { additionalProperties: false },
);
const explainItems = (maxItems: number) =>
  Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems });
/** What the model must return for a market explainer; checked before use. */
export const ExplanationSchema = Type.Object(
  {
    summary: Type.String({ minLength: 1, maxLength: 400 }),
    drivers: explainItems(5),
    wouldMoveUp: explainItems(3),
    wouldMoveDown: explainItems(3),
    baseRateNote: Type.String({ maxLength: 300 }),
    caveats: explainItems(3),
  },
  { additionalProperties: false },
);
export const MarketExplanationSchema = Type.Object({
  provider: AIProviderSchema,
  generatedAt: Type.String(),
  probability: Type.Number(),
  ...ExplanationSchema.properties,
});

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
  ruleCheck: Type.Optional(
    Type.Object({ risk: Type.Number(), warnings: Type.Array(Text) }),
  ),
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
  workspaceId: Type.Optional(Text),
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
    workspaceId: Type.Optional(Type.String({ format: "uuid" })),
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
const Probability = Type.Number({ minimum: 0, maximum: 1 });
const MaybeProbability = Type.Union([Probability, Type.Null()]);
export const CalibrationSchema = Type.Object({
  resolvedMarkets: Units,
  brier: MaybeProbability,
  skill: Type.Optional(Type.Number()),
  buckets: Type.Array(
    Type.Object({
      from: Probability,
      to: Probability,
      count: Units,
      meanForecast: MaybeProbability,
      observedRate: MaybeProbability,
    }),
  ),
});
export const ForecasterRankSchema = Type.Object({
  rank: Type.Integer(),
  trader: Text,
  you: Type.Boolean(),
  resolvedMarkets: Units,
  brier: Probability,
});
export const LeaderboardSchema = Type.Object({
  traders: Type.Array(
    Type.Object({
      rank: Type.Integer(),
      trader: Type.String(),
      you: Type.Boolean(),
      pnlMicros: Type.Integer(),
      trades: Type.Integer(),
    }),
  ),
  creators: Type.Array(
    Type.Object({
      rank: Type.Integer(),
      trader: Type.String(),
      you: Type.Boolean(),
      markets: Type.Integer(),
      volumeMicros: Type.Integer(),
      feesMicros: Type.Integer(),
    }),
  ),
  forecasters: Type.Array(ForecasterRankSchema),
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
      workspaceId: Type.Optional(Text),
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

// Query strings are not type-coerced, so sizes arrive as digit strings.
const Size = Type.String({ pattern: "^[1-9][0-9]{0,3}$" });
export const OEmbedQuerySchema = Type.Object(
  {
    url: Type.String({ minLength: 1, maxLength: 2048 }),
    maxwidth: Type.Optional(Size),
    maxheight: Type.Optional(Size),
    format: Type.Optional(Type.Literal("json")),
  },
  { additionalProperties: false },
);
export const OEmbedSchema = Type.Object({
  version: Type.Literal("1.0"),
  type: Type.Literal("rich"),
  provider_name: Type.Literal("Wildcatter"),
  provider_url: Text,
  title: Text,
  html: Text,
  width: Type.Integer(),
  height: Type.Integer(),
});

// Teams. Names are trimmed by the server and must keep 2+ characters.
const NoControl = "^[^\\u0000-\\u001f\\u007f]+$";
export const WorkspaceRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("admin"),
  Type.Literal("resolver"),
  Type.Literal("member"),
]);
const InviteRoleSchema = Type.Union([
  Type.Literal("member"),
  Type.Literal("resolver"),
]);
const WorkspaceName = Type.String({
  minLength: 2,
  maxLength: 60,
  pattern: NoControl,
});
const DisplayName = Type.String({
  minLength: 2,
  maxLength: 40,
  pattern: NoControl,
});
const InviteToken = Type.String({ pattern: "^[a-f0-9]{64}$" });
const Uuid = Type.String({ format: "uuid" });
export const WorkspaceIdParams = Type.Object({ wid: Uuid });
export const InviteParams = Type.Object({ wid: Uuid, inviteId: Uuid });
export const MemberParams = Type.Object({ wid: Uuid, memberId: Uuid });
export const WorkspaceCreateSchema = Type.Object(
  { name: WorkspaceName, displayName: DisplayName },
  { additionalProperties: false },
);
export const WorkspaceRenameSchema = Type.Object(
  { name: WorkspaceName },
  { additionalProperties: false },
);
export const WorkspaceSchema = Type.Object({
  id: Text,
  name: Text,
  role: WorkspaceRoleSchema,
  memberCount: Units,
  createdAt: Text,
});
export const MemberSchema = Type.Object({
  id: Text,
  displayName: Text,
  role: WorkspaceRoleSchema,
  joinedAt: Text,
  you: Type.Boolean(),
});
export const WorkspaceDetailSchema = Type.Object({
  ...WorkspaceSchema.properties,
  members: Type.Array(MemberSchema),
});
export const InviteCreateSchema = Type.Object(
  {
    role: InviteRoleSchema,
    expiresInHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 720 })),
    maxUses: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  },
  { additionalProperties: false },
);
export const InviteSchema = Type.Object({
  id: Text,
  role: InviteRoleSchema,
  expiresAt: Text,
  maxUses: Units,
  uses: Units,
  revoked: Type.Boolean(),
});
export const CreatedInviteSchema = Type.Object({
  ...InviteSchema.properties,
  token: Text,
});
export const InvitePreviewSchema = Type.Object({
  workspaceName: Text,
  role: InviteRoleSchema,
  expiresAt: Text,
});
export const InviteTokenSchema = Type.Object(
  { token: InviteToken },
  { additionalProperties: false },
);
export const JoinSchema = Type.Object(
  { token: InviteToken, displayName: DisplayName },
  { additionalProperties: false },
);
export const RoleChangeSchema = Type.Object(
  { role: WorkspaceRoleSchema },
  { additionalProperties: false },
);

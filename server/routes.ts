import type { FastifyInstance, FastifyRequest } from "fastify";
import { Type } from "@sinclair/typebox";
import { timingSafeEqual } from "node:crypto";
import {
  completeOnboarding,
  deleteAccount,
  getAccount,
  setPlayground,
} from "./account.js";
import { Store, DomainError } from "./database.js";
import { validateDraft } from "./drafts.js";
import {
  DraftSchema,
  LaunchSchema,
  ProposalSchema,
  RulingSchema,
  ExecutionSchema,
  FillSchema,
  MarketSchema,
  PortfolioSchema,
  QuoteSchema,
  SavedDraftSchema,
  TradeInputSchema,
  CommentSchema,
  OrderInputSchema,
  OrderSchema,
  NoBodySchema,
  InboxSchema,
  BonusClaimSchema,
  CalibrationSchema,
  LeaderboardSchema,
} from "./schemas.js";
import { launchTarget, marketActor, orderActor } from "./workspaces.js";
import { registerWorkspaces } from "./workspace-routes.js";
import { inbox, markAllRead } from "./notifications.js";
import { accountCalibration, forecasterBoard } from "./calibration.js";
import { accountStats, bonusStatus, claimBonus } from "./engagement.js";
import type {
  Category,
  DraftInput,
  ResolutionOutcome,
  TradeInput,
} from "../shared/types.js";
import { dispute, propose, rule, settle } from "./resolution.js";
import { cancelOrder, listOrders, matchOrders, placeOrder } from "./orders.js";
import {
  addComment,
  listComments,
  setWatching,
  watchlist,
} from "./community.js";

export interface ApiOptions {
  /** How long a proposed outcome can be disputed before anyone may settle it. */
  disputeWindowMs: number;
  /** Secret for final rulings on disputed and house markets, read per request; unset disables them. */
  operatorToken?: () => string | undefined;
  /** Workspaces (Teams). Off where nobody else can reach this device. */
  teams: boolean;
  /** Origin for shareable links and embeds; null when only this device can open them. */
  shareOrigin: (request: FastifyRequest) => string | null;
}

/**
 * The versioned /api/v1 routes. The optional Node server and the on-device
 * engine (src/local) register these same handlers, so both behave alike.
 */
export function registerApi(
  app: FastifyInstance,
  store: Store,
  options: ApiOptions,
) {
  const { disputeWindowMs } = options;
  const accountId = (request: FastifyRequest) => {
    const authorization = request.headers.authorization;
    return store.account(
      authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined,
    ).id;
  };
  /** Account of an optional bearer token; public routes work without one. */
  const viewerId = (request: FastifyRequest) => {
    try {
      return accountId(request);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return undefined;
    }
  };
  const security = [{ bearerAuth: [] }];
  const idParams = Type.Object({
    id: Type.String({ minLength: 1, maxLength: 100 }),
  });

  app.get(
    "/api/v1/capabilities",
    {
      schema: {
        tags: ["Markets"],
        summary: "Deployment capabilities",
        response: {
          200: Type.Object({
            mode: Type.Literal("demo"),
            marketCount: Type.Integer(),
            version: Type.String(),
            shareOrigin: Type.Union([Type.String(), Type.Null()], {
              description:
                "Origin for shareable market links and embeds; null when only this device can open them.",
            }),
            teams: Type.Boolean({
              description: "Whether /workspaces routes exist.",
            }),
          }),
        },
      },
    },
    async (request) => ({
      mode: "demo" as const,
      marketCount: store.markets().length,
      version: "0.1.0",
      shareOrigin: options.shareOrigin(request),
      teams: options.teams,
    }),
  );

  app.post(
    "/api/v1/sessions",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["Accounts"],
        summary: "Create an isolated account with 5,000 practice credits",
        response: {
          201: Type.Object({
            token: Type.String(),
            expiresAt: Type.String(),
            balanceMicros: Type.Integer(),
          }),
        },
      },
    },
    async (_request, reply) => reply.code(201).send(store.createSession()),
  );

  const AccountSchema = Type.Object({
    displayName: Type.Union([Type.String(), Type.Null()]),
    termsVersion: Type.Union([Type.String(), Type.Null()]),
    termsAcceptedAt: Type.Union([Type.String(), Type.Null()]),
    playground: Type.Boolean(),
    realMoneyAvailable: Type.Boolean(),
    startingMicros: Type.Integer(),
  });
  app.get(
    "/api/v1/account",
    {
      schema: {
        tags: ["Accounts"],
        summary: "Own profile, consent and Playground mode",
        security,
        response: { 200: AccountSchema },
      },
    },
    async (request) => getAccount(store, accountId(request)),
  );
  app.put<{
    Body: { displayName: string; acceptTerms: boolean; confirmAdult: boolean };
  }>(
    "/api/v1/account",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["Accounts"],
        summary: "Finish onboarding: display name, age and terms consent",
        security,
        body: Type.Object(
          {
            displayName: Type.String({
              minLength: 2,
              maxLength: 40,
              pattern: "^[\\p{L}\\p{M} .'-]+$",
            }),
            acceptTerms: Type.Boolean(),
            confirmAdult: Type.Boolean(),
          },
          { additionalProperties: false },
        ),
        response: { 200: AccountSchema },
      },
    },
    async (request) =>
      completeOnboarding(store, accountId(request), request.body),
  );
  app.put<{ Body: { playground: boolean } }>(
    "/api/v1/account/mode",
    {
      schema: {
        tags: ["Accounts"],
        summary: "Switch Playground mode",
        description:
          "Playground mode trades practice credits. Turning it off returns 409 until real-money trading is licensed and enabled.",
        security,
        body: Type.Object(
          { playground: Type.Boolean() },
          { additionalProperties: false },
        ),
        response: { 200: AccountSchema },
      },
    },
    async (request) =>
      setPlayground(store, accountId(request), request.body.playground),
  );
  app.delete(
    "/api/v1/account",
    {
      schema: {
        tags: ["Accounts"],
        summary: "Delete own account",
        description:
          "Removes the profile, drafts, comments, watchlist and notifications, cancels open orders and revokes the token. Trades and ledger rows stay without a profile because market prices and payouts depend on them.",
        security,
        response: { 200: Type.Object({ deleted: Type.Literal(true) }) },
      },
    },
    async (request) => deleteAccount(store, accountId(request)),
  );

  app.get<{ Querystring: { search?: string; category?: string } }>(
    "/api/v1/markets",
    {
      schema: {
        tags: ["Markets"],
        summary: "Search illustrative markets",
        querystring: Type.Object({
          search: Type.Optional(Type.String({ maxLength: 200 })),
          category: Type.Optional(Type.String({ maxLength: 50 })),
        }),
        response: { 200: Type.Object({ items: Type.Array(MarketSchema) }) },
      },
    },
    async (request) => ({
      items: store.markets(request.query.search, request.query.category),
    }),
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/markets/:id",
    {
      schema: {
        tags: ["Markets"],
        summary: "Market probabilities and resolution rules",
        params: idParams,
        response: { 200: MarketSchema },
      },
    },
    async (request) => {
      marketActor(store, viewerId(request), request.params.id);
      return store.market(request.params.id);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/markets/:id/history",
    {
      schema: {
        tags: ["Markets"],
        summary: "Fixture baseline plus the last 99 observed demo trades",
        params: idParams,
        response: {
          200: Type.Object({
            items: Type.Array(
              Type.Object({ at: Type.String(), probability: Type.Number() }),
            ),
          }),
        },
      },
    },
    async (request) => {
      marketActor(store, viewerId(request), request.params.id);
      return { items: store.history(request.params.id) };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { outcome: ResolutionOutcome; evidenceUrl: string };
  }>(
    "/api/v1/markets/:id/resolution",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["Resolution"],
        summary: "Creator proposes the outcome of their market with evidence",
        description:
          "Halts trading and opens the challenge window. Only the account that launched the market may propose; house markets resolve by operator ruling.",
        security,
        params: idParams,
        body: ProposalSchema,
        response: { 201: MarketSchema },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          propose(
            store,
            marketActor(store, accountId(request), request.params.id),
            request.params.id,
            request.body.outcome,
            request.body.evidenceUrl,
            disputeWindowMs,
          ),
        ),
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/markets/:id/dispute",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["Resolution"],
        summary: "Dispute a proposed outcome by posting a 100-credit bond",
        description:
          "Allowed once per market, inside the challenge window, by anyone except the creator. The operator then rules: an overturned proposal returns the bond plus up to 100 credits from the creator; an upheld one awards the bond to the creator.",
        security,
        params: idParams,
        response: { 201: MarketSchema },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          dispute(
            store,
            marketActor(store, accountId(request), request.params.id),
            request.params.id,
          ),
        ),
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/markets/:id/settle",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["Resolution"],
        summary: "Finalize an undisputed proposal and pay every holder",
        description:
          "Any signed-in account may call this after the challenge window. Winning shares pay 1 credit, INVALID pays 0.5 credit per share, and the creator receives the liquidity the pool did not need.",
        security,
        params: idParams,
        response: { 200: MarketSchema },
      },
    },
    async (request) => {
      marketActor(store, accountId(request), request.params.id);
      return settle(store, request.params.id);
    },
  );

  app.post<{ Params: { id: string }; Body: { outcome: ResolutionOutcome } }>(
    "/api/v1/markets/:id/ruling",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["Resolution"],
        summary:
          "Operator ruling: final outcome for a disputed or house market",
        security: [{ operatorToken: [] }],
        headers: Type.Object({
          "x-operator-token": Type.String({ minLength: 16, maxLength: 256 }),
        }),
        params: idParams,
        body: RulingSchema,
        response: { 200: MarketSchema },
      },
    },
    async (request) => {
      const bytes = new TextEncoder();
      const configured = bytes.encode(options.operatorToken?.() ?? "");
      if (configured.length < 16 || configured.length > 256)
        throw new DomainError(
          "Operator rulings are not configured on this server.",
          503,
        );
      const supplied = bytes.encode(
        String(request.headers["x-operator-token"]),
      );
      if (
        supplied.length !== configured.length ||
        !timingSafeEqual(supplied, configured)
      )
        throw new DomainError("Operator token is invalid.", 403);
      // Private disputes stay inside their workspace; the operator never sees them.
      marketActor(store, undefined, request.params.id);
      return rule(store, request.params.id, request.body.outcome);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/markets/:id/trades",
    {
      schema: {
        tags: ["Markets"],
        summary: "Last 30 demo trades on a market, newest first",
        description:
          "Traders appear under a stable alias, never an account id.",
        params: idParams,
        response: {
          200: Type.Object({
            items: Type.Array(
              Type.Object({
                id: Type.String(),
                trader: Type.String(),
                outcome: Type.Union([Type.Literal("YES"), Type.Literal("NO")]),
                action: Type.Union([Type.Literal("buy"), Type.Literal("sell")]),
                shares: Type.Integer(),
                amountMicros: Type.Integer(),
                probabilityAfter: Type.Number(),
                createdAt: Type.String(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      marketActor(store, viewerId(request), request.params.id);
      return { items: store.marketTrades(request.params.id) };
    },
  );

  app.get(
    "/api/v1/leaderboard",
    {
      schema: {
        tags: ["Accounts"],
        summary:
          "Top traders by profit, creators by fees and forecasters by accuracy",
        description:
          "Public. forecasters ranks accounts with at least 3 markets resolved YES or NO by lowest Brier score. With a valid bearer token the viewer's own rows are flagged and always included.",
        response: { 200: LeaderboardSchema },
      },
    },
    async (request) => {
      const viewer = viewerId(request);
      return {
        ...store.leaderboard(viewer),
        forecasters: forecasterBoard(store, viewer),
      };
    },
  );

  app.post<{ Body: TradeInput }>(
    "/api/v1/quotes",
    {
      schema: {
        tags: ["Trading"],
        summary: "Get an executable demo AMM estimate; not a reservation",
        body: TradeInputSchema,
        response: { 200: QuoteSchema },
      },
    },
    async (request) => {
      marketActor(store, viewerId(request), request.body.marketId);
      return store.quote(request.body);
    },
  );

  app.post<{ Body: TradeInput & { limitMicros: number } }>(
    "/api/v1/trades",
    {
      schema: {
        tags: ["Trading"],
        summary: "Execute a demo buy or sell atomically",
        description:
          "BUY: limitMicros is maximum spend. SELL: limitMicros is minimum proceeds. Retry identical requests with the same Idempotency-Key; reuse for different input returns 409.",
        security,
        headers: Type.Object({
          "idempotency-key": Type.String({
            minLength: 8,
            maxLength: 128,
            pattern: "^[A-Za-z0-9_-]+$",
          }),
        }),
        body: ExecutionSchema,
        response: { 201: FillSchema },
      },
    },
    async (request, reply) => {
      const fill = store.trade(
        marketActor(store, accountId(request), request.body.marketId),
        request.body,
        request.headers["idempotency-key"] as string,
      );
      try {
        // This trade moved the price; resting limit orders may now fill.
        matchOrders(store, request.body.marketId);
      } catch (error) {
        // The caller's own trade is already committed and must be reported.
        request.log.error(error, "Limit order matching failed");
      }
      return reply.code(201).send(fill);
    },
  );

  app.post<{ Body: TradeInput & { limitPrice: number } }>(
    "/api/v1/orders",
    {
      schema: {
        tags: ["Trading"],
        summary: "Place a limit order that fills when the price reaches it",
        description:
          "BUY fills when the average price per share is at or below limitPrice; SELL when at or above. Fills are all-or-nothing against the AMM. Credits and shares are checked when the price arrives, not reserved; an order that cannot be covered then is cancelled with a note. At most 20 open orders per account.",
        security,
        body: OrderInputSchema,
        response: { 201: OrderSchema },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          placeOrder(
            store,
            marketActor(store, accountId(request), request.body.marketId),
            request.body,
          ),
        ),
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/orders/:id",
    {
      schema: {
        tags: ["Trading"],
        summary: "Cancel an own open limit order",
        security,
        params: idParams,
        response: { 200: Type.Object({ cancelled: Type.Literal(true) }) },
      },
    },
    async (request) => {
      cancelOrder(
        store,
        orderActor(store, accountId(request), request.params.id),
        request.params.id,
      );
      return { cancelled: true as const };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/markets/:id/comments",
    {
      schema: {
        tags: ["Markets"],
        summary: "Last 50 comments on a market, newest first",
        description:
          "Public. Commenters appear under an alias with the side they currently hold.",
        params: idParams,
        response: { 200: Type.Object({ items: Type.Array(CommentSchema) }) },
      },
    },
    async (request) => ({
      items: listComments(
        store,
        request.params.id,
        marketActor(store, viewerId(request), request.params.id),
      ),
    }),
  );

  app.post<{ Params: { id: string }; Body: { body: string } }>(
    "/api/v1/markets/:id/comments",
    {
      schema: {
        tags: ["Markets"],
        summary: "Comment on a market; one comment per 5 seconds per account",
        security,
        params: idParams,
        body: Type.Object(
          { body: Type.String({ minLength: 1, maxLength: 500 }) },
          { additionalProperties: false },
        ),
        response: { 201: CommentSchema },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          addComment(
            store,
            marketActor(store, accountId(request), request.params.id),
            request.params.id,
            request.body.body,
          ),
        ),
  );

  for (const method of ["PUT", "DELETE"] as const)
    app.route<{ Params: { id: string } }>({
      method,
      url: "/api/v1/watchlist/:id",
      schema: {
        tags: ["Accounts"],
        summary:
          method === "PUT"
            ? "Add a market to the own watchlist"
            : "Remove a market from the own watchlist",
        security,
        params: idParams,
        response: { 200: Type.Object({ watching: Type.Boolean() }) },
      },
      handler: async (request) => {
        const watching = method === "PUT";
        setWatching(
          store,
          marketActor(store, accountId(request), request.params.id),
          request.params.id,
          watching,
        );
        return { watching };
      },
    });

  app.get(
    "/api/v1/portfolio",
    {
      schema: {
        tags: ["Accounts"],
        summary: "Own balances, marked positions and last 100 trades",
        description:
          "Mark value is marginal price times shares, not guaranteed liquidation proceeds. P&L includes realized and unrealized changes.",
        security,
        response: { 200: PortfolioSchema },
      },
    },
    async (request) => {
      const id = accountId(request);
      return {
        ...store.portfolio(id),
        orders: listOrders(store, id),
        watchlist: watchlist(store, id),
        bonus: bonusStatus(store, id),
        stats: accountStats(store, id),
      };
    },
  );

  app.get(
    "/api/v1/portfolio/calibration",
    {
      schema: {
        tags: ["Accounts"],
        summary: "Own forecast accuracy: Brier score, skill and calibration",
        description:
          "Counts own trades in markets resolved YES or NO. Per market, the forecast is the size-weighted mean YES probability the trades left; brier is the mean of (forecast − outcome)² over markets, null until one resolves. skill is the same score for the prices just before those trades minus brier; positive means the account improved on the market. buckets holds ten 0.1-wide forecast buckets for a reliability diagram.",
        security,
        response: { 200: CalibrationSchema },
      },
    },
    async (request) => accountCalibration(store, accountId(request)),
  );

  app.get(
    "/api/v1/notifications",
    {
      schema: {
        tags: ["Accounts"],
        summary:
          "Own last 50 notifications, newest first, and the unread count",
        security,
        response: { 200: InboxSchema },
      },
    },
    async (request) => inbox(store, accountId(request)),
  );

  app.post(
    "/api/v1/notifications/read",
    {
      schema: {
        tags: ["Accounts"],
        summary: "Mark every own notification read",
        security,
        body: NoBodySchema,
        response: { 200: Type.Object({ unread: Type.Literal(0) }) },
      },
    },
    async (request) => markAllRead(store, accountId(request)),
  );

  app.post(
    "/api/v1/bonus/claim",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["Accounts"],
        summary: "Claim the daily demo-credit bonus",
        description:
          "Once per UTC day: 50 credits plus 10 per consecutive previous day claimed, capped at 100. A second claim on the same UTC day returns 409.",
        security,
        body: NoBodySchema,
        response: { 200: BonusClaimSchema },
      },
    },
    async (request) => claimBonus(store, accountId(request)),
  );

  app.get(
    "/api/v1/drafts",
    {
      schema: {
        tags: ["Drafts"],
        summary: "Own last 50 private drafts",
        security,
        response: { 200: Type.Object({ items: Type.Array(SavedDraftSchema) }) },
      },
    },
    async (request) => ({ items: store.drafts(accountId(request)) }),
  );

  app.post<{ Body: DraftInput }>(
    "/api/v1/drafts",
    {
      schema: {
        tags: ["Drafts"],
        summary: "Save a manual draft without publishing a market",
        security,
        body: DraftSchema,
        response: { 201: SavedDraftSchema },
      },
    },
    async (request, reply) => {
      const id = accountId(request);
      validateDraft(request.body);
      return reply
        .code(201)
        .send(
          store.saveDraft(id, request.body, "manual", [
            "Human review required. Source content has not been fetched or verified.",
            "Private until you launch it as a market; launching stakes 500 demo credits.",
          ]),
        );
    },
  );

  app.post<{
    Params: { id: string };
    Body: { category: Category; workspaceId?: string };
  }>(
    "/api/v1/drafts/:id/launch",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["Drafts"],
        summary: "Launch your draft as a live market and earn its trading fees",
        description:
          "Stakes 500 demo credits as the market's liquidity (its worst-case loss), opens trading at 50% and consumes the draft. Every later trade pays the creator a 1% fee.",
        security,
        params: idParams,
        body: LaunchSchema,
        response: { 201: MarketSchema },
      },
    },
    async (request, reply) => {
      const id = accountId(request);
      const { workspaceId } = request.body;
      return reply
        .code(201)
        .send(
          store.launchDraft(
            id,
            request.params.id,
            request.body.category,
            workspaceId ? launchTarget(store, id, workspaceId) : undefined,
          ),
        );
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/drafts/:id",
    {
      schema: {
        tags: ["Drafts"],
        summary: "Delete one of your own private drafts",
        security,
        params: idParams,
        response: { 200: Type.Object({ deleted: Type.Literal(true) }) },
      },
    },
    async (request) => {
      store.deleteDraft(accountId(request), request.params.id);
      return { deleted: true as const };
    },
  );
  if (options.teams) registerWorkspaces(app, store, accountId);
}

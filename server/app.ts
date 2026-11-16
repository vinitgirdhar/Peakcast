import { saveProvider } from "./provider-settings.js";
import Fastify, { type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyStatic from "@fastify/static";
import { Type } from "@sinclair/typebox";
import { timingSafeEqual } from "node:crypto";
import { existsSync, createReadStream } from "node:fs";
import { resolve } from "node:path";
import { Store, DomainError } from "./database.js";
import {
  generateDraft,
  validateDraft,
  getAIProviders,
  getDefaultAIProvider,
  hasAIAccess,
} from "./ai.js";
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
  ErrorSchema,
  AIProviderSchema,
  CommentSchema,
  OrderInputSchema,
  OrderSchema,
  NoBodySchema,
  InboxSchema,
  BonusClaimSchema,
} from "./schemas.js";
import { inbox, markAllRead } from "./notifications.js";
import { accountStats, bonusStatus, claimBonus } from "./engagement.js";
import type {
  AIProvider,
  Category,
  DraftInput,
  ResolutionOutcome,
  TradeInput,
} from "../shared/types.js";
import { dispute, propose, rule, settle, settleDue } from "./resolution.js";
import { cancelOrder, listOrders, matchOrders, placeOrder } from "./orders.js";
import {
  addComment,
  listComments,
  setWatching,
  watchlist,
} from "./community.js";

interface AppOptions {
  databasePath?: string;
  staticRoot?: string;
  logger?: boolean;
  rateLimiting?: boolean;
  publicOrigin?: string;
  managedAI?: boolean;
  /** How long a proposed outcome can be disputed before anyone may settle it. */
  disputeWindowMs?: number;
  /** How often undisputed proposals past their window are paid out; 0 disables. */
  autoSettleMs?: number;
  draftGenerator?: (
    input: DraftInput,
    provider: AIProvider,
  ) => Promise<DraftInput>;
}

export async function buildApp(options: AppOptions = {}) {
  const publicUrl = options.publicOrigin
    ? new URL(options.publicOrigin)
    : undefined;
  if (
    publicUrl &&
    (publicUrl.protocol !== "https:" ||
      publicUrl.origin !== options.publicOrigin)
  )
    throw new Error(
      "PUBLIC_ORIGIN must be an exact HTTPS origin without a path.",
    );
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16_384,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const store = new Store(
    options.databasePath ??
      process.env.DATABASE_PATH ??
      "./data/wildcatter.sqlite",
  );
  const windowSeconds = Number(process.env.DISPUTE_WINDOW_SECONDS ?? 120);
  const disputeWindowMs =
    options.disputeWindowMs ??
    (Number.isFinite(windowSeconds) && windowSeconds >= 0
      ? windowSeconds
      : 120) * 1000;
  const autoSettleMs = options.autoSettleMs ?? 15_000;
  // Payouts must not depend on someone pressing "Finalize".
  const sweep =
    autoSettleMs > 0
      ? setInterval(() => {
          try {
            settleDue(store);
          } catch (error) {
            app.log.error(error, "Automatic settlement failed");
          }
        }, autoSettleMs)
      : undefined;
  sweep?.unref();
  app.addHook("onClose", async () => {
    clearInterval(sweep);
    store.close();
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  if (options.rateLimiting !== false)
    await app.register(rateLimit, {
      max: 300,
      timeWindow: "1 minute",
      allowList: (request) => !request.url.startsWith("/api/"),
    });
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/v1/") || route.schema?.hide) return;
    const codes = [400, 403, 413, 429, 500];
    if (route.schema?.security?.length) codes.push(401);
    if (
      /\/markets\/|\/quotes$|\/trades$|\/orders|\/watchlist\//.test(route.url)
    )
      codes.push(404, 409);
    if (route.url.endsWith("/drafts/:id")) codes.push(404);
    if (route.url.endsWith("/launch")) codes.push(404, 409);
    if (route.url.endsWith("/bonus/claim")) codes.push(409);
    if (route.url.endsWith("/ruling")) codes.push(503);
    if (route.url.endsWith("/drafts/generate")) codes.push(502, 503);
    const responses = route.schema?.response;
    route.schema = {
      ...route.schema,
      response: {
        ...Object.fromEntries(codes.map((code) => [code, ErrorSchema])),
        ...(typeof responses === "object" && responses !== null
          ? responses
          : {}),
      },
    };
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Wildcatter API",
        version: "0.1.0",
        description:
          "Demo-credit prediction markets. Amounts are integer microcredits (1 credit = 1,000,000). Create a session for a 30-day bearer credential. Public data requires no token. No real funds, on-chain settlement or production identity.",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "Demo session token returned by POST /api/v1/sessions",
          },
          aiAccessToken: {
            type: "apiKey",
            in: "header",
            name: "X-AI-Access-Token",
            description:
              "Additional access secret required only for paid AI refinement.",
          },
          operatorToken: {
            type: "apiKey",
            in: "header",
            name: "X-Operator-Token",
            description:
              "Server operator secret (OPERATOR_TOKEN) for final market rulings.",
          },
        },
      },
      tags: [
        { name: "Markets" },
        { name: "Trading" },
        { name: "Accounts" },
        { name: "Drafts" },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/api-docs",
    uiConfig: { persistAuthorization: false },
  });

  app.addHook("onRequest", async (request, reply) => {
    // shortcut: one opt-in HTTPS preview origin; review deployment controls before production hosting.
    const host = request.headers.host?.split(":")[0];
    const publicHost = publicUrl && request.headers.host === publicUrl.host;
    if (host && !["127.0.0.1", "localhost"].includes(host) && !publicHost)
      throw new DomainError("This host is not enabled for the demo.", 403);
    const origin = request.headers.origin;
    if (
      origin &&
      (publicHost
        ? origin !== publicUrl.origin
        : origin !== `http://${request.headers.host}` &&
          origin !== `https://${request.headers.host}`)
    )
      throw new DomainError(
        "Cross-origin access is not enabled for this local demo.",
        403,
      );
    if (request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number; validation?: unknown };
    const status = err.validation ? 400 : (err.statusCode ?? 500);
    if (status >= 500 && !(error instanceof DomainError))
      request.log.error({ error: err.name }, "Request failed");
    reply.code(status).send({
      message: err.validation
        ? "Invalid request. Check field types, ranges and required values."
        : status >= 500 && !(error instanceof DomainError)
          ? "The server could not complete this request."
          : err.message,
    });
  });

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

  const authorizeSettings = (request: FastifyRequest) => {
    accountId(request);
    const supplied = Buffer.from(
      String(request.headers["x-ai-access-token"] ?? ""),
    );
    const expected = Buffer.from(process.env.AI_ACCESS_TOKEN ?? "");
    if (
      !hasAIAccess() ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new DomainError(
        "Enter the workspace AI access token to manage providers.",
        403,
      );
  };
  app.put<{
    Params: { provider: AIProvider };
    Body: { model: string; apiKey?: string };
  }>(
    "/api/v1/settings/providers/:provider",
    {
      schema: {
        params: Type.Object({ provider: AIProviderSchema }),
        body: Type.Object(
          {
            model: Type.String({
              minLength: 1,
              maxLength: 120,
              pattern: "^[a-zA-Z0-9_.:/-]+$",
            }),
            apiKey: Type.Optional(
              Type.String({
                minLength: 8,
                maxLength: 1024,
                pattern: "^[A-Za-z0-9_./+=-]+$",
              }),
            ),
          },
          { additionalProperties: false },
        ),
        security: [{ bearerAuth: [], aiAccessToken: [] }],
      },
    },
    async (request) => {
      authorizeSettings(request);
      saveProvider(request.params.provider, request.body);
      return { items: getAIProviders() };
    },
  );
  app.delete<{ Params: { provider: AIProvider } }>(
    "/api/v1/settings/providers/:provider",
    {
      schema: {
        params: Type.Object({ provider: AIProviderSchema }),
        security: [{ bearerAuth: [], aiAccessToken: [] }],
      },
    },
    async (request) => {
      authorizeSettings(request);
      saveProvider(request.params.provider, { model: "" }, true);
      return { items: getAIProviders() };
    },
  );
  app.get("/api/v1/settings/ollama", async (request) => {
    authorizeSettings(request);
    try {
      const response = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { models?: { name: string }[] };
      return {
        available: true,
        models: (body.models ?? []).map((model) => model.name),
      };
    } catch {
      return { available: false, models: [] };
    }
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
            aiConfigured: Type.Boolean(),
            aiAccessManaged: Type.Boolean(),
            aiProviders: Type.Array(
              Type.Object({
                id: AIProviderSchema,
                label: Type.String(),
                model: Type.String(),
                configured: Type.Boolean(),
              }),
            ),
            defaultAIProvider: Type.Union([AIProviderSchema, Type.Null()]),
            marketCount: Type.Integer(),
            version: Type.String(),
          }),
        },
      },
    },
    async () => ({
      mode: "demo" as const,
      aiAccessManaged: options.managedAI ?? false,
      aiConfigured: Boolean(hasAIAccess() && getDefaultAIProvider()),
      aiProviders: getAIProviders(),
      defaultAIProvider: getDefaultAIProvider() ?? null,
      marketCount: store.markets().length,
      version: "0.1.0",
    }),
  );

  app.post(
    "/api/v1/sessions",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["Accounts"],
        summary: "Create an isolated demo account with 10,000 credits",
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
    async (request) => store.market(request.params.id),
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
    async (request) => ({ items: store.history(request.params.id) }),
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
            accountId(request),
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
        .send(dispute(store, accountId(request), request.params.id)),
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
      accountId(request);
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
      const configured = Buffer.from(process.env.OPERATOR_TOKEN ?? "");
      if (configured.length < 16 || configured.length > 256)
        throw new DomainError(
          "Operator rulings are not configured on this server.",
          503,
        );
      const supplied = Buffer.from(String(request.headers["x-operator-token"]));
      if (
        supplied.length !== configured.length ||
        !timingSafeEqual(supplied, configured)
      )
        throw new DomainError("Operator token is invalid.", 403);
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
    async (request) => ({ items: store.marketTrades(request.params.id) }),
  );

  app.get(
    "/api/v1/leaderboard",
    {
      schema: {
        tags: ["Accounts"],
        summary: "Top traders by profit and top creators by fees earned",
        description:
          "Public. With a valid bearer token the viewer's own rows are flagged and always included.",
        response: {
          200: Type.Object({
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
          }),
        },
      },
    },
    async (request) => store.leaderboard(viewerId(request)),
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
    async (request) => store.quote(request.body),
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
        accountId(request),
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
      reply.code(201).send(placeOrder(store, accountId(request), request.body)),
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
      cancelOrder(store, accountId(request), request.params.id);
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
      items: listComments(store, request.params.id, viewerId(request)),
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
            accountId(request),
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
        setWatching(store, accountId(request), request.params.id, watching);
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

  app.post<{ Params: { id: string }; Body: { category: Category } }>(
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
    async (request, reply) =>
      reply
        .code(201)
        .send(
          store.launchDraft(
            accountId(request),
            request.params.id,
            request.body.category,
          ),
        ),
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

  app.post<{ Body: DraftInput; Querystring: { provider?: AIProvider } }>(
    "/api/v1/drafts/generate",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
      schema: {
        tags: ["Drafts"],
        summary: "Refine and save a private draft with configured AI",
        description:
          "Select gemini, groq or openai with the provider query parameter; omission uses the configured default. Requires that provider's server API key and matching X-AI-Access-Token. One provider per request; no automatic fallback. May incur charges. No browsing or source verification.",
        querystring: Type.Object(
          { provider: Type.Optional(AIProviderSchema) },
          { additionalProperties: false },
        ),
        security: [{ bearerAuth: [], aiAccessToken: [] }],
        headers: Type.Object({
          "x-ai-access-token": Type.String({ minLength: 16, maxLength: 256 }),
        }),
        body: DraftSchema,
        response: { 201: SavedDraftSchema },
      },
    },
    async (request, reply) => {
      const id = accountId(request);
      const configured = process.env.AI_ACCESS_TOKEN;
      const provider =
        request.query.provider ?? getDefaultAIProvider() ?? "openai";
      if (
        !hasAIAccess() ||
        !configured ||
        (!options.draftGenerator &&
          !getAIProviders().some(
            (item) => item.id === provider && item.configured,
          ))
      )
        throw new DomainError(
          "AI is not configured. Save a manual draft instead.",
          503,
        );
      const supplied = Buffer.from(
        request.headers["x-ai-access-token"] as string,
      );
      const expected = Buffer.from(configured);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        throw new DomainError("AI access token is invalid.", 403);
      validateDraft(request.body);
      const generated = await (options.draftGenerator ?? generateDraft)(
        request.body,
        provider,
      );
      validateDraft(generated);
      return reply
        .code(201)
        .send(
          store.saveDraft(id, generated, provider, [
            "AI-assisted draft; primary source was not fetched or verified.",
            "Human review required before publication. No settlement authority.",
          ]),
        );
    },
  );

  app.get<{ Params: { name: string } }>(
    "/downloads/:name",
    { schema: { hide: true } },
    async (request, reply) => {
      const name = request.params.name;
      if (!["Wildcatter-Windows.zip", "Wildcatter-Android.apk"].includes(name))
        throw new DomainError("Download not found.", 404);
      const path = resolve("release/downloads", name);
      // Hosted demos do not ship the 170 MB build; they point at the release asset.
      const hosted = name.endsWith(".zip")
        ? process.env.WINDOWS_DOWNLOAD_URL
        : process.env.ANDROID_DOWNLOAD_URL;
      if (!existsSync(path) && hosted?.startsWith("https://"))
        return reply.redirect(hosted);
      if (!existsSync(path))
        throw new DomainError("This app build is not available yet.", 404);
      reply.header("Content-Disposition", `attachment; filename="${name}"`);
      reply.type(
        name.endsWith(".apk")
          ? "application/vnd.android.package-archive"
          : "application/zip",
      );
      return reply.send(createReadStream(path));
    },
  );
  app.get("/api/v1/openapi.json", { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  const staticRoot = options.staticRoot ?? resolve("dist");
  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      wildcard: false,
      setHeaders(reply, path) {
        // The separate static launcher checks this public image without API access.
        if (path === resolve(staticRoot, "icon-192.png"))
          reply.header("Cross-Origin-Resource-Policy", "cross-origin");
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === "GET" &&
        !request.url.startsWith("/api") &&
        !request.url.split("?")[0].split("/").at(-1)?.includes(".")
      )
        return reply.sendFile("index.html");
      return reply.code(404).send({ message: "Route not found." });
    });
  }
  return app;
}

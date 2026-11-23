import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Store } from "./database.js";
import {
  CreatedInviteSchema,
  InviteCreateSchema,
  InviteParams,
  InvitePreviewSchema,
  InviteSchema,
  InviteTokenSchema,
  JoinSchema,
  LeaderboardSchema,
  MarketSchema,
  MemberParams,
  MemberSchema,
  PortfolioSchema,
  RoleChangeSchema,
  RulingSchema,
  WorkspaceCreateSchema,
  WorkspaceDetailSchema,
  WorkspaceIdParams,
  WorkspaceRenameSchema,
  WorkspaceSchema,
} from "./schemas.js";
import {
  createInvite,
  createWorkspace,
  joinWorkspace,
  listInvites,
  listWorkspaces,
  memberRuling,
  previewInvite,
  removeMember,
  renameWorkspace,
  revokeInvite,
  setMemberRole,
  walletPortfolio,
  workspaceDetail,
  workspaceLeaderboard,
  workspaceMarkets,
} from "./workspaces.js";

type Wid = Static<typeof WorkspaceIdParams>;
const security = [{ bearerAuth: [] }];
const tags = ["Workspaces"];
const perMinute = (max: number) => ({
  rateLimit: { max, timeWindow: "1 minute" },
});

/**
 * Teams routes. Every one needs a bearer token; a workspace the caller is not
 * an active member of answers 404, exactly like an unknown id. The Windows
 * app does not register them (`buildApp({ teams: false })`).
 */
export function registerWorkspaces(
  app: FastifyInstance,
  store: Store,
  personId: (request: FastifyRequest) => string,
): void {
  app.post<{ Body: Static<typeof WorkspaceCreateSchema> }>(
    "/api/v1/workspaces",
    {
      config: perMinute(10),
      schema: {
        tags,
        summary: "Create a workspace; you become its owner",
        description:
          "Your membership gets a separate wallet with 10,000 workspace credits; your own balance is untouched. Names are trimmed. 409 when you already own 5 workspaces.",
        security,
        body: WorkspaceCreateSchema,
        response: { 201: WorkspaceSchema },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          createWorkspace(
            store,
            personId(request),
            request.body.name,
            request.body.displayName,
          ),
        ),
  );

  app.get(
    "/api/v1/workspaces",
    {
      schema: {
        tags,
        summary: "Workspaces you are an active member of",
        security,
        response: { 200: Type.Object({ items: Type.Array(WorkspaceSchema) }) },
      },
    },
    async (request) => ({ items: listWorkspaces(store, personId(request)) }),
  );

  app.get<{ Params: Wid }>(
    "/api/v1/workspaces/:wid",
    {
      schema: {
        tags,
        summary: "A workspace and its active members",
        security,
        params: WorkspaceIdParams,
        response: { 200: WorkspaceDetailSchema },
      },
    },
    async (request) =>
      workspaceDetail(store, personId(request), request.params.wid),
  );

  app.patch<{ Params: Wid; Body: Static<typeof WorkspaceRenameSchema> }>(
    "/api/v1/workspaces/:wid",
    {
      schema: {
        tags,
        summary: "Rename a workspace (owner only)",
        security,
        params: WorkspaceIdParams,
        body: WorkspaceRenameSchema,
        response: { 200: WorkspaceSchema },
      },
    },
    async (request) =>
      renameWorkspace(
        store,
        personId(request),
        request.params.wid,
        request.body.name,
      ),
  );

  app.post<{ Params: Wid; Body: Static<typeof InviteCreateSchema> }>(
    "/api/v1/workspaces/:wid/invites",
    {
      config: perMinute(10),
      schema: {
        tags,
        summary: "Create an invite link (owner or admin)",
        description:
          "Returns the token once; only its hash is stored. Share it as /join#<token> so it never reaches request logs. expiresInHours defaults to 168, maxUses to 25. 409 at 20 usable invites.",
        security,
        params: WorkspaceIdParams,
        body: InviteCreateSchema,
        response: { 201: CreatedInviteSchema },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          createInvite(
            store,
            personId(request),
            request.params.wid,
            request.body,
          ),
        ),
  );

  app.get<{ Params: Wid }>(
    "/api/v1/workspaces/:wid/invites",
    {
      schema: {
        tags,
        summary: "The 50 newest invites, without tokens (owner or admin)",
        security,
        params: WorkspaceIdParams,
        response: { 200: Type.Object({ items: Type.Array(InviteSchema) }) },
      },
    },
    async (request) => ({
      items: listInvites(store, personId(request), request.params.wid),
    }),
  );

  app.delete<{ Params: Static<typeof InviteParams> }>(
    "/api/v1/workspaces/:wid/invites/:inviteId",
    {
      schema: {
        tags,
        summary: "Revoke an invite (owner or admin); idempotent",
        security,
        params: InviteParams,
        response: { 200: Type.Object({ revoked: Type.Literal(true) }) },
      },
    },
    async (request) => {
      revokeInvite(
        store,
        personId(request),
        request.params.wid,
        request.params.inviteId,
      );
      return { revoked: true as const };
    },
  );

  app.post<{ Body: Static<typeof InviteTokenSchema> }>(
    "/api/v1/workspaces/invites/preview",
    {
      config: perMinute(20),
      schema: {
        tags,
        summary: "What an invite token joins",
        description:
          "Unknown, expired, revoked and used-up invites all return the same 404.",
        security,
        body: InviteTokenSchema,
        response: { 200: InvitePreviewSchema },
      },
    },
    async (request) => {
      personId(request);
      return previewInvite(store, request.body.token);
    },
  );

  app.post<{ Body: Static<typeof JoinSchema> }>(
    "/api/v1/workspaces/join",
    {
      config: perMinute(10),
      schema: {
        tags,
        summary: "Join a workspace with an invite token",
        description:
          "Uses one invite use and creates your wallet with 10,000 workspace credits; a removed member gets their old wallet back. 404 as for preview; 409 when the display name is taken (case-insensitive), you are already a member or the workspace has 200 members.",
        security,
        body: JoinSchema,
        response: { 201: WorkspaceSchema },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          joinWorkspace(
            store,
            personId(request),
            request.body.token,
            request.body.displayName,
          ),
        ),
  );

  app.patch<{
    Params: Static<typeof MemberParams>;
    Body: Static<typeof RoleChangeSchema>;
  }>(
    "/api/v1/workspaces/:wid/members/:memberId",
    {
      schema: {
        tags,
        summary: "Change a member's role",
        description:
          "The owner may set any other member's role; setting role owner transfers ownership and makes the old owner an admin. Admins may move others between member and resolver. Nobody changes their own role (403).",
        security,
        params: MemberParams,
        body: RoleChangeSchema,
        response: { 200: MemberSchema },
      },
    },
    async (request) =>
      setMemberRole(
        store,
        personId(request),
        request.params.wid,
        request.params.memberId,
        request.body.role,
      ),
  );

  app.delete<{ Params: Static<typeof MemberParams> }>(
    "/api/v1/workspaces/:wid/members/:memberId",
    {
      schema: {
        tags,
        summary: "Remove a member, or leave with your own member id",
        description:
          "The owner removes anyone else; admins remove members and resolvers; anyone but the owner may leave (the owner gets 409). Open orders are cancelled; positions stay and are paid at resolution.",
        security,
        params: MemberParams,
        response: { 200: Type.Object({ removed: Type.Literal(true) }) },
      },
    },
    async (request) => {
      removeMember(
        store,
        personId(request),
        request.params.wid,
        request.params.memberId,
      );
      return { removed: true as const };
    },
  );

  app.get<{ Params: Wid; Querystring: { search?: string; category?: string } }>(
    "/api/v1/workspaces/:wid/markets",
    {
      schema: {
        tags,
        summary: "The workspace's private markets",
        security,
        params: WorkspaceIdParams,
        querystring: Type.Object({
          search: Type.Optional(Type.String({ maxLength: 200 })),
          category: Type.Optional(Type.String({ maxLength: 50 })),
        }),
        response: { 200: Type.Object({ items: Type.Array(MarketSchema) }) },
      },
    },
    async (request) => ({
      items: workspaceMarkets(
        store,
        personId(request),
        request.params.wid,
        request.query.search,
        request.query.category,
      ),
    }),
  );

  app.get<{ Params: Wid }>(
    "/api/v1/workspaces/:wid/portfolio",
    {
      schema: {
        tags,
        summary: "Your workspace wallet: balance, positions, orders and ledger",
        description:
          "Same shape as GET /portfolio. There is no daily bonus in a workspace, so bonus.available is always false.",
        security,
        params: WorkspaceIdParams,
        response: { 200: PortfolioSchema },
      },
    },
    async (request) =>
      walletPortfolio(store, personId(request), request.params.wid),
  );

  app.get<{ Params: Wid }>(
    "/api/v1/workspaces/:wid/leaderboard",
    {
      schema: {
        tags,
        summary: "The workspace's traders, creators and forecasters",
        description:
          "Same shape as GET /leaderboard, ranked over this workspace's wallets and markets only. Members appear by display name.",
        security,
        params: WorkspaceIdParams,
        response: { 200: LeaderboardSchema },
      },
    },
    async (request) =>
      workspaceLeaderboard(store, personId(request), request.params.wid),
  );

  app.post<{
    Params: Wid & { id: string };
    Body: Static<typeof RulingSchema>;
  }>(
    "/api/v1/workspaces/:wid/markets/:id/ruling",
    {
      config: perMinute(10),
      schema: {
        tags,
        summary: "Rule a disputed or unproposed closed market (resolver+)",
        description:
          "Owners, admins and resolvers only (403 for members). 409 when the ruler created, disputed or holds shares in the market, or when it is not disputed or closed without a proposal. Pays out exactly like an operator ruling.",
        security,
        params: Type.Object({
          ...WorkspaceIdParams.properties,
          id: Type.String({ minLength: 1, maxLength: 100 }),
        }),
        body: RulingSchema,
        response: { 200: MarketSchema },
      },
    },
    async (request) =>
      memberRuling(
        store,
        personId(request),
        request.params.wid,
        request.params.id,
        request.body.outcome,
      ),
  );
}

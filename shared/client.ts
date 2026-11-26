import type {
  Account,
  BonusClaim,
  Calibration,
  Capabilities,
  Category,
  CreatedInvite,
  Draft,
  DraftInput,
  HistoryPoint,
  Inbox,
  InviteInput,
  InvitePreview,
  Leaderboard,
  LimitOrder,
  Market,
  MarketComment,
  MarketTrade,
  OEmbed,
  Portfolio,
  Quote,
  ResolutionOutcome,
  Trade,
  TradeInput,
  Workspace,
  WorkspaceDetail,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** The web client and third-party builders use this same versioned API. */
export class PeakcastClient {
  constructor(
    private baseUrl = "",
    private token?: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...init?.headers,
      },
    });
    let body: T & { message?: string };
    try {
      body = await response.json();
    } catch {
      throw new ApiError(
        "The API returned an unreadable response. Check the server connection and try again.",
        response.ok ? 502 : response.status,
      );
    }
    if (!response.ok)
      throw new ApiError(
        body.message || "Request failed. Please try again.",
        response.status,
      );
    return body;
  }

  createSession() {
    return this.request<{
      token: string;
      expiresAt: string;
      balanceMicros: number;
    }>("/sessions", { method: "POST" });
  }
  account() {
    return this.request<Account>("/account");
  }
  completeOnboarding(input: {
    displayName: string;
    acceptTerms: boolean;
    confirmAdult: boolean;
  }) {
    return this.request<Account>("/account", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }
  setPlayground(playground: boolean) {
    return this.request<Account>("/account/mode", {
      method: "PUT",
      body: JSON.stringify({ playground }),
    });
  }
  deleteAccount() {
    return this.request<{ deleted: true }>("/account", { method: "DELETE" });
  }
  capabilities() {
    return this.request<Capabilities>("/capabilities");
  }
  markets(search = "", category = "") {
    const query = new URLSearchParams({ search, category });
    return this.request<{ items: Market[] }>(`/markets?${query}`);
  }
  market(id: string) {
    return this.request<Market>(`/markets/${encodeURIComponent(id)}`);
  }
  history(id: string) {
    return this.request<{ items: HistoryPoint[] }>(
      `/markets/${encodeURIComponent(id)}/history`,
    );
  }
  /** Embed snippet for a market link on this server (oEmbed 1.0, JSON). */
  oembed(url: string, maxwidth?: number, maxheight?: number) {
    const query = new URLSearchParams({ url });
    if (maxwidth) query.set("maxwidth", String(maxwidth));
    if (maxheight) query.set("maxheight", String(maxheight));
    return this.request<OEmbed>(`/oembed?${query}`);
  }
  quote(input: TradeInput) {
    return this.request<Quote>("/quotes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  trade(input: TradeInput & { limitMicros: number }, idempotencyKey: string) {
    return this.request<Trade>("/trades", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    });
  }
  portfolio() {
    return this.request<Portfolio>("/portfolio");
  }
  calibration() {
    return this.request<Calibration>("/portfolio/calibration");
  }
  notifications() {
    return this.request<Inbox>("/notifications");
  }
  markNotificationsRead() {
    return this.request<{ unread: 0 }>("/notifications/read", {
      method: "POST",
    });
  }
  /** Rejects with ApiError status 409 when today's bonus is already claimed. */
  claimBonus() {
    return this.request<BonusClaim>("/bonus/claim", { method: "POST" });
  }
  drafts() {
    return this.request<{ items: Draft[] }>("/drafts");
  }
  saveDraft(input: DraftInput) {
    return this.request<Draft>("/drafts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  deleteDraft(id: string) {
    return this.request<{ deleted: true }>(
      `/drafts/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }
  marketTrades(id: string) {
    return this.request<{ items: MarketTrade[] }>(
      `/markets/${encodeURIComponent(id)}/trades`,
    );
  }
  leaderboard() {
    return this.request<Leaderboard>("/leaderboard");
  }
  placeOrder(input: TradeInput & { limitPrice: number }) {
    return this.request<LimitOrder>("/orders", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  cancelOrder(id: string) {
    return this.request<{ cancelled: true }>(
      `/orders/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }
  comments(marketId: string) {
    return this.request<{ items: MarketComment[] }>(
      `/markets/${encodeURIComponent(marketId)}/comments`,
    );
  }
  addComment(marketId: string, body: string) {
    return this.request<MarketComment>(
      `/markets/${encodeURIComponent(marketId)}/comments`,
      { method: "POST", body: JSON.stringify({ body }) },
    );
  }
  setWatching(marketId: string, watching: boolean) {
    return this.request<{ watching: boolean }>(
      `/watchlist/${encodeURIComponent(marketId)}`,
      { method: watching ? "PUT" : "DELETE" },
    );
  }
  proposeResolution(
    id: string,
    outcome: ResolutionOutcome,
    evidenceUrl: string,
  ) {
    return this.request<Market>(
      `/markets/${encodeURIComponent(id)}/resolution`,
      { method: "POST", body: JSON.stringify({ outcome, evidenceUrl }) },
    );
  }
  disputeResolution(id: string) {
    return this.request<Market>(`/markets/${encodeURIComponent(id)}/dispute`, {
      method: "POST",
    });
  }
  settleMarket(id: string) {
    return this.request<Market>(`/markets/${encodeURIComponent(id)}/settle`, {
      method: "POST",
    });
  }
  ruleMarket(id: string, outcome: ResolutionOutcome, operatorToken: string) {
    return this.request<Market>(`/markets/${encodeURIComponent(id)}/ruling`, {
      method: "POST",
      headers: { "X-Operator-Token": operatorToken },
      body: JSON.stringify({ outcome }),
    });
  }
  /** With a workspaceId the market is private to that workspace and the member's wallet stakes. */
  launchDraft(id: string, category: Category, workspaceId?: string) {
    return this.request<Market>(`/drafts/${encodeURIComponent(id)}/launch`, {
      method: "POST",
      body: JSON.stringify({ category, ...(workspaceId && { workspaceId }) }),
    });
  }
  // Teams. Every call needs a bearer token; a workspace the caller is not an
  // active member of answers 404, exactly like an unknown id.
  private workspacePath(id: string, rest = "") {
    return `/workspaces/${encodeURIComponent(id)}${rest}`;
  }
  private send<T>(method: string, path: string, body?: object) {
    return this.request<T>(path, {
      method,
      ...(body && { body: JSON.stringify(body) }),
    });
  }
  workspaces() {
    return this.request<{ items: Workspace[] }>("/workspaces");
  }
  /** Rejects with 409 when the caller already owns 5 workspaces. */
  createWorkspace(name: string, displayName: string) {
    return this.send<Workspace>("POST", "/workspaces", { name, displayName });
  }
  workspace(id: string) {
    return this.request<WorkspaceDetail>(this.workspacePath(id));
  }
  /** Owner only (403 otherwise). */
  renameWorkspace(id: string, name: string) {
    return this.send<Workspace>("PATCH", this.workspacePath(id), { name });
  }
  /** Owner or admin; 409 at 20 usable invites. The token is returned only here. */
  createInvite(id: string, input: InviteInput) {
    return this.send<CreatedInvite>(
      "POST",
      this.workspacePath(id, "/invites"),
      input,
    );
  }
  invites(id: string) {
    return this.request<{ items: WorkspaceInvite[] }>(
      this.workspacePath(id, "/invites"),
    );
  }
  revokeInvite(id: string, inviteId: string) {
    return this.send<{ revoked: true }>(
      "DELETE",
      this.workspacePath(id, `/invites/${encodeURIComponent(inviteId)}`),
    );
  }
  /** 404 for an unknown, expired, revoked or used-up invite (one message for all). */
  previewInvite(token: string) {
    return this.send<InvitePreview>("POST", "/workspaces/invites/preview", {
      token,
    });
  }
  /** 409 when the name is taken, the caller is already a member or the workspace is full. */
  joinWorkspace(token: string, displayName: string) {
    return this.send<Workspace>("POST", "/workspaces/join", {
      token,
      displayName,
    });
  }
  setMemberRole(id: string, memberId: string, role: WorkspaceRole) {
    return this.send<WorkspaceMember>(
      "PATCH",
      this.workspacePath(id, `/members/${encodeURIComponent(memberId)}`),
      { role },
    );
  }
  /** Removing yourself leaves the workspace; the owner gets 409 until ownership is transferred. */
  removeMember(id: string, memberId: string) {
    return this.send<{ removed: true }>(
      "DELETE",
      this.workspacePath(id, `/members/${encodeURIComponent(memberId)}`),
    );
  }
  workspaceMarkets(id: string, search = "", category = "") {
    const query = new URLSearchParams({ search, category });
    return this.request<{ items: Market[] }>(
      this.workspacePath(id, `/markets?${query}`),
    );
  }
  /** The caller's workspace wallet; `bonus` is always unavailable there. */
  workspacePortfolio(id: string) {
    return this.request<Portfolio>(this.workspacePath(id, "/portfolio"));
  }
  workspaceLeaderboard(id: string) {
    return this.request<Leaderboard>(this.workspacePath(id, "/leaderboard"));
  }
  /** Owner, admin or resolver; 409 on a conflict of interest or a market that cannot be ruled now. */
  workspaceRuling(id: string, marketId: string, outcome: ResolutionOutcome) {
    return this.send<Market>(
      "POST",
      this.workspacePath(id, `/markets/${encodeURIComponent(marketId)}/ruling`),
      { outcome },
    );
  }
}

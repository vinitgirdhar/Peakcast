import type {
  BonusClaim,
  Capabilities,
  Category,
  Draft,
  DraftInput,
  AIProvider,
  HistoryPoint,
  Inbox,
  Leaderboard,
  LimitOrder,
  Market,
  MarketComment,
  MarketTrade,
  Portfolio,
  Quote,
  ResolutionOutcome,
  Trade,
  TradeInput,
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
export class WildcatterClient {
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
  launchDraft(id: string, category: Category) {
    return this.request<Market>(`/drafts/${encodeURIComponent(id)}/launch`, {
      method: "POST",
      body: JSON.stringify({ category }),
    });
  }
  generateDraft(
    input: DraftInput,
    aiAccessToken: string,
    provider?: AIProvider,
  ) {
    return this.request<Draft>(
      `/drafts/generate${provider ? `?provider=${encodeURIComponent(provider)}` : ""}`,
      {
        method: "POST",
        headers: { "X-AI-Access-Token": aiAccessToken },
        body: JSON.stringify(input),
      },
    );
  }
}

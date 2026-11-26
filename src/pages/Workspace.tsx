import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Plus, Wallet } from "lucide-react";
import { PeakcastClient } from "../../shared/client.js";
import type {
  Market,
  Portfolio,
  WorkspaceDetail,
  WorkspaceRole,
} from "../../shared/types.js";
import {
  EmptyState,
  SkeletonRows,
  errorMessage,
  formatCredits,
} from "../ui.js";
import { AnimatedNumber } from "../motion.js";
import { MarketExplorer } from "./Markets.js";
import { MarketDetail } from "./MarketDetail.js";
import { LeaderboardView } from "./Leaderboard.js";
import { WorkspaceMembers, roleLabels } from "./WorkspaceMembers.js";

export type WorkspaceTab = "markets" | "leaderboard" | "members";
const tabs: { id: WorkspaceTab; label: string; path: string }[] = [
  { id: "markets", label: "Markets", path: "" },
  { id: "leaderboard", label: "Leaderboard", path: "/leaderboard" },
  { id: "members", label: "Members", path: "/members" },
];
/** Roles that may rule a disputed private market (the server re-checks). */
const RULERS: WorkspaceRole[] = ["owner", "admin", "resolver"];

interface WorkspaceProps {
  client: PeakcastClient;
  workspaceId: string;
  tab: WorkspaceTab;
  /** Set on /teams/:wid/markets/:id. */
  marketId?: string;
  marketView: "forecast" | "rules";
  navigate: (path: string) => void;
  onNotice: (text: string) => void;
  /** Opens Draft studio with this workspace as the launch target. */
  onDraft: () => void;
  onLeft: () => void;
  shareOrigin: string | null;
}

/** A workspace home: its private markets, leaderboard and members, plus market pages inside it. */
export function WorkspaceView({
  client,
  workspaceId: id,
  tab,
  marketId,
  marketView,
  navigate,
  onNotice,
  onDraft,
  onLeft,
  shareOrigin,
}: WorkspaceProps) {
  const base = `/teams/${id}`;
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [wallet, setWallet] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  async function reload() {
    const [nextDetail, nextMarkets, nextWallet] = await Promise.all([
      client.workspace(id),
      client.workspaceMarkets(id),
      client.workspacePortfolio(id),
    ]);
    setDetail(nextDetail);
    setMarkets(nextMarkets.items);
    setWallet(nextWallet);
    setError("");
  }

  useEffect(() => {
    const load = () => reload().catch((e) => setError(errorMessage(e)));
    void load();
    // Colleagues trade too; refresh on the same 15s rhythm as the rest of the app.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [attempt]);

  if (!detail)
    return error ? (
      <EmptyState
        title="Workspace unavailable"
        text={error}
        action={
          <div className="empty-actions">
            <button
              className="primary-button"
              onClick={() => navigate("/teams")}
            >
              All workspaces
            </button>
            <button
              className="secondary-button"
              onClick={() => setAttempt(attempt + 1)}
            >
              Try again
            </button>
          </div>
        }
      />
    ) : (
      <div className="page">
        <SkeletonRows label="Loading workspace…" count={4} />
      </div>
    );

  if (marketId) {
    const market = markets.find((item) => item.id === marketId);
    return market ? (
      <MarketDetail
        key={market.id}
        market={market}
        portfolio={wallet}
        client={client}
        view={marketView}
        onView={(view) =>
          navigate(
            `${base}/markets/${market.id}${view === "rules" ? "/rules" : ""}`,
          )
        }
        onBack={() => navigate(base)}
        onTrade={reload}
        onNotice={onNotice}
        shareOrigin={shareOrigin}
        workspaceName={detail.name}
        onRule={
          RULERS.includes(detail.role)
            ? (outcome) => client.workspaceRuling(id, market.id, outcome)
            : undefined
        }
      />
    ) : (
      <EmptyState
        title="Market not found"
        text="This market is not available in this workspace."
        action={
          <button className="primary-button" onClick={() => navigate(base)}>
            Workspace markets
          </button>
        }
      />
    );
  }

  return (
    <div className="page workspace-page">
      <button className="back-button" onClick={() => navigate("/teams")}>
        <ArrowLeft size={16} />
        All workspaces
      </button>
      <div className="page-heading">
        <div>
          <h1>
            {detail.name} <span className="small-pill">Preview</span>
          </h1>
          <p>
            {roleLabels[detail.role]} · {detail.memberCount}{" "}
            {detail.memberCount === 1 ? "member" : "members"} · Private markets
            on workspace credits
          </p>
        </div>
        <div className="workspace-actions">
          <span className="system-pill">
            <Wallet size={14} aria-hidden="true" />
            <span>
              {wallet ? (
                <AnimatedNumber
                  value={wallet.balanceMicros}
                  format={formatCredits}
                />
              ) : (
                "—"
              )}{" "}
              workspace credits
            </span>
          </span>
          <button className="primary-button" onClick={onDraft}>
            <Plus size={17} /> Draft a market
          </button>
        </div>
      </div>
      <nav className="view-tabs" aria-label="Workspace views">
        {tabs.map((item) => (
          <button
            key={item.id}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => navigate(base + item.path)}
          >
            {tab === item.id && (
              <motion.span
                className="tab-selection"
                layoutId="workspace-view"
              />
            )}
            {item.label}
          </button>
        ))}
      </nav>
      {error && (
        <div role="alert" className="form-error inline-error">
          <p>{error}</p>
          <button
            className="text-button"
            onClick={() => setAttempt(attempt + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {tab === "markets" &&
        (markets.length ? (
          <MarketExplorer
            embedded
            markets={markets}
            onOpen={(market) => navigate(`${base}/markets/${market.id}`)}
            onStudio={onDraft}
          />
        ) : (
          <EmptyState
            title="No private markets yet"
            text="Use Draft a market, then pick this workspace under Launch to. Only members can see or trade what you launch here."
          />
        ))}
      {tab === "leaderboard" && (
        <LeaderboardView
          client={client}
          load={() => client.workspaceLeaderboard(id)}
        />
      )}
      {tab === "members" && (
        <WorkspaceMembers
          client={client}
          workspace={detail}
          shareOrigin={shareOrigin}
          onChanged={reload}
          onNotice={onNotice}
          onLeft={onLeft}
        />
      )}
    </div>
  );
}

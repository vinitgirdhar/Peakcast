import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PeakcastClient } from "../../shared/client.js";
import type { Leaderboard } from "../../shared/types.js";
import {
  EmptyState,
  SkeletonRows,
  errorMessage,
  formatCredits,
} from "../ui.js";
import { itemMotion, listMotion } from "../motion.js";
import { haptic } from "../haptics.js";

const tabs = [
  {
    id: "traders",
    label: "Top traders",
    empty: "No traders yet",
    hint: "Make a trade to appear on the board.",
  },
  {
    id: "creators",
    label: "Top creators",
    empty: "No creators yet",
    hint: "Launch a market from Draft studio to appear here.",
  },
  {
    id: "forecasters",
    label: "Most accurate",
    empty: "No forecasters yet",
    hint: "Trade in at least 3 markets that resolve YES or NO to be ranked by accuracy.",
  },
] as const;
type Tab = (typeof tabs)[number]["id"];
interface Row {
  rank: number;
  trader: string;
  you: boolean;
  detail: string;
  value: string;
  tone: "" | "positive" | "negative";
}

const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`;

function boardRows(board: Leaderboard | null, tab: Tab): Row[] {
  if (tab === "traders")
    return (board?.traders ?? []).map((row) => ({
      ...row,
      detail: plural(row.trades, "trade"),
      value: `${row.pnlMicros > 0 ? "+" : ""}${formatCredits(row.pnlMicros)} credits`,
      tone: row.pnlMicros >= 0 ? "positive" : "negative",
    }));
  if (tab === "creators")
    return (board?.creators ?? []).map((row) => ({
      ...row,
      detail: `${plural(row.markets, "market")} · ${formatCredits(row.volumeMicros)} credits volume`,
      value: `${formatCredits(row.feesMicros)} credits`,
      tone: "",
    }));
  return (board?.forecasters ?? []).map((row) => ({
    ...row,
    detail: plural(row.resolvedMarkets, "resolved market"),
    value: `Brier ${row.brier.toFixed(3)}`,
    tone: "",
  }));
}

export function LeaderboardView({
  client,
  load,
}: {
  client: PeakcastClient;
  /** A workspace board: loaded from here, shown inside the workspace page, members named. */
  load?: () => Promise<Leaderboard>;
}) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("traders");

  useEffect(() => {
    let active = true;
    void (load ? load() : client.leaderboard())
      .then((data) => {
        if (active) {
          setBoard(data);
          setError("");
        }
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [client, attempt]);

  const rows = boardRows(board, tab);
  const current = tabs.find((item) => item.id === tab)!;
  return (
    <div className={load ? "leaderboard" : "page leaderboard"}>
      {!load && (
        <div className="page-heading">
          <div>
            <h1>Leaderboard</h1>
            <p>Who reads the future best? Ranked on demo credits.</p>
            <p className="fine-print">
              Includes sample players added with the app so you have someone to
              beat. They are not real people.
            </p>
          </div>
        </div>
      )}
      <div
        className="category-tabs liquid-material"
        role="group"
        aria-label="Leaderboard type"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "selected" : ""}
            aria-pressed={tab === item.id}
            onClick={() => {
              if (tab !== item.id) haptic("selection");
              setTab(item.id);
            }}
          >
            {tab === item.id && (
              <motion.span
                className="tab-selection"
                layoutId="leaderboard-tab"
              />
            )}
            {item.label}
          </button>
        ))}
      </div>
      {error && !board ? (
        <div role="alert" className="form-error inline-error">
          <p>{error}</p>
          <button
            className="text-button"
            onClick={() => setAttempt(attempt + 1)}
          >
            Try again
          </button>
        </div>
      ) : !board ? (
        <div className="activity-list">
          <SkeletonRows label="Loading leaderboard…" count={4} />
        </div>
      ) : rows.length ? (
        <motion.ol
          key={tab}
          className="activity-list rank-list"
          variants={listMotion}
          initial="hidden"
          animate="show"
        >
          {rows.map((row) => (
            <motion.li
              className={`activity-row ${row.you ? "rank-you" : ""}`}
              key={row.rank}
              variants={itemMotion}
            >
              <span className="soft-icon rank-badge" data-rank={row.rank}>
                {row.rank}
              </span>
              <div>
                <strong>
                  {row.trader}
                  {row.you && <span className="small-pill">You</span>}
                </strong>
                <span>{row.detail}</span>
              </div>
              <strong className={row.tone}>{row.value}</strong>
            </motion.li>
          ))}
        </motion.ol>
      ) : (
        <EmptyState title={current.empty} text={current.hint} />
      )}
      <p className="fine-print">
        Profit is balance plus open positions at the current price, minus the
        starting credits and any daily bonuses. Creator ranking uses fees
        earned. Accuracy ranks forecasters with at least 3 markets resolved YES
        or NO by Brier score: 0 is perfect, always saying 50% scores 0.25, and
        lower ranks higher.{" "}
        {load
          ? "Only this workspace's markets and credits count; members appear by display name."
          : "Traders appear under an alias."}
      </p>
    </div>
  );
}

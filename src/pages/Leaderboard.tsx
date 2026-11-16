import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { WildcatterClient } from "../../shared/client.js";
import type { Leaderboard } from "../../shared/types.js";
import {
  EmptyState,
  SkeletonRows,
  errorMessage,
  formatCredits,
} from "../ui.js";
import { useLiquidGlass } from "../useLiquidGlass.js";
import { itemMotion, listMotion } from "../motion.js";

const tabs = [
  { id: "traders", label: "Top traders" },
  { id: "creators", label: "Top creators" },
] as const;

export function LeaderboardView({ client }: { client: WildcatterClient }) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"traders" | "creators">("traders");
  const tabsGlass = useLiquidGlass<HTMLDivElement>();

  useEffect(() => {
    let active = true;
    void client
      .leaderboard()
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

  const rows =
    tab === "traders"
      ? (board?.traders ?? []).map((row) => ({
          ...row,
          detail: `${row.trades} ${row.trades === 1 ? "trade" : "trades"}`,
          amount: row.pnlMicros,
          signed: true,
        }))
      : (board?.creators ?? []).map((row) => ({
          ...row,
          detail: `${row.markets} ${row.markets === 1 ? "market" : "markets"} · ${formatCredits(row.volumeMicros)} credits volume`,
          amount: row.feesMicros,
          signed: false,
        }));
  return (
    <div className="page leaderboard">
      <div className="page-heading">
        <div>
          <h1>Leaderboard</h1>
          <p>Who reads the future best? Ranked on demo credits.</p>
        </div>
      </div>
      <div
        ref={tabsGlass}
        className="category-tabs liquid-material"
        role="group"
        aria-label="Leaderboard type"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "selected" : ""}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
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
              <strong
                className={
                  row.signed ? (row.amount >= 0 ? "positive" : "negative") : ""
                }
              >
                {row.signed && row.amount > 0 ? "+" : ""}
                {formatCredits(row.amount)} credits
              </strong>
            </motion.li>
          ))}
        </motion.ol>
      ) : (
        <EmptyState
          title={tab === "traders" ? "No traders yet" : "No creators yet"}
          text={
            tab === "traders"
              ? "Make a trade to appear on the board."
              : "Launch a market from Draft studio to appear here."
          }
        />
      )}
      <p className="fine-print">
        Profit is balance plus open positions at the current price, minus the
        10,000 starting credits and any daily bonuses. Creator ranking uses fees
        earned. Traders appear under an alias.
      </p>
    </div>
  );
}

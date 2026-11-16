import { useId, useState } from "react";
import { motion } from "motion/react";
import { Check, Flame, Gift } from "lucide-react";
import { ApiError, WildcatterClient } from "../../shared/client.js";
import type { AccountStats, DailyBonus } from "../../shared/types.js";
import { errorMessage, formatCredits, percent } from "../ui.js";
import { AnimatedNumber, enterMotion } from "../motion.js";

const credits = (micros: number) => formatCredits(micros, 0);

export function DailyBonusCard({
  bonus,
  client,
  onRefresh,
  onNotice,
}: {
  bonus: DailyBonus;
  client: WildcatterClient;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amount = credits(bonus.nextAmountMicros);

  async function claim() {
    setBusy(true);
    setError("");
    try {
      const result = await client.claimBonus();
      onNotice(`Daily bonus: +${credits(result.amountMicros)} credits`);
      await onRefresh();
    } catch (e) {
      // Claimed elsewhere today (another tab, the API): show the claimed state.
      if (e instanceof ApiError && e.status === 409)
        await onRefresh().catch((refresh) => setError(errorMessage(refresh)));
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.section
      className="bonus-card"
      aria-label="Daily bonus"
      {...enterMotion}
    >
      <span className="soft-icon bonus-icon">
        <Gift size={19} />
      </span>
      <div className="bonus-copy">
        <h2>
          Daily bonus
          {bonus.streak > 0 && (
            <span className="small-pill streak-pill">
              <Flame size={12} aria-hidden="true" />
              {bonus.streak}-day streak
            </span>
          )}
        </h2>
        <p>
          {bonus.available
            ? bonus.streak
              ? "Claim today to keep your streak. Each day in a row adds 10 credits, up to 100."
              : "Free demo credits every day. Each day in a row adds 10 more, up to 100."
            : `Come back tomorrow for ${amount} credits. Resets at 00:00 UTC.`}
        </p>
      </div>
      {bonus.available ? (
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void claim()}
        >
          <Gift size={15} />
          {busy ? "Claiming…" : `Claim ${amount} credits`}
        </button>
      ) : (
        <span className="bonus-claimed">
          <Check size={16} /> Claimed today
        </span>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </motion.section>
  );
}

export function PerformanceStats({ stats }: { stats?: AccountStats }) {
  const id = useId();
  const resolved = stats?.resolvedMarkets ?? 0;
  const money = (micros?: number) =>
    micros === undefined ? (
      "—"
    ) : (
      <AnimatedNumber value={micros} format={formatCredits} />
    );
  const tiles = [
    {
      key: "trades",
      label: "Trades",
      value: stats ? stats.tradeCount.toLocaleString("en-US") : "—",
      note: "demo trades placed",
    },
    {
      key: "volume",
      label: "Volume",
      value: money(stats?.volumeMicros),
      note: "credits traded",
    },
    {
      key: "win-rate",
      label: "Win rate",
      value: resolved ? percent(stats!.winRate) : "—",
      note: resolved
        ? `${stats!.wins} ${stats!.wins === 1 ? "win" : "wins"} of ${resolved} resolved ${resolved === 1 ? "market" : "markets"}`
        : "No resolved markets yet",
    },
    {
      key: "payouts",
      label: "Payouts received",
      value: money(stats?.payoutsMicros),
      note: "credits",
    },
    {
      key: "fees",
      label: "Creator fees earned",
      value: money(stats?.creatorFeesMicros),
      note: "credits",
    },
  ];
  return (
    <section className="performance" aria-labelledby={id}>
      <h2 id={id}>Trading record</h2>
      <div className="portfolio-stats performance-stats">
        {tiles.map((tile) => (
          <div key={tile.key} className={`stat-${tile.key}`}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>{tile.note}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

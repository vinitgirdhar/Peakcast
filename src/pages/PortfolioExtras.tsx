import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { Check, Flame, Gift } from "lucide-react";
import { ApiError, WildcatterClient } from "../../shared/client.js";
import type {
  AccountStats,
  Calibration,
  CalibrationBucket,
  DailyBonus,
} from "../../shared/types.js";
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

const score = (value: number) => value.toFixed(3);
const signedScore = (value: number) => `${value > 0 ? "+" : ""}${score(value)}`;

export function AccuracyCard({
  client,
  resolvedMarkets,
}: {
  client: WildcatterClient;
  /** From portfolio stats; undefined until the portfolio has loaded. */
  resolvedMarkets?: number;
}) {
  const id = useId();
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  // Scores change only when one of the account's markets resolves, which is
  // exactly when the resolved-market count moves, so routine portfolio
  // polling does not refetch. The client is rebuilt each render with the
  // same token, so it is deliberately not a dependency.
  useEffect(() => {
    if (resolvedMarkets === undefined) return;
    let active = true;
    void client
      .calibration()
      .then((data) => {
        if (active) {
          setCalibration(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [resolvedMarkets, attempt]);

  return (
    <motion.section
      className="performance accuracy"
      aria-labelledby={id}
      {...enterMotion}
    >
      <h2 id={id}>Accuracy</h2>
      <p className="accuracy-intro">
        Your Brier score: how far your forecasts landed from what happened. 0 is
        perfect; always saying 50% scores 0.25.
      </p>
      {error ? (
        <div role="alert" className="form-error inline-error">
          <p>{error}</p>
          <button
            className="text-button"
            onClick={() => setAttempt(attempt + 1)}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="portfolio-stats accuracy-card">
          {calibration?.brier == null ? (
            <p className="accuracy-empty" aria-busy={!calibration}>
              {calibration
                ? "Your accuracy appears once one of your markets resolves YES or NO."
                : "Loading accuracy…"}
            </p>
          ) : (
            <AccuracyFigures {...calibration} brier={calibration.brier} />
          )}
        </div>
      )}
    </motion.section>
  );
}

function AccuracyFigures({
  brier,
  skill,
  resolvedMarkets,
  buckets,
}: Calibration & { brier: number }) {
  return (
    <>
      <div className="stat-brier">
        <span>Brier score</span>
        <strong>{score(brier)}</strong>
        <small>lower is better</small>
      </div>
      <div className="stat-resolved">
        <span>Resolved markets</span>
        <strong>{resolvedMarkets}</strong>
        <small>resolved YES or NO</small>
      </div>
      <div className="stat-skill">
        <span>Skill</span>
        <strong
          className={
            skill === undefined ? "" : skill >= 0 ? "positive" : "negative"
          }
        >
          {skill === undefined ? "—" : signedScore(skill)}
        </strong>
        <small>
          {skill !== undefined && skill < 0
            ? "behind the price before your trades"
            : "ahead of the price before your trades"}
        </small>
      </div>
      <ReliabilityDiagram buckets={buckets} />
    </>
  );
}

// Plot area inside a 200 × 200 viewBox, leaving room for tick labels.
const LEFT = 30;
const TOP = 8;
const SPAN = 155;
const plotX = (value: number) => LEFT + value * SPAN;
const plotY = (value: number) => TOP + (1 - value) * SPAN;

function ReliabilityDiagram({ buckets }: { buckets: CalibrationBucket[] }) {
  const points = buckets.flatMap((bucket) =>
    bucket.meanForecast === null || bucket.observedRate === null
      ? []
      : [
          {
            ...bucket,
            observedRate: bucket.observedRate,
            x: plotX(bucket.meanForecast),
            y: plotY(bucket.observedRate),
          },
        ],
  );
  const summary = points
    .map(
      (point) =>
        `forecasts ${percent(point.from)} to ${percent(point.to)}: ${point.count} ${point.count === 1 ? "market" : "markets"}, ${percent(point.observedRate)} resolved YES`,
    )
    .join("; ");
  return (
    <figure className="reliability">
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={`Reliability diagram. ${summary}.`}
      >
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line
              className="reliability-grid"
              x1={plotX(0)}
              x2={plotX(1)}
              y1={plotY(tick)}
              y2={plotY(tick)}
            />
            <line
              className="reliability-grid"
              x1={plotX(tick)}
              x2={plotX(tick)}
              y1={plotY(0)}
              y2={plotY(1)}
            />
            <text x={LEFT - 5} y={plotY(tick) + 3} textAnchor="end">
              {percent(tick)}
            </text>
            <text x={plotX(tick)} y={plotY(0) + 14} textAnchor="middle">
              {percent(tick)}
            </text>
          </g>
        ))}
        <line
          className="reliability-diagonal"
          x1={plotX(0)}
          y1={plotY(0)}
          x2={plotX(1)}
          y2={plotY(1)}
        />
        {points.length > 1 && (
          <polyline
            className="reliability-curve"
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          />
        )}
        {points.map((point) => (
          <circle
            key={point.from}
            cx={point.x}
            cy={point.y}
            r={Math.min(3 + Math.sqrt(point.count), 7)}
          />
        ))}
      </svg>
      <figcaption>
        Forecast (across) against how often YES happened (up). Dots on the
        dashed line are perfectly calibrated.
      </figcaption>
    </figure>
  );
}

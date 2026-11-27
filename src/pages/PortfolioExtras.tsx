import { useEffect, useId, useState, type ReactNode, type Ref } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { Check, CircleHelp, Flame, Gift } from "lucide-react";
import { ApiError, PeakcastClient } from "../../shared/client.js";
import type {
  AccountStats,
  Calibration,
  CalibrationBucket,
  DailyBonus,
  Portfolio,
} from "../../shared/types.js";
import { errorMessage, formatCredits, percent } from "../ui.js";
import { AnimatedNumber, Collapse, ease, enterMotion } from "../motion.js";
import { haptic } from "../haptics.js";

const credits = (micros: number) => formatCredits(micros, 0);
const count = (value: number) => Math.round(value).toLocaleString("en-US");
const pop = { type: "spring", stiffness: 520, damping: 22 } as const;
const signedCredits = (micros: number) =>
  `${micros > 0 ? "+" : ""}${formatCredits(micros)}`;

/**
 * Holds the bonus card inside AnimatePresence. The card has already turned to
 * dust (see dust.ts) when it leaves, so the exit only collapses the height and
 * the summary below glides up instead of jumping.
 * While leaving it is hidden from assistive tech, so the claimed note in
 * the summary is the only "Daily bonus" region.
 */
export function BonusSlot({
  children,
  ref,
}: {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  const present = useIsPresent();
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className="pf-bonus-slot"
      aria-hidden={present ? undefined : true}
      inert={!present}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0 }}
      transition={{ duration: reduce ? 0 : 0.32, ease }}
    >
      {children}
    </motion.div>
  );
}

/** Wallet-style balance card: one big number, P&L, then cash and invested. */
export function PortfolioSummary({
  portfolio,
  bonus,
}: {
  portfolio: Portfolio | null;
  /** Shown as a one-line note once today's bonus is claimed and its card is gone. */
  bonus?: DailyBonus;
}) {
  const money = (micros: number | undefined, format = formatCredits) =>
    micros === undefined ? (
      "—"
    ) : (
      <AnimatedNumber value={micros} format={format} />
    );
  const pnl = portfolio?.pnlMicros;
  return (
    <section className="pf-summary" aria-label="Portfolio summary">
      <div className="pf-summary-top">
        <div className="pf-summary-total">
          <span className="pf-label">
            Portfolio value <span className="pf-tag">Demo credits</span>
          </span>
          <strong className="pf-total">{money(portfolio?.equityMicros)}</strong>
          <span
            className={`pf-pnl ${!pnl ? "" : pnl > 0 ? "positive" : "negative"}`}
          >
            {money(pnl, signedCredits)}
            <span className="pf-pnl-label">total profit / loss</span>
          </span>
        </div>
        <dl className="pf-mini">
          <div>
            <dt>Available</dt>
            <dd>{money(portfolio?.balanceMicros)}</dd>
          </div>
          <div>
            <dt>Invested</dt>
            <dd>{money(portfolio?.investedMicros)}</dd>
          </div>
        </dl>
      </div>
      <details className="pf-note">
        <summary>
          <CircleHelp size={13} aria-hidden="true" /> About valuation
        </summary>
        <p>
          Values use the current market price; the final sell quote includes
          price impact. Invested is what you paid for open positions.
        </p>
      </details>
      <Collapse open={!!bonus && !bonus.available}>
        {bonus && (
          <section className="pf-bonus-note" aria-label="Daily bonus">
            <Check size={14} aria-hidden="true" />
            <span>
              Bonus claimed. Come back tomorrow for{" "}
              {credits(bonus.nextAmountMicros)} credits.
            </span>
            {bonus.streak > 0 && (
              <span className="pf-tag streak">
                <Flame size={11} aria-hidden="true" />
                {bonus.streak}-day streak
              </span>
            )}
          </section>
        )}
      </Collapse>
    </section>
  );
}

export function DailyBonusCard({
  bonus,
  client,
  onRefresh,
  onNotice,
  onClaimed,
}: {
  bonus: DailyBonus;
  client: PeakcastClient;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
  /** After a claim from this card has landed: the page shows the check, then dismisses the card. */
  onClaimed?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Set by a claim from this card, so the confirmation pops only then, not
  // when the page opens on a bonus already claimed.
  const [justClaimed, setJustClaimed] = useState(false);
  const amount = credits(bonus.nextAmountMicros);

  async function claim() {
    setBusy(true);
    setError("");
    try {
      const result = await client.claimBonus();
      setJustClaimed(true);
      haptic("success");
      onNotice(`Daily bonus: +${credits(result.amountMicros)} credits`);
      await onRefresh();
      onClaimed?.();
    } catch (e) {
      // Claimed elsewhere today (another tab, the API): show the claimed state.
      if (e instanceof ApiError && e.status === 409)
        await onRefresh().catch((refresh) => setError(errorMessage(refresh)));
      else {
        haptic("warning");
        setError(errorMessage(e));
      }
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
      <motion.span
        className="soft-icon bonus-icon"
        key={justClaimed ? "claimed" : "waiting"}
        initial={justClaimed ? { rotate: -14, scale: 0.8 } : false}
        animate={{ rotate: 0, scale: 1 }}
        transition={pop}
      >
        <Gift size={17} />
      </motion.span>
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
              ? "Keep your streak: each day in a row adds 10, up to 100."
              : "Free credits daily. Streaks add 10 a day, up to 100."
            : `Come back tomorrow for ${amount} credits. Resets at 00:00 UTC.`}
        </p>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {bonus.available ? (
          <motion.button
            key="claim"
            className="primary-button pf-claim"
            disabled={busy}
            onClick={() => void claim()}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
          >
            {busy ? "Claiming…" : `Claim ${amount} credits`}
          </motion.button>
        ) : (
          <motion.span
            key="claimed"
            className="bonus-claimed"
            initial={justClaimed ? { opacity: 0, scale: 0.6 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={pop}
          >
            <motion.span
              style={{ display: "inline-flex" }}
              initial={justClaimed ? { scale: 0, rotate: -45 } : false}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...pop, delay: 0.12 }}
            >
              <Check size={16} />
            </motion.span>{" "}
            Claimed today
          </motion.span>
        )}
      </AnimatePresence>
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
      value: stats ? (
        <AnimatedNumber value={stats.tradeCount} format={count} />
      ) : (
        "—"
      ),
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
      value: resolved ? (
        <AnimatedNumber value={stats!.winRate} format={percent} />
      ) : (
        "—"
      ),
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
    <section className="pf-card performance" aria-labelledby={id}>
      <h2 id={id}>Trading record</h2>
      <div className="pf-stats">
        {tiles.map((tile) => (
          <div key={tile.key} className={`pf-stat stat-${tile.key}`}>
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
  client: PeakcastClient;
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
      className="pf-card performance accuracy"
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
        <div className="pf-stats accuracy-card">
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
      <div className="pf-stat stat-brier">
        <span>Brier score</span>
        <strong>{score(brier)}</strong>
        <small>lower is better</small>
      </div>
      <div className="pf-stat stat-resolved">
        <span>Resolved markets</span>
        <strong>{resolvedMarkets}</strong>
        <small>resolved YES or NO</small>
      </div>
      <div className="pf-stat stat-skill">
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
        aria-label={`Reliability diagram: forecast across, how often YES happened up; dots on the dashed line are perfectly calibrated. ${summary}.`}
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
    </figure>
  );
}

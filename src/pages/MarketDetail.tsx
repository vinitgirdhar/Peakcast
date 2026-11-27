import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  CircleHelp,
  ExternalLink,
  Lock,
  Share2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { ApiError, PeakcastClient } from "../../shared/client.js";
import type {
  Action,
  HistoryPoint,
  Market,
  Outcome,
  Portfolio,
  Quote,
  ResolutionOutcome,
  TradeInput,
  MarketTrade,
} from "../../shared/types.js";
import {
  ChangeChip,
  formatCredits,
  percent,
  errorMessage,
  statusLabel,
} from "../ui.js";
import { ResolutionPanel } from "./Resolution.js";
import {
  Discussion,
  LimitOrders,
  TradeFeed,
  WatchButton,
} from "./MarketExtras.js";
import { SharePanel } from "./Share.js";
import { AnimatedNumber, ease } from "../motion.js";
import { haptic } from "../haptics.js";
import { RuleCheckLine } from "./RuleCheck.js";
import { ExplainPanel } from "./Explain.js";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import "./trading-motion.css";

const cents = (price: number) => `${(price * 100).toFixed(1)}¢`;
const fineCents = (price: number) => `${(price * 100).toFixed(2)}¢`;
const creditsLabel = (micros: number) => `${formatCredits(micros)} credits`;
const thumbSpring = { type: "spring", stiffness: 520, damping: 40 } as const;

type ChartPoint = readonly [number, number];
const toPoints = (points: readonly ChartPoint[]) =>
  points.map(([x, y]) => `${x},${y}`).join(" ");

/**
 * The chart line as a motion value that morphs to each new history: points
 * glide to their new places (an axis rescale included) and a new trade grows
 * out of the previous last point. No React re-render per frame.
 */
function useChartLine(target: readonly ChartPoint[]) {
  const reduce = useReducedMotion();
  const shown = useRef<readonly ChartPoint[]>(target);
  const key = toPoints(target);
  const line = useMotionValue(key);
  useEffect(() => {
    const from = shown.current;
    if (reduce || !from.length || !target.length) {
      shown.current = target;
      line.set(key);
      return;
    }
    const start = target.map(
      (_, index) => from[Math.min(index, from.length - 1)],
    );
    const controls = animate(0, 1, {
      duration: 0.5,
      ease,
      onUpdate: (t) => {
        shown.current = target.map(([x, y], index) => {
          const [fromX, fromY] = start[index];
          return [fromX + (x - fromX) * t, fromY + (y - fromY) * t] as const;
        });
        line.set(toPoints(shown.current));
      },
    });
    return () => controls.stop();
    // `key` is the serialised target, so it stands in for `target`.
  }, [key, reduce]);
  return line;
}

export function MarketDetail({
  market,
  portfolio,
  client,
  onBack,
  onTrade,
  onNotice,
  view,
  onView,
  shareOrigin,
  workspaceName,
  onRule,
}: {
  market: Market;
  portfolio: Portfolio | null;
  client: PeakcastClient;
  onBack: () => void;
  onTrade: () => Promise<void>;
  onNotice: (text: string) => void;
  view: "forecast" | "rules";
  onView: (view: "forecast" | "rules") => void;
  shareOrigin: string | null;
  /** Set for a private market, opened from its workspace. */
  workspaceName?: string;
  /** A workspace owner, admin or resolver's ruling; see ResolutionPanel. */
  onRule?: (outcome: ResolutionOutcome) => Promise<Market>;
}) {
  // Private markets are never shared or embedded; their links would 404.
  const privateMarket = Boolean(market.workspaceId);
  const [sharing, setSharing] = useState(false);
  const shareId = useId();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  // Which market the history belongs to: the chart waits for it instead of
  // flashing the "no trades yet" placeholder first.
  const [historyFor, setHistoryFor] = useState("");
  const [historyError, setHistoryError] = useState("");
  const clipId = `chart-clip-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  // null until the first response, so the feed can show a loading state.
  const [feed, setFeed] = useState<MarketTrade[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [action, setAction] = useState<Action>("buy");
  const [shares, setShares] = useState("25");
  const [quote, setQuote] = useState<Quote | null>(null);
  // The last quote shown, kept (dimmed) while the next one loads so the
  // figures tween instead of blinking to "—" on every keystroke.
  const [lastQuote, setLastQuote] = useState<Quote | null>(null);
  // Brief check mark on the trade button after a fill; a counter re-runs the error shake.
  const [filled, setFilled] = useState(false);
  const [shake, setShake] = useState(0);
  const [quoteError, setQuoteError] = useState("");
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [tradeError, setTradeError] = useState("");
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const retry = useRef<{
    input: TradeInput & { limitMicros: number };
    key: string;
  } | null>(null);
  const quantity = Number(shares);
  const validQuantity =
    /^\d+$/.test(shares) &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 10000;
  const held =
    portfolio?.positions.find(
      (position) =>
        position.marketId === market.id && position.outcome === outcome,
    )?.shares ?? 0;

  useEffect(() => {
    let active = true;
    void client
      .history(market.id)
      .then((data) => {
        if (active) {
          setHistory(data.items);
          setHistoryFor(market.id);
          setHistoryError("");
        }
      })
      .catch((error) => {
        if (active) setHistoryError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [market.id, market.trades]);

  useEffect(() => {
    let active = true;
    void client
      .marketTrades(market.id)
      .then((data) => {
        if (active) setFeed(data.items);
      })
      // The feed is secondary; the chart caption already reports API trouble.
      .catch(() => {
        if (active) setFeed([]);
      });
    return () => {
      active = false;
    };
  }, [market.id, market.trades]);

  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    if (!validQuantity) return;
    let active = true;
    const timer = setTimeout(() => {
      void client
        .quote({ marketId: market.id, outcome, action, shares: quantity })
        .then((data) => {
          if (active) {
            setQuote(data);
            setLastQuote(data);
          }
        })
        .catch((error) => {
          if (active) setQuoteError(errorMessage(error));
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    market.id,
    market.probability,
    market.status,
    outcome,
    action,
    quantity,
    validQuantity,
    quoteRevision,
  ]);

  useEffect(() => {
    if (!filled) return;
    const timer = setTimeout(() => setFilled(false), 1400);
    return () => clearTimeout(timer);
  }, [filled]);

  const currentQuote =
    quote &&
    quote.outcome === outcome &&
    quote.action === action &&
    quote.shares === quantity
      ? quote
      : null;
  const limitMicros = currentQuote
    ? action === "buy"
      ? Math.min(
          Math.ceil(currentQuote.amountMicros * 1.01),
          portfolio?.balanceMicros ?? 0,
          10_000_000_000,
        )
      : Math.floor(currentQuote.amountMicros * 0.99)
    : 0;
  const insufficient =
    action === "buy"
      ? Boolean(
          currentQuote &&
          (portfolio?.balanceMicros ?? 0) < currentQuote.amountMicros,
        )
      : held < quantity;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((!currentQuote && !unconfirmed) || busy) return;
    // No press buzz: the on-device fill lands within milliseconds, and its
    // success (or warning) tap is the feedback; two in a row feels mushy.
    setBusy(true);
    setTradeError("");
    const input = retry.current?.input ?? {
      marketId: market.id,
      outcome,
      action,
      shares: quantity,
      limitMicros,
    };
    retry.current ??= { input, key: crypto.randomUUID() };
    try {
      const fill = await client.trade(input, retry.current!.key);
      retry.current = null;
      setUnconfirmed(false);
      setFilled(true);
      haptic("success");
      onNotice(
        `${fill.action === "buy" ? "Bought" : "Sold"} ${fill.shares} ${fill.outcome} shares for ${formatCredits(fill.amountMicros)} demo credits.`,
      );
      setQuote(null);
      try {
        await onTrade();
      } catch {
        setTradeError(
          "Trade completed. The portfolio refresh failed; refresh the page before placing another trade.",
        );
      }
    } catch (error) {
      haptic("warning");
      setShake((count) => count + 1);
      if (error instanceof ApiError && error.status < 500) {
        retry.current = null;
        setUnconfirmed(false);
        setTradeError(errorMessage(error));
      } else {
        setUnconfirmed(true);
        setTradeError(
          "The trade response was interrupted. Retry confirmation to check the same trade safely.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const values = history.map((point) => point.probability);
  // Zoom the axis to the traded range (5% steps) so small moves stay visible.
  const low = Math.max(
    0,
    Math.floor((Math.min(...values, market.probability) - 0.03) * 20) / 20,
  );
  const high = Math.min(
    1,
    Math.ceil((Math.max(...values, market.probability) + 0.03) * 20) / 20,
  );
  const chartY = (value: number) => 180 - ((value - low) / (high - low)) * 160;
  const line = useChartLine(
    values.map(
      (value, index) =>
        [
          history.length === 1 ? 0 : (index / (history.length - 1)) * 600,
          chartY(value),
        ] as const,
    ),
  );
  const area = useTransform(line, (points) => `${points} 600,180 0,180`);
  const historyLoaded = historyFor === market.id || Boolean(historyError);
  // Figures shown in the breakdown: the live quote, else the previous one dimmed.
  const shownQuote = validQuantity ? (currentQuote ?? lastQuote) : null;
  const tradeIcon = busy ? "busy" : filled ? "filled" : "ready";
  return (
    <div className="page detail-page">
      <div className="detail-actions">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} />
          {privateMarket ? "Workspace markets" : "All markets"}
        </button>
        <div className="detail-buttons">
          <WatchButton
            market={market}
            portfolio={portfolio}
            client={client}
            onChange={onTrade}
            onNotice={onNotice}
          />
          {!privateMarket && (
            <button
              className="back-button"
              aria-expanded={sharing}
              aria-controls={sharing ? shareId : undefined}
              onClick={() => setSharing(!sharing)}
            >
              <Share2 size={15} />
              Share
            </button>
          )}
        </div>
      </div>
      {!privateMarket && (
        <SharePanel
          open={sharing}
          id={shareId}
          market={market}
          client={client}
          shareOrigin={shareOrigin}
        />
      )}
      <div
        className={`detail-layout ${view === "rules" ? "rules-layout" : ""}`}
      >
        <section className="market-detail">
          <div className="detail-title">
            <span
              className="market-symbol large"
              style={{ background: market.color }}
            >
              {market.symbol}
            </span>
            <div>
              <span className="category-label">
                {market.category} <span className="inline-divider">/</span> Demo
              </span>
              {privateMarket && (
                <span className="small-pill private-pill">
                  <Lock size={12} aria-hidden="true" />
                  Private to {workspaceName ?? "your workspace"}
                </span>
              )}
              <h1>{market.title}</h1>
            </div>
          </div>
          <nav className="view-tabs" aria-label="Market views">
            <button
              aria-current={view === "forecast" ? "page" : undefined}
              onClick={() => onView("forecast")}
            >
              {view === "forecast" && (
                <motion.span
                  className="tab-selection"
                  layoutId={`market-view-${market.id}`}
                />
              )}
              Forecast
            </button>
            <button
              aria-current={view === "rules" ? "page" : undefined}
              onClick={() => onView("rules")}
            >
              {view === "rules" && (
                <motion.span
                  className="tab-selection"
                  layoutId={`market-view-${market.id}`}
                />
              )}
              Rules & source
            </button>
          </nav>
          {view === "forecast" ? (
            <>
              <div className="forecast-header">
                <div>
                  <strong>
                    <AnimatedNumber
                      value={market.probability}
                      format={percent}
                    />
                  </strong>
                  <span>chance of YES</span>
                  <ChangeChip change={market.change24h} />
                </div>
                <span className="small-pill">
                  {statusLabel(market)}
                  {market.feeBps > 0 && " · Community market"}
                </span>
                <button
                  className="mobile-trade-link"
                  onClick={() =>
                    document.getElementById("trade-panel")?.scrollIntoView({
                      block: "start",
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "auto"
                        : "smooth",
                    })
                  }
                >
                  Trade <ArrowRight size={16} />
                </button>
              </div>
              <div
                className="chart"
                role="img"
                aria-label={`Demo probability history. ${history.length <= 1 ? "Starting snapshot only. No trades yet." : `${history.length - 1} observed demo trades.`}`}
              >
                <div className="chart-labels">
                  <span>{percent(high)}</span>
                  <span>{percent((low + high) / 2)}</span>
                  <span>{percent(low)}</span>
                </div>
                <svg viewBox="0 0 600 200" preserveAspectRatio="none">
                  <path
                    d="M0 20H600 M0 100H600 M0 180H600"
                    stroke="#e8edf4"
                    strokeDasharray="4 5"
                  />
                  {!historyLoaded ? null : history.length > 1 ? (
                    <>
                      <defs>
                        {/* Draws the line in from the left once, when the history first arrives. */}
                        <clipPath id={clipId}>
                          <motion.rect
                            width="600"
                            height="200"
                            style={{ originX: 0 }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.8, ease }}
                          />
                        </clipPath>
                      </defs>
                      <g clipPath={`url(#${clipId})`}>
                        <motion.polygon
                          points={area}
                          fill="#315cf5"
                          fillOpacity="0.12"
                        />
                        <motion.polyline
                          points={line}
                          fill="none"
                          stroke="#315cf5"
                          strokeWidth="3"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    </>
                  ) : (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <path
                        d={`M0 ${chartY(market.probability)}H600`}
                        stroke="#315cf5"
                        strokeDasharray="4 5"
                      />
                      <circle
                        cx="300"
                        cy={chartY(market.probability)}
                        r="5"
                        fill="#315cf5"
                      />
                    </motion.g>
                  )}
                </svg>
              </div>
              <div className="chart-caption">
                <span>
                  {historyError ||
                    (history.length <= 1
                      ? "Starting probability, before any trades"
                      : "YES probability after each trade")}
                </span>
                <span>{market.trades} demo trades</span>
              </div>
              <div className="market-facts">
                <div>
                  <span>Closes at</span>
                  <strong>
                    {new Date(market.closesAt).toLocaleString()}{" "}
                    <small>(your timezone)</small>
                  </strong>
                </div>
                <div>
                  <span>Demo volume</span>
                  <strong>{formatCredits(market.volumeMicros)} credits</strong>
                </div>
              </div>
              <button
                className="detail-rules-link"
                onClick={() => onView("rules")}
              >
                <ShieldCheck size={17} />
                <span>
                  Rules & source <small>{market.sourceName}</small>
                </span>
                <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <>
              <p className="detail-description">{market.description}</p>
              <section className="rules-section">
                <h2>
                  <ShieldCheck size={19} />
                  How this market resolves
                </h2>
                <p>
                  Designated source:{" "}
                  <a href={market.sourceUrl} target="_blank" rel="noreferrer">
                    {market.sourceName}
                    <ExternalLink size={12} />
                  </a>
                </p>
                <div className="resolution-rule">
                  <span className="outcome-label yes">YES</span>
                  <p>{market.yesRule}</p>
                </div>
                <div className="resolution-rule">
                  <span className="outcome-label no">NO</span>
                  <p>{market.noRule}</p>
                </div>
                <details className="review-rule">
                  <summary>
                    <CircleHelp size={16} /> Missing or unclear evidence
                  </summary>
                  <p>{market.invalidRule}</p>
                </details>
                <RuleCheckLine check={market.ruleCheck} />
                <span className="fine-print">
                  Outcomes are proposed with evidence and can be disputed before
                  payout. Payouts are demo credits, never real money.
                </span>
              </section>
            </>
          )}
        </section>
        {view === "forecast" && (
          <aside id="trade-panel" className="trade-panel">
            <div className="trade-panel-heading">
              <h2>Make your forecast</h2>
              <span className="small-pill">Demo</span>
            </div>
            <form onSubmit={(event) => void submit(event)}>
              <div
                className="action-tabs liquid-material"
                role="group"
                aria-label="Trade action"
              >
                {(["buy", "sell"] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    disabled={busy || unconfirmed}
                    aria-pressed={action === item}
                    className={action === item ? "selected" : ""}
                    onClick={() => {
                      if (action !== item) haptic("selection");
                      setAction(item);
                      setTradeError("");
                    }}
                  >
                    {action === item && (
                      <motion.span
                        className="tab-selection"
                        layoutId={`trade-action-${market.id}`}
                        transition={thumbSpring}
                      />
                    )}
                    {item === "buy" ? "Buy shares" : "Sell shares"}
                  </button>
                ))}
              </div>
              <div
                className="outcome-buttons"
                role="group"
                aria-label="Select outcome"
              >
                {(["YES", "NO"] as const).map((side) => (
                  <button
                    type="button"
                    key={side}
                    disabled={busy || unconfirmed}
                    aria-pressed={outcome === side}
                    className={`${side.toLowerCase()} ${outcome === side ? "selected" : ""}`}
                    onClick={() => {
                      if (outcome !== side) haptic("selection");
                      setOutcome(side);
                      setTradeError("");
                    }}
                  >
                    {outcome === side && (
                      <motion.span
                        className="pc-outcome-thumb"
                        layoutId={`trade-outcome-${market.id}`}
                        transition={thumbSpring}
                        aria-hidden="true"
                      />
                    )}
                    <span>{side === "YES" ? "Yes" : "No"}</span>
                    <strong>
                      <AnimatedNumber
                        value={
                          side === "YES"
                            ? market.probability
                            : 1 - market.probability
                        }
                        format={cents}
                      />
                    </strong>
                  </button>
                ))}
              </div>
              <label className="form-label" htmlFor="shares">
                Number of shares{" "}
                <span>{action === "sell" ? `${held} owned` : "1–10,000"}</span>
              </label>
              <div className="shares-input">
                <input
                  id="shares"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  inputMode="numeric"
                  value={shares}
                  disabled={busy || unconfirmed}
                  onChange={(event) => setShares(event.target.value)}
                />
                <span>shares</span>
              </div>
              <div className="quick-amounts">
                {[10, 25, 100, 250].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    disabled={busy || unconfirmed}
                    onClick={() => setShares(String(amount))}
                  >
                    {amount}
                  </button>
                ))}
                {action === "sell" && held > 0 && (
                  <button
                    type="button"
                    disabled={busy || unconfirmed}
                    onClick={() => setShares(String(Math.min(held, 10000)))}
                  >
                    Max
                  </button>
                )}
              </div>
              <div
                className={`trade-breakdown ${shownQuote && !currentQuote ? "pc-pending" : ""}`}
                aria-busy={Boolean(shownQuote && !currentQuote)}
              >
                <div>
                  <span>Average price</span>
                  <strong>
                    {shownQuote ? (
                      <AnimatedNumber
                        value={shownQuote.averagePrice}
                        format={fineCents}
                      />
                    ) : (
                      "—"
                    )}
                  </strong>
                </div>
                <div>
                  <span>
                    {action === "buy" ? "Estimated cost" : "Estimated proceeds"}
                  </span>
                  <strong>
                    {shownQuote ? (
                      <AnimatedNumber
                        value={shownQuote.amountMicros}
                        format={creditsLabel}
                      />
                    ) : (
                      "—"
                    )}
                  </strong>
                </div>
                {!!currentQuote?.feeMicros && (
                  <div>
                    <span>Includes 1% creator fee</span>
                    <strong>
                      {formatCredits(currentQuote.feeMicros)} credits
                    </strong>
                  </div>
                )}
                <div>
                  <span>
                    {action === "buy"
                      ? "Most you pay if the price moves 1%"
                      : "Least you get if the price moves 1%"}
                  </span>
                  <strong>
                    {currentQuote ? formatCredits(limitMicros) : "—"}
                  </strong>
                </div>
                {action === "buy" && (
                  <div className="payout-line">
                    <span>Value if correct (demo)</span>
                    <strong>
                      {validQuantity ? quantity.toLocaleString() : "—"} credits
                    </strong>
                  </div>
                )}
              </div>
              {!validQuantity && (
                <p className="form-error" role="alert">
                  Enter a whole number from 1 to 10,000.
                </p>
              )}
              {(tradeError || quoteError) && (
                <div
                  className={`form-error ${tradeError && shake ? "pc-shake" : ""}`}
                  role="alert"
                  key={tradeError ? `trade-${shake}` : "quote"}
                >
                  <p>{tradeError || quoteError}</p>
                  {!unconfirmed && (
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setTradeError("");
                        setQuoteRevision((value) => value + 1);
                      }}
                    >
                      Refresh quote
                    </button>
                  )}
                </div>
              )}
              {insufficient && validQuantity && (
                <p className="form-error notice-warning">
                  {action === "buy"
                    ? "Insufficient demo credits for this trade."
                    : "You do not own enough shares."}
                </p>
              )}
              <button
                className={`execute-button ${outcome.toLowerCase()} ${filled ? "pc-filled" : ""}`}
                type="submit"
                disabled={
                  busy ||
                  (!unconfirmed &&
                    (!validQuantity ||
                      !currentQuote ||
                      insufficient ||
                      market.status !== "open"))
                }
              >
                {busy
                  ? "Placing trade…"
                  : unconfirmed
                    ? "Retry trade confirmation"
                    : !currentQuote &&
                        validQuantity &&
                        !quoteError &&
                        !lastQuote
                      ? "Getting quote…"
                      : `${action === "buy" ? "Buy" : "Sell"} ${outcome} shares`}
                <span className="pc-trade-icon" aria-hidden="true">
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={tradeIcon}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.18, ease }}
                    >
                      {tradeIcon === "busy" ? (
                        <LoaderCircle size={16} className="pc-spin" />
                      ) : tradeIcon === "filled" ? (
                        <Check size={16} strokeWidth={2.6} />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </button>
              <div className="trade-balance">
                <Wallet size={14} />
                <span>
                  Available:{" "}
                  {portfolio ? (
                    <AnimatedNumber
                      value={portfolio.balanceMicros}
                      format={formatCredits}
                    />
                  ) : (
                    "—"
                  )}{" "}
                  credits
                </span>
              </div>
            </form>
            <p className="trade-disclaimer">
              <ShieldCheck size={15} />
              Demo credits only. No real-money payouts.
            </p>
          </aside>
        )}
        {view === "forecast" && (
          // Secondary panels follow the trade panel in source order, so on a
          // phone the trade form sits right under the chart.
          <div className="detail-secondary">
            <ExplainPanel key={market.id} market={market} />
            <ResolutionPanel
              market={market}
              isCreator={
                portfolio?.created?.some(
                  (item) => item.marketId === market.id,
                ) ?? false
              }
              client={client}
              onChange={onTrade}
              onNotice={onNotice}
              onRule={onRule}
            />
            <TradeFeed feed={feed} />
            <LimitOrders
              market={market}
              portfolio={portfolio}
              client={client}
              onChange={onTrade}
              onNotice={onNotice}
            />
            <Discussion market={market} client={client} />
          </div>
        )}
      </div>
    </div>
  );
}

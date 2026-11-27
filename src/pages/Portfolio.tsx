import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Download } from "lucide-react";
import type { LedgerKind, Market, Portfolio } from "../../shared/types.js";
import { PeakcastClient } from "../../shared/client.js";
import {
  MICRO,
  formatCredits,
  EmptyState,
  errorMessage,
  statusLabel,
} from "../ui.js";
import { AnimatedNumber, ease, rowEnter, rowExit } from "../motion.js";
import { haptic } from "../haptics.js";
import { disintegrate } from "../dust.js";
import "./trading-motion.css";
import "./portfolio.css";
import {
  AccuracyCard,
  BonusSlot,
  DailyBonusCard,
  PerformanceStats,
  PortfolioSummary,
} from "./PortfolioExtras.js";

const ledgerLabels: Record<LedgerKind, string> = {
  trade: "Trade",
  creator_fee: "Creator fee earned",
  launch_stake: "Market launch stake",
  stake_return: "Unused liquidity returned",
  payout: "Resolution payout",
  dispute_bond: "Dispute bond posted",
  bond_return: "Dispute bond returned",
  bond_award: "Dispute bond awarded",
  dispute_reward: "Dispute reward",
  daily_bonus: "Daily bonus",
};

/** How long the "Claimed" confirmation stays before the bonus card turns to dust. */
const BONUS_CONFIRM_MS = 1100;

const signedCredits = (micros: number) =>
  `${micros > 0 ? "+" : ""}${formatCredits(micros)}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Empty states fade up when their tab opens, like the lists do. */
function TabEmpty(props: Parameters<typeof EmptyState>[0]) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease }}
    >
      <EmptyState {...props} />
    </motion.div>
  );
}

interface AndroidWindow {
  PeakcastAndroid?: {
    saveFile(name: string, mimeType: string, text: string): void;
  };
}

type TabId = "positions" | "orders" | "activity" | "watchlist" | "created";

export function PortfolioView({
  portfolio,
  markets,
  onOpen,
  onBrowse,
  client,
  onRefresh,
  onNotice,
}: {
  client: PeakcastClient;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
  portfolio: Portfolio | null;
  markets: Market[];
  onOpen: (id: string) => void;
  onBrowse: () => void;
}) {
  const [tab, setTab] = useState<TabId>("positions");
  const [orderError, setOrderError] = useState("");
  // True for a moment after a claim on this page: the card shows its check,
  // dissolves into dust, then its slot collapses. A bonus already claimed
  // never shows the card at all.
  const [celebrating, setCelebrating] = useState(false);
  const bonusSlot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!celebrating) return;
    let active = true;
    const done = () => {
      if (active) setCelebrating(false);
    };
    const timer = setTimeout(() => {
      const card = bonusSlot.current?.querySelector<HTMLElement>(".bonus-card");
      if (card) void disintegrate(card).then(done, done);
      else done();
    }, BONUS_CONFIRM_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [celebrating]);
  const bonus = portfolio?.bonus;
  const showBonusCard = !!bonus && (bonus.available || celebrating);

  const openOrders = (portfolio?.orders ?? []).filter(
    (order) => order.status === "open",
  ).length;
  // `short` is what fits a phone; the accessible name keeps the full label.
  const tabs: { id: TabId; label: string; short: string; count?: number }[] = [
    {
      id: "positions",
      label: "Open positions",
      short: "Positions",
      count: portfolio?.positions.length ?? 0,
    },
    { id: "orders", label: "Orders", short: "Orders", count: openOrders },
    { id: "activity", label: "Trade activity", short: "Activity" },
    {
      id: "watchlist",
      label: "Watchlist",
      short: "Watchlist",
      count: portfolio?.watchlist?.length,
    },
    {
      id: "created",
      label: "Created markets",
      short: "Created",
      count: portfolio?.created?.length,
    },
  ];
  // Trades already have their own list; the statement covers everything else.
  const statement = (portfolio?.ledger ?? []).filter(
    (entry) => entry.kind !== "trade" && entry.kind !== "creator_fee",
  );
  const watched = (portfolio?.watchlist ?? []).flatMap(
    (id) => markets.find((market) => market.id === id) ?? [],
  );
  const marketTitle = (id?: string) =>
    markets.find((market) => market.id === id)?.title;

  function downloadStatement() {
    // Quote every field; a leading apostrophe stops spreadsheet formulas.
    const cell = (value: string | number) =>
      `"${String(value)
        .replace(/^[=+\-@]/, "'$&")
        .replaceAll('"', '""')}"`;
    const rows = (portfolio?.ledger ?? []).map((entry) =>
      [
        entry.createdAt,
        ledgerLabels[entry.kind],
        marketTitle(entry.marketId) ?? "",
        (entry.amountMicros / MICRO).toFixed(2),
        (entry.balanceMicros / MICRO).toFixed(2),
      ]
        .map(cell)
        .join(","),
    );
    const csv = [
      "Date,Type,Market,Amount (credits),Balance (credits)",
      ...rows,
    ].join("\r\n");
    // The Android WebView cannot save blob downloads; its native bridge can.
    const android = (window as AndroidWindow).PeakcastAndroid;
    if (android)
      return android.saveFile("peakcast-statement.csv", "text/csv", csv);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "peakcast-statement.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function cancelOrder(id: string) {
    setOrderError("");
    void client
      .cancelOrder(id)
      .then(() => {
        haptic("selection");
        return onRefresh();
      })
      .catch((error) => {
        haptic("warning");
        setOrderError(errorMessage(error));
      });
  }

  return (
    <div className="page pf">
      <header className="pf-header">
        <h1>Your portfolio</h1>
        <p>Every forecast, position and demo trade in one place.</p>
      </header>

      <AnimatePresence initial={false}>
        {showBonusCard && (
          <BonusSlot key="bonus" ref={bonusSlot}>
            <DailyBonusCard
              bonus={bonus}
              client={client}
              onRefresh={onRefresh}
              onNotice={onNotice}
              onClaimed={() => setCelebrating(true)}
            />
          </BonusSlot>
        )}
      </AnimatePresence>

      <PortfolioSummary
        portfolio={portfolio}
        bonus={showBonusCard ? undefined : bonus}
      />

      <div className="pf-body">
        <div className="pf-main">
          <div
            className="pf-segments"
            role="group"
            aria-label="Portfolio sections"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "selected" : ""}
                aria-pressed={tab === item.id}
                aria-label={
                  item.count === undefined
                    ? item.label
                    : `${item.label} ${item.count}`
                }
                onClick={(event) => {
                  if (tab !== item.id) haptic("selection");
                  setTab(item.id);
                  // The row can scroll on the narrowest phones; keep the choice in view.
                  event.currentTarget.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                  });
                }}
              >
                {tab === item.id && (
                  <motion.span
                    className="pf-segment-pill"
                    layoutId="portfolio-tab"
                    transition={{ type: "spring", stiffness: 520, damping: 40 }}
                  />
                )}
                <span className="pf-segment-label">{item.short}</span>
                {!!item.count && (
                  <span className="pf-segment-count">{item.count}</span>
                )}
              </button>
            ))}
          </div>

          {tab === "positions" &&
            (portfolio?.positions.length ? (
              <div className="pf-list">
                {/* A position sold to zero fades out; the rows below close the gap. */}
                <AnimatePresence mode="popLayout">
                  {portfolio.positions.map((position, index) => {
                    const pnl = position.valueMicros - position.costMicros;
                    return (
                      <motion.button
                        {...rowEnter(index)}
                        layout="position"
                        exit={rowExit}
                        type="button"
                        className="position-row pf-row"
                        key={`${position.marketId}-${position.outcome}`}
                        onClick={() => onOpen(position.marketId)}
                      >
                        <span
                          className={`pf-chip ${position.outcome.toLowerCase()}`}
                        >
                          {position.outcome}
                        </span>
                        <span className="pf-row-main">
                          <strong className="pf-row-title">
                            {position.title}
                          </strong>
                          <span className="pf-row-meta">
                            {position.shares} shares · avg{" "}
                            {(
                              (position.costMicros / MICRO / position.shares) *
                              100
                            ).toFixed(1)}
                            ¢
                          </span>
                        </span>
                        <span className="pf-row-end">
                          <strong>
                            <AnimatedNumber
                              value={position.valueMicros}
                              format={formatCredits}
                            />
                          </strong>
                          <span className={pnl >= 0 ? "positive" : "negative"}>
                            <AnimatedNumber
                              value={pnl}
                              format={signedCredits}
                            />
                          </span>
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            ) : (
              <TabEmpty
                title="Your first forecast is waiting"
                text="Buy YES or NO shares in a sample market to start building your demo portfolio."
                action={
                  <button className="primary-button" onClick={onBrowse}>
                    Explore markets <ArrowRight size={16} />
                  </button>
                }
              />
            ))}

          {tab === "orders" &&
            (portfolio?.orders?.length ? (
              <div className="pf-list" aria-label="Limit orders">
                {portfolio.orders.map((order, index) => (
                  <motion.div
                    className="activity-row pf-row"
                    key={order.id}
                    {...rowEnter(index)}
                  >
                    <span className={`pf-chip ${order.outcome.toLowerCase()}`}>
                      {order.outcome}
                    </span>
                    <span className="pf-row-main">
                      <strong className="pf-row-title">{order.title}</strong>
                      <span className="pf-row-meta">
                        {order.action === "buy" ? "Buy" : "Sell"}{" "}
                        {order.shares} at {Math.round(order.limitPrice * 100)}¢
                        ·{" "}
                        {order.status === "open"
                          ? "Waiting for price"
                          : order.status === "filled"
                            ? "Filled"
                            : `Cancelled${order.note ? `: ${order.note}` : ""}`}
                      </span>
                    </span>
                    {/* Cancelling swaps the button in place rather than blinking. */}
                    <span className="pf-row-end">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {order.status === "open" ? (
                          <motion.button
                            key="cancel"
                            type="button"
                            className="pf-link"
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={() => cancelOrder(order.id)}
                          >
                            Cancel
                          </motion.button>
                        ) : (
                          <motion.button
                            key="view"
                            type="button"
                            className="pf-link"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => onOpen(order.marketId)}
                          >
                            View
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <TabEmpty
                title="No limit orders"
                text="Place a limit order from any open market to buy or sell at your price."
              />
            ))}
          {tab === "orders" && orderError && (
            <p role="alert" className="form-error pf-error">
              {orderError}
            </p>
          )}

          {tab === "activity" &&
            (portfolio?.trades.length ? (
              <div className="pf-list">
                {portfolio.trades.map((trade, index) => (
                  <motion.button
                    {...rowEnter(index)}
                    type="button"
                    className="activity-row pf-row"
                    key={trade.id}
                    onClick={() => onOpen(trade.marketId)}
                  >
                    <span className="pf-icon" aria-hidden="true">
                      {trade.action === "buy" ? (
                        <ArrowUpRight size={16} />
                      ) : (
                        <ArrowDownLeft size={16} />
                      )}
                    </span>
                    <span className="pf-row-main">
                      <strong>
                        {trade.action === "buy" ? "Bought" : "Sold"}{" "}
                        {trade.shares} {trade.outcome} shares
                      </strong>
                      <span className="pf-row-meta pf-one-line">
                        {marketTitle(trade.marketId) ?? trade.marketId} ·{" "}
                        {when(trade.createdAt)}
                      </span>
                    </span>
                    <span className="pf-row-end">
                      <strong className={trade.action === "buy" ? "" : "positive"}>
                        {trade.action === "buy" ? "−" : "+"}
                        {formatCredits(trade.amountMicros)}
                      </strong>
                    </span>
                  </motion.button>
                ))}
              </div>
            ) : (
              <TabEmpty
                title="No trades yet"
                text="Your completed demo trades will appear here."
              />
            ))}
          {tab === "activity" && !!portfolio?.ledger?.length && (
            <div className="pf-statement">
              <div>
                <h2>Credit statement</h2>
                <p>
                  {statement.length
                    ? "Stakes, fees, payouts and bonds. The CSV also lists every trade."
                    : "Your full history of trades and credits, for a spreadsheet."}
                </p>
              </div>
              <button
                type="button"
                className="pf-link"
                aria-label="Download statement (CSV)"
                onClick={downloadStatement}
              >
                <Download size={14} aria-hidden="true" /> CSV
              </button>
            </div>
          )}
          {tab === "activity" && !!statement.length && (
            <div className="pf-list" aria-label="Credit statement">
              {statement.map((entry, index) => (
                <motion.button
                  {...rowEnter(index)}
                  type="button"
                  className="activity-row pf-row"
                  key={entry.id}
                  disabled={!entry.marketId}
                  onClick={() => entry.marketId && onOpen(entry.marketId)}
                >
                  <span className="pf-icon" aria-hidden="true">
                    {entry.amountMicros < 0 ? (
                      <ArrowUpRight size={16} />
                    ) : (
                      <ArrowDownLeft size={16} />
                    )}
                  </span>
                  <span className="pf-row-main">
                    <strong>{ledgerLabels[entry.kind]}</strong>
                    <span className="pf-row-meta pf-one-line">
                      {marketTitle(entry.marketId) ?? "Account"} ·{" "}
                      {when(entry.createdAt)}
                    </span>
                  </span>
                  <span className="pf-row-end">
                    <strong className={entry.amountMicros < 0 ? "" : "positive"}>
                      {entry.amountMicros < 0 ? "−" : "+"}
                      {formatCredits(Math.abs(entry.amountMicros))}
                    </strong>
                  </span>
                </motion.button>
              ))}
            </div>
          )}

          {tab === "watchlist" &&
            (watched.length ? (
              <div className="pf-list">
                {watched.map((market, index) => (
                  <motion.button
                    {...rowEnter(index)}
                    type="button"
                    className="position-row pf-row"
                    key={market.id}
                    onClick={() => onOpen(market.id)}
                  >
                    <span className="pf-chip neutral">
                      {Math.round(market.probability * 100)}%
                    </span>
                    <span className="pf-row-main">
                      <strong className="pf-row-title">{market.title}</strong>
                      <span className="pf-row-meta">
                        {market.category} · {statusLabel(market)}
                      </span>
                    </span>
                  </motion.button>
                ))}
              </div>
            ) : (
              <TabEmpty
                title="Nothing watched yet"
                text="Tap Watch on a market to keep it here."
              />
            ))}

          {tab === "created" &&
            (portfolio?.created?.length ? (
              <div className="pf-list">
                {portfolio.created.map((market, index) => (
                  <motion.button
                    {...rowEnter(index)}
                    type="button"
                    className="position-row pf-row"
                    key={market.marketId}
                    onClick={() => onOpen(market.marketId)}
                  >
                    <span className="pf-chip neutral">
                      {Math.round(market.probability * 100)}%
                    </span>
                    <span className="pf-row-main">
                      <strong className="pf-row-title">{market.title}</strong>
                      <span className="pf-row-meta">
                        {market.trades} trades ·{" "}
                        {formatCredits(market.volumeMicros)} volume
                      </span>
                    </span>
                    <span className="pf-row-end">
                      <strong className="positive">
                        +{formatCredits(market.feesMicros)}
                      </strong>
                      <span>fees earned</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            ) : (
              <TabEmpty
                title="Launch your own market"
                text="Turn a saved draft into a live market in Draft Studio. You stake 500 demo credits and earn 1% of every trade."
              />
            ))}
        </div>

        <div className="pf-insights">
          <PerformanceStats stats={portfolio?.stats} />
          <AccuracyCard
            client={client}
            resolvedMarkets={portfolio?.stats.resolvedMarkets}
          />
        </div>
      </div>
    </div>
  );
}

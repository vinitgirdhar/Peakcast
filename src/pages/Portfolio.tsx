import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Download,
} from "lucide-react";
import type { LedgerKind, Market, Portfolio } from "../../shared/types.js";
import { WildcatterClient } from "../../shared/client.js";

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
import {
  MICRO,
  formatCredits,
  EmptyState,
  errorMessage,
  statusLabel,
} from "../ui.js";
import { AnimatedNumber, itemMotion, listMotion } from "../motion.js";
import {
  AccuracyCard,
  DailyBonusCard,
  PerformanceStats,
} from "./PortfolioExtras.js";

const signedCredits = (micros: number) =>
  `${micros > 0 ? "+" : ""}${formatCredits(micros)}`;
const reveal = { variants: listMotion, initial: "hidden", animate: "show" };

interface AndroidWindow {
  WildcatterAndroid?: {
    saveFile(name: string, mimeType: string, text: string): void;
  };
}
export function PortfolioView({
  portfolio,
  markets,
  onOpen,
  onBrowse,
  client,
  onRefresh,
  onNotice,
}: {
  client: WildcatterClient;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
  portfolio: Portfolio | null;
  markets: Market[];
  onOpen: (id: string) => void;
  onBrowse: () => void;
}) {
  const [tab, setTab] = useState("positions");
  const [orderError, setOrderError] = useState("");
  const openOrders = (portfolio?.orders ?? []).filter(
    (order) => order.status === "open",
  ).length;
  const tabs = [
    {
      id: "positions",
      label: "Open positions",
      count: portfolio?.positions.length ?? 0,
    },
    { id: "activity", label: "Trade activity" },
    { id: "created", label: "Your markets", count: portfolio?.created?.length },
    { id: "orders", label: "Orders", count: openOrders },
    {
      id: "watchlist",
      label: "Watchlist",
      count: portfolio?.watchlist?.length,
    },
  ];
  // Trades already have their own list; the statement covers everything else.
  const statement = (portfolio?.ledger ?? []).filter(
    (entry) => entry.kind !== "trade" && entry.kind !== "creator_fee",
  );
  const watched = (portfolio?.watchlist ?? []).flatMap(
    (id) => markets.find((market) => market.id === id) ?? [],
  );
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
        markets.find((market) => market.id === entry.marketId)?.title ?? "",
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
    const android = (window as AndroidWindow).WildcatterAndroid;
    if (android)
      return android.saveFile("wildcatter-statement.csv", "text/csv", csv);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "wildcatter-statement.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Your portfolio</h1>
          <p>Every forecast, position and demo trade in one place.</p>
        </div>
        <span className="small-pill">Demo credits</span>
      </div>
      {portfolio && (
        <DailyBonusCard
          bonus={portfolio.bonus}
          client={client}
          onRefresh={onRefresh}
          onNotice={onNotice}
        />
      )}
      <div className="portfolio-stats">
        {[
          { label: "Portfolio value", value: portfolio?.equityMicros },
          { label: "Available balance", value: portfolio?.balanceMicros },
          { label: "Cost of open positions", value: portfolio?.investedMicros },
          { label: "Total profit / loss", value: portfolio?.pnlMicros },
        ].map((item) => {
          const pnl = item.label.includes("loss");
          return (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong
                className={
                  pnl && item.value !== undefined
                    ? item.value >= 0
                      ? "positive"
                      : "negative"
                    : ""
                }
              >
                {item.value === undefined ? (
                  "—"
                ) : (
                  <AnimatedNumber
                    value={item.value}
                    format={pnl ? signedCredits : formatCredits}
                  />
                )}
              </strong>
              <small>credits</small>
            </div>
          );
        })}
      </div>
      <details className="valuation-note">
        <summary>
          <CircleHelp size={14} /> About valuation
        </summary>
        <p>
          Values use the current market price. The final sell quote includes
          price impact.
        </p>
      </details>
      <PerformanceStats stats={portfolio?.stats} />
      <AccuracyCard
        client={client}
        resolvedMarkets={portfolio?.stats.resolvedMarkets}
      />
      <div
        className="category-tabs liquid-material"
        role="group"
        aria-label="Portfolio sections"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "selected" : ""}
            aria-pressed={tab === item.id}
            onClick={(event) => {
              setTab(item.id);
              // Five tabs overflow a phone; keep the chosen one in view.
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            }}
          >
            {tab === item.id && (
              <motion.span className="tab-selection" layoutId="portfolio-tab" />
            )}
            {item.label}
            {item.count !== undefined && (
              <>
                {" "}
                <span className="count-pill">{item.count}</span>
              </>
            )}
          </button>
        ))}
      </div>
      {tab === "positions" &&
        (portfolio?.positions.length ? (
          <motion.div className="positions-list" {...reveal}>
            {portfolio.positions.map((position) => (
              <motion.button
                variants={itemMotion}
                className="position-row"
                key={`${position.marketId}-${position.outcome}`}
                onClick={() => onOpen(position.marketId)}
              >
                <span
                  className={`outcome-label ${position.outcome.toLowerCase()}`}
                >
                  {position.outcome}
                </span>
                <div>
                  <strong>{position.title}</strong>
                  <span>
                    {position.shares} shares · Average cost{" "}
                    {(
                      (position.costMicros / MICRO / position.shares) *
                      100
                    ).toFixed(2)}
                    ¢
                  </span>
                </div>
                <div className="position-value">
                  <strong>{formatCredits(position.valueMicros)} credits</strong>
                  <span
                    className={
                      position.valueMicros >= position.costMicros
                        ? "positive"
                        : "negative"
                    }
                  >
                    {position.valueMicros > position.costMicros ? "+" : ""}
                    {formatCredits(
                      position.valueMicros - position.costMicros,
                    )}{" "}
                    P&L
                  </span>
                </div>
                <ChevronRight size={16} />
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <EmptyState
            title="Your first forecast is waiting"
            text="Buy YES or NO shares in a sample market to start building your demo portfolio."
            action={
              <button className="primary-button" onClick={onBrowse}>
                Explore markets <ArrowRight size={16} />
              </button>
            }
          />
        ))}
      {tab === "activity" &&
        (portfolio?.trades.length ? (
          <motion.div className="activity-list" {...reveal}>
            {portfolio.trades.map((trade) => (
              <motion.button
                variants={itemMotion}
                className="activity-row"
                key={trade.id}
                onClick={() => onOpen(trade.marketId)}
              >
                <span className="soft-icon">
                  {trade.action === "buy" ? (
                    <ArrowUpRight size={19} />
                  ) : (
                    <ArrowDownLeft size={19} />
                  )}
                </span>
                <div>
                  <strong>
                    {trade.action === "buy" ? "Bought" : "Sold"} {trade.shares}{" "}
                    {trade.outcome} shares
                  </strong>
                  <span>
                    {markets.find((market) => market.id === trade.marketId)
                      ?.title ?? trade.marketId}{" "}
                    · {new Date(trade.createdAt).toLocaleString()}
                  </span>
                </div>
                <strong>
                  {trade.action === "buy" ? "−" : "+"}
                  {formatCredits(trade.amountMicros)} credits
                </strong>
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <EmptyState
            title="No trades yet"
            text="Your completed demo trades will appear here."
          />
        ))}
      {tab === "orders" &&
        (portfolio?.orders?.length ? (
          <div className="activity-list" aria-label="Limit orders">
            {portfolio.orders.map((order) => (
              <div className="activity-row" key={order.id}>
                <span
                  className={`outcome-label ${order.outcome.toLowerCase()}`}
                >
                  {order.outcome}
                </span>
                <div>
                  <strong>{order.title}</strong>
                  <span>
                    {order.action === "buy" ? "Buy" : "Sell"} {order.shares} at{" "}
                    {Math.round(order.limitPrice * 100)}¢ ·{" "}
                    {order.status === "open"
                      ? "Waiting for price"
                      : order.status === "filled"
                        ? "Filled"
                        : `Cancelled${order.note ? `: ${order.note}` : ""}`}
                  </span>
                </div>
                {order.status === "open" ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      setOrderError("");
                      void client
                        .cancelOrder(order.id)
                        .then(onRefresh)
                        .catch((error) => setOrderError(errorMessage(error)));
                    }}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    className="text-button"
                    onClick={() => onOpen(order.marketId)}
                  >
                    View
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No limit orders"
            text="Place a limit order from any open market to buy or sell at your price."
          />
        ))}
      {tab === "orders" && orderError && (
        <p role="alert" className="form-error list-error">
          {orderError}
        </p>
      )}
      {tab === "watchlist" &&
        (watched.length ? (
          <div className="positions-list">
            {watched.map((market) => (
              <button
                className="position-row"
                key={market.id}
                onClick={() => onOpen(market.id)}
              >
                <span className="outcome-label yes">
                  {Math.round(market.probability * 100)}%
                </span>
                <div>
                  <strong>{market.title}</strong>
                  <span>
                    {market.category} · {statusLabel(market)}
                  </span>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing watched yet"
            text="Tap Watch on a market to keep it here."
          />
        ))}
      {tab === "activity" && !!portfolio?.ledger?.length && (
        <div className="list-toolbar">
          <div>
            <h2>Credit statement</h2>
            <p>
              {statement.length
                ? "Stakes, fees, payouts and bonds. The CSV also lists every trade."
                : "Your full history of trades and credits, ready for a spreadsheet."}
            </p>
          </div>
          <button className="secondary-button" onClick={downloadStatement}>
            <Download size={15} /> Download statement (CSV)
          </button>
        </div>
      )}
      {tab === "activity" && !!statement.length && (
        <div className="activity-list" aria-label="Credit statement">
          {statement.map((entry) => (
            <button
              className="activity-row"
              key={entry.id}
              disabled={!entry.marketId}
              onClick={() => entry.marketId && onOpen(entry.marketId)}
            >
              <span className="soft-icon">
                {entry.amountMicros < 0 ? (
                  <ArrowUpRight size={19} />
                ) : (
                  <ArrowDownLeft size={19} />
                )}
              </span>
              <div>
                <strong>{ledgerLabels[entry.kind]}</strong>
                <span>
                  {markets.find((market) => market.id === entry.marketId)
                    ?.title ?? "Account"}{" "}
                  · {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
              <strong>
                {entry.amountMicros < 0 ? "−" : "+"}
                {formatCredits(Math.abs(entry.amountMicros))} credits
              </strong>
            </button>
          ))}
        </div>
      )}
      {tab === "created" &&
        (portfolio?.created?.length ? (
          <div className="positions-list">
            {portfolio.created.map((market) => (
              <button
                className="position-row"
                key={market.marketId}
                onClick={() => onOpen(market.marketId)}
              >
                <span className="outcome-label yes">
                  {Math.round(market.probability * 100)}%
                </span>
                <div>
                  <strong>{market.title}</strong>
                  <span>
                    {market.trades} trades ·{" "}
                    {formatCredits(market.volumeMicros)} credits volume
                  </span>
                </div>
                <div className="position-value">
                  <strong>+{formatCredits(market.feesMicros)} credits</strong>
                  <span className="positive">Creator fees earned</span>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Launch your own market"
            text="Turn a saved draft into a live market in Draft Studio. You stake 500 demo credits and earn 1% of every trade."
          />
        ))}
    </div>
  );
}

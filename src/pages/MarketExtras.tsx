import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ChevronDown,
  MessageSquare,
  Star,
  Timer,
} from "lucide-react";
import { Select } from "../Select.js";
import { PeakcastClient } from "../../shared/client.js";
import type {
  Action,
  Market,
  MarketComment,
  MarketTrade,
  Outcome,
  Portfolio,
} from "../../shared/types.js";
import { EmptyState, SkeletonRows, errorMessage, percent } from "../ui.js";
import { Collapse, ease, enterMotion, rowEnter, rowExit } from "../motion.js";
import { haptic } from "../haptics.js";
import "./trading-motion.css";

/** Cross-fades between a list's loading, empty and loaded states. */
export function FadeSwap({
  id,
  children,
}: {
  /** Changes when the content is a different state, not on every refresh. */
  id: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ duration: 0.2, ease }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

interface ExtrasProps {
  market: Market;
  portfolio: Portfolio | null;
  client: PeakcastClient;
  onChange: () => Promise<void>;
  onNotice: (text: string) => void;
}

// Matches the mobile breakpoint in styles.css.
const compactLayout =
  "(max-width: 760px), (pointer: coarse) and (max-width: 1024px)";
const shortTime = (value: string) =>
  new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** One card in the market page's secondary column. Collapsible panels start closed on phones. */
export function DetailPanel({
  title,
  label,
  icon,
  summary,
  collapsible = false,
  children,
}: {
  title: string;
  label?: string;
  icon: ReactNode;
  summary?: ReactNode;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(
    () => !collapsible || !matchMedia(compactLayout).matches,
  );
  const heading = (
    <>
      {icon}
      <span>{title}</span>
      {summary && <span className="panel-summary">{summary}</span>}
    </>
  );
  return (
    <motion.section
      className="resolution-panel"
      aria-label={label ?? title}
      {...enterMotion}
    >
      <h2>
        {collapsible ? (
          <button
            type="button"
            className="panel-toggle"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            onClick={() => setOpen(!open)}
          >
            {heading}
            <ChevronDown size={17} className="panel-chevron" />
          </button>
        ) : (
          heading
        )}
      </h2>
      <Collapse open={open} id={id} className="panel-body">
        {children}
      </Collapse>
    </motion.section>
  );
}

export function TradeFeed({ feed }: { feed: MarketTrade[] | null }) {
  return (
    <DetailPanel title="Recent trades" icon={<Activity size={17} />}>
      <FadeSwap id={feed === null ? "loading" : feed.length ? "list" : "empty"}>
        {feed === null ? (
          <SkeletonRows label="Loading recent trades…" />
        ) : feed.length ? (
          <ul className="trade-feed">
            {/* A new trade slides in on top; the oldest of the eight fades out. */}
            <AnimatePresence mode="popLayout">
              {feed.slice(0, 8).map((trade, index) => (
                <motion.li
                  key={trade.id}
                  {...rowEnter(index)}
                  layout="position"
                  exit={rowExit}
                >
                  <span
                    className={`outcome-label ${trade.outcome.toLowerCase()}`}
                  >
                    {trade.outcome}
                  </span>
                  <span>
                    {trade.trader} {trade.action === "buy" ? "bought" : "sold"}{" "}
                    {trade.shares} shares
                  </span>
                  <span className="row-meta">
                    {percent(trade.probabilityAfter)} ·{" "}
                    <time dateTime={trade.createdAt}>
                      {new Date(trade.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <EmptyState
            compact
            title="No trades yet"
            text="Trades from every forecaster show up here as they happen."
          />
        )}
      </FadeSwap>
    </DetailPanel>
  );
}

export function WatchButton({
  market,
  portfolio,
  client,
  onChange,
  onNotice,
}: ExtrasProps) {
  const watching = portfolio?.watchlist?.includes(market.id) ?? false;
  return (
    <button
      className="back-button watch-button"
      aria-pressed={watching}
      onClick={() => {
        haptic("selection");
        void client
          .setWatching(market.id, !watching)
          .then(onChange)
          .catch((error) => onNotice(errorMessage(error)));
      }}
    >
      {/* The star pops when toggled, not on first render. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(watching)}
          className="watch-star"
          style={{ display: "inline-flex" }}
          initial={{ scale: 0.4, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.05 } }}
          transition={{ type: "spring", stiffness: 600, damping: 18 }}
        >
          <Star size={15} fill={watching ? "currentColor" : "none"} />
        </motion.span>
      </AnimatePresence>
      {watching ? "Watching" : "Watch"}
    </button>
  );
}

export function LimitOrders({
  market,
  portfolio,
  client,
  onChange,
  onNotice,
}: ExtrasProps) {
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [action, setAction] = useState<Action>("buy");
  const [shares, setShares] = useState("25");
  const [cents, setCents] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = (portfolio?.orders ?? []).filter(
    (order) => order.marketId === market.id && order.status === "open",
  );
  const price =
    (outcome === "YES" ? market.probability : 1 - market.probability) * 100;

  async function run(work: () => Promise<string>) {
    setError("");
    setBusy(true);
    try {
      const notice = await work();
      await onChange();
      onNotice(notice);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (market.status !== "open" && !open.length) return null;
  return (
    <DetailPanel
      title="Limit order"
      label="Limit orders"
      icon={<Timer size={17} />}
      summary={open.length ? `${open.length} open` : undefined}
      collapsible
    >
      {market.status === "open" && (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run(async () => {
              const order = await client.placeOrder({
                marketId: market.id,
                outcome,
                action,
                shares: Number(shares),
                limitPrice: Number(cents) / 100,
              });
              setCents("");
              return order.status === "filled"
                ? "Limit order filled at once."
                : order.status === "cancelled"
                  ? `Order cancelled: ${order.note ?? "it could not be covered."}`
                  : "Limit order placed. It fills when the price arrives.";
            });
          }}
        >
          <p className="panel-hint">
            Pick your price and walk away. The order fills on its own once the
            average price per share reaches it. Credits are checked then, not
            held now.
          </p>
          <div className="order-fields">
            <div>
              <span className="form-label">Side</span>
              <Select
                label="Order side"
                value={action}
                onChange={(value) => setAction(value as Action)}
                options={[
                  { value: "buy", label: "Buy" },
                  { value: "sell", label: "Sell" },
                ]}
              />
            </div>
            <div>
              <span className="form-label">Outcome</span>
              <Select
                label="Order outcome"
                value={outcome}
                onChange={(value) => setOutcome(value as Outcome)}
                options={[
                  { value: "YES", label: "YES" },
                  { value: "NO", label: "NO" },
                ]}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="order-shares">
                Shares
              </label>
              <input
                className="text-input"
                id="order-shares"
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                step={1}
                required
                value={shares}
                onChange={(event) => setShares(event.target.value)}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="order-price">
                {action === "buy" ? "Max price (¢)" : "Min price (¢)"}
              </label>
              <input
                className="text-input"
                id="order-price"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                step={1}
                required
                aria-describedby="order-price-hint"
                placeholder={String(Math.round(price))}
                value={cents}
                onChange={(event) => setCents(event.target.value)}
              />
              <small className="field-hint" id="order-price-hint">
                {outcome} trades at {price.toFixed(1)}¢ now
              </small>
            </div>
          </div>
          <button className="secondary-button" disabled={busy}>
            Place limit order
          </button>
        </form>
      )}
      {/* The list itself fades out with the last cancelled order. */}
      <AnimatePresence initial={false}>
        {!!open.length && (
          <motion.ul
            className="order-list"
            aria-label="Your open orders"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.16, ease } }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {open.map((order) => (
                <motion.li
                  key={order.id}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={rowExit}
                >
                  <span
                    className={`outcome-label ${order.outcome.toLowerCase()}`}
                  >
                    {order.outcome}
                  </span>
                  <span>
                    {order.action === "buy" ? "Buy" : "Sell"} {order.shares} at{" "}
                    {Math.round(order.limitPrice * 100)}¢
                  </span>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await client.cancelOrder(order.id);
                        return "Order cancelled.";
                      })
                    }
                  >
                    Cancel
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </DetailPanel>
  );
}

export function Discussion({
  market,
  client,
}: Pick<ExtrasProps, "market" | "client">) {
  const [comments, setComments] = useState<MarketComment[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void client
      .comments(market.id)
      .then((data) => {
        if (active) setComments(data.items);
      })
      .catch((error) => {
        if (active) {
          setError(errorMessage(error));
          setComments((current) => current ?? []);
        }
      });
    return () => {
      active = false;
    };
  }, [client, market.id]);

  return (
    <DetailPanel
      title="Discussion"
      icon={<MessageSquare size={17} />}
      summary={
        comments?.length
          ? `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`
          : undefined
      }
      collapsible
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError("");
          setBusy(true);
          void client
            .addComment(market.id, body)
            .then((comment) => {
              setComments((current) => [comment, ...(current ?? [])]);
              setBody("");
            })
            .catch((error) => setError(errorMessage(error)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="form-label" htmlFor="comment-body">
          Share your reasoning
          <span aria-hidden="true">{body.length}/500</span>
        </label>
        <textarea
          className="text-input"
          id="comment-body"
          rows={2}
          maxLength={500}
          required
          placeholder="What do you expect, and why?"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button className="secondary-button" disabled={busy || !body.trim()}>
          Post comment
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <FadeSwap
        id={comments === null ? "loading" : comments.length ? "list" : "empty"}
      >
        {comments === null ? (
          <SkeletonRows label="Loading comments…" count={2} />
        ) : comments.length ? (
          <ul className="comment-list">
            <AnimatePresence mode="popLayout">
              {comments.map((comment, index) => (
                <motion.li
                  key={comment.id}
                  {...rowEnter(index)}
                  layout="position"
                >
                  <div>
                    <strong>
                      {comment.trader}
                      {comment.you && " (you)"}
                    </strong>
                    {comment.holds && (
                      <span
                        className={`outcome-label ${comment.holds.toLowerCase()}`}
                      >
                        Holds {comment.holds}
                      </span>
                    )}
                    <time className="row-meta" dateTime={comment.createdAt}>
                      {shortTime(comment.createdAt)}
                    </time>
                  </div>
                  <p>{comment.body}</p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          !error && (
            <EmptyState
              compact
              title="No comments yet"
              text="Be the first to explain your forecast."
            />
          )
        )}
      </FadeSwap>
    </DetailPanel>
  );
}

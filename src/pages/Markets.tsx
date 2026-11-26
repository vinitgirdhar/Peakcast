import { Select } from "../Select.js";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Search,
  Clock3,
} from "lucide-react";
import type { Market } from "../../shared/types.js";
import {
  ChangeChip,
  date,
  moveLabel,
  percent,
  EmptyState,
  statusLabel,
  formatCredits,
} from "../ui.js";
const categories = [
  "All markets",
  "Economy",
  "Technology",
  "Crypto",
  "Science",
  "Climate",
  "World",
];
import { AnimatePresence, motion } from "motion/react";
import { AnimatedNumber, ease } from "../motion.js";
import { rowEnter } from "../motion.js";
import { haptic } from "../haptics.js";
import { isAndroidApp } from "../platform.js";
import "./trading-motion.css";

const cents = (value: number) => `${(value * 100).toFixed(1)}¢`;
const whole = (value: number) => String(Math.round(value));
const cardExit = { opacity: 0, scale: 0.96, transition: { duration: 0.14 } };
const emptyEnter = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease },
} as const;

// ponytail: module flag, so the card cascade plays once per app launch, not on every tab return.
let gridShown = false;

export function MarketExplorer({
  markets,
  onOpen,
  onStudio,
  embedded = false,
}: {
  markets: Market[];
  onOpen: (market: Market) => void;
  onStudio: () => void;
  /** Inside another page (a workspace), which supplies the heading. */
  embedded?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All markets");
  const [sort, setSort] = useState("featured");
  const [page, setPage] = useState(1);
  const filtered = markets.filter(
    (market) =>
      (category === "All markets" || market.category === category) &&
      `${market.title} ${market.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const ordered = [...filtered].sort((a, b) =>
    sort === "probability"
      ? b.probability - a.probability
      : sort === "closing"
        ? Date.parse(a.closesAt) - Date.parse(b.closesAt)
        : sort === "activity"
          ? b.volumeMicros - a.volumeMicros
          : sort === "movers"
            ? Math.abs(b.change24h) - Math.abs(a.change24h)
            : 0,
  );
  const featured = markets[0];
  const openMarkets = markets.filter(
    (market) =>
      market.status === "open" && Date.parse(market.closesAt) > Date.now(),
  );
  const closingNext = [...openMarkets]
    .sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt))
    .slice(0, 3);
  const volume = markets.reduce(
    (total, market) => total + market.volumeMicros,
    0,
  );
  const trades = markets.reduce((total, market) => total + market.trades, 0);
  const [stagger] = useState(() => !gridShown);
  useEffect(() => {
    if (markets.length) gridShown = true;
  }, [markets.length]);
  const pages = Math.max(1, Math.ceil(ordered.length / 6));
  const currentPage = Math.min(page, pages);
  return (
    <div className={embedded ? "explorer" : "page explorer"}>
      {!embedded && (
        <div className="page-heading">
          <div>
            <h1>Markets</h1>
            <p>Explore what happens next.</p>
          </div>
          {/* The Android app drafts from the dock's + button instead. */}
          {!isAndroidApp && (
            <button className="primary-button" onClick={onStudio}>
              <Plus size={17} /> Draft a market
            </button>
          )}
        </div>
      )}

      <div className="overview-row">
        {/* The Android app opens straight into the list, like a native finance app. */}
        {featured && !isAndroidApp && (
          <motion.button
            className="featured-market"
            onClick={() => onOpen(featured)}
            initial={stagger ? { opacity: 0, y: 10, scale: 0.985 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease }}
          >
            <div className="feature-content">
              <span className="feature-kicker">
                <span className="feature-dot" />
                In focus <span>{featured.category}</span>
              </span>
              <h2>{featured.title}</h2>
              <div className="feature-bottom">
                <span>
                  Explore the forecast <ArrowRight size={15} />
                </span>
                <span>Closes {date(featured.closesAt)}</span>
              </div>
            </div>
            <div className="feature-art" aria-hidden="true">
              <div className="feature-probability">
                <AnimatedNumber value={featured.probability} format={percent} />
                <small>chance of YES</small>
              </div>
            </div>
            <div className="market-pulse" aria-label="Market activity">
              <span>
                <strong>{openMarkets.length}</strong>
                <small>Open questions</small>
              </span>
              <span>
                <strong>{trades.toLocaleString("en-US")}</strong>
                <small>Demo trades</small>
              </span>
              <span>
                <strong>{formatCredits(volume, 0)}</strong>
                <small>Volume in credits</small>
              </span>
            </div>
          </motion.button>
        )}
        <motion.section
          className="market-radar"
          aria-label="Closing next"
          initial={stagger ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease }}
        >
          <div className="radar-heading">
            <h2>Closing next</h2>
            <Clock3 size={17} />
          </div>
          {closingNext.length ? (
            closingNext.map((market) => (
              <button key={market.id} onClick={() => onOpen(market)}>
                <span className="radar-question">{market.title}</span>
                <span className="radar-meta">
                  <time dateTime={market.closesAt}>
                    {date(market.closesAt)}
                  </time>
                  <strong>
                    <AnimatedNumber
                      value={market.probability}
                      format={percent}
                    />{" "}
                    <small>YES</small>
                  </strong>
                </span>
              </button>
            ))
          ) : (
            <p>
              No upcoming deadlines. Explore settled markets or draft a new
              question.
            </p>
          )}
        </motion.section>
      </div>

      <div className="market-toolbar">
        <div className="section-title">
          <h2>Explore markets</h2>
          <span className="count-pill">
            <AnimatedNumber value={filtered.length} format={whole} />
          </span>
        </div>
        <div className="market-controls">
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="Search markets…"
              aria-label="Search markets"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="sort-field">
            <span className="sr-only">Sort markets</span>
            <Select
              label="Sort markets"
              value={sort}
              onChange={(value) => {
                setSort(value);
                setPage(1);
              }}
              options={[
                { value: "featured", label: "Featured" },
                { value: "activity", label: "Most activity" },
                { value: "movers", label: "Biggest movers" },
                { value: "probability", label: "Highest probability" },
                { value: "closing", label: "Closing soon" },
              ]}
            />
          </div>
        </div>
      </div>
      <div
        className="category-tabs"
        role="group"
        aria-label="Market categories"
      >
        {categories.map((item) => (
          <button
            key={item}
            className={category === item ? "selected" : ""}
            aria-pressed={category === item}
            onClick={(event) => {
              if (category !== item) haptic("selection");
              setCategory(item);
              setPage(1);
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            }}
          >
            {category === item && (
              <motion.span
                className="tab-selection"
                layoutId="market-category"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            {item === "All markets" && <LayoutGrid size={14} />}
            {item}
          </button>
        ))}
      </div>
      {ordered.length ? (
        <motion.div className="market-grid">
          {/* Filter, sort, search and paging: leaving cards fade out of flow while the rest glide to their new slots. */}
          <AnimatePresence mode="popLayout">
            {ordered
              .slice((currentPage - 1) * 6, currentPage * 6)
              .map((market, index) => (
                <MarketCard
                  key={market.id}
                  // The first launch cascades the cards; later visits and filtering fade them in together.
                  index={stagger ? index : 0}
                  market={market}
                  onOpen={() => onOpen(market)}
                />
              ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <motion.div {...emptyEnter}>
          <EmptyState
            title="No markets match"
            text="Try a different search or category."
            action={
              <button
                className="secondary-button"
                onClick={() => {
                  setSearch("");
                  setCategory("All markets");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            }
          />
        </motion.div>
      )}
      {pages > 1 && (
        <nav className="market-pagination" aria-label="Market pages">
          <button
            className="icon-button"
            aria-label="Previous markets"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={19} />
          </button>
          <span aria-live="polite">
            {currentPage} of {pages}
          </span>
          <button
            className="icon-button"
            aria-label="Next markets"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={19} />
          </button>
        </nav>
      )}
    </div>
  );
}

function MarketCard({
  market,
  index,
  onOpen,
}: {
  market: Market;
  index: number;
  onOpen: () => void;
}) {
  const move = moveLabel(market.change24h);
  return (
    <motion.button
      layout
      {...rowEnter(index)}
      exit={cardExit}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18, ease }}
      className="market-card"
      onClick={onOpen}
      aria-label={`${market.title} ${percent(market.probability)} chance of YES${move ? `, ${move.toLowerCase()}` : ""}`}
    >
      <div className="market-card-top">
        <span className="market-symbol" style={{ background: market.color }}>
          {market.symbol}
        </span>
        <span className="category-label">{market.category}</span>
        <ArrowUpRight size={16} className="card-arrow" />
      </div>
      <h3>{market.title}</h3>
      <div className="market-probability">
        <strong>
          <AnimatedNumber value={market.probability} format={percent} />
        </strong>
        <span>
          <span className="probability-label">chance of </span>YES
        </span>
        <ChangeChip change={market.change24h} />
        <span className="market-open">{statusLabel(market)}</span>
      </div>
      <div className="probability-track">
        <span
          className="pc-bar"
          style={{ transform: `scaleX(${market.probability})` }}
        />
      </div>
      <div className="binary-prices">
        <span>
          Yes{" "}
          <strong>
            <AnimatedNumber value={market.probability} format={cents} />
          </strong>
        </span>
        <span>
          No{" "}
          <strong>
            <AnimatedNumber value={1 - market.probability} format={cents} />
          </strong>
        </span>
      </div>
      <div className="market-card-footer">
        <span>{market.category}</span>
        <span>{date(market.closesAt)}</span>
      </div>
    </motion.button>
  );
}

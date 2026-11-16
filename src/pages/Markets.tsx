import { Select } from "../Select.js";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Search,
} from "lucide-react";
import type { Market } from "../../shared/types.js";
import {
  ChangeChip,
  date,
  moveLabel,
  percent,
  EmptyState,
  statusLabel,
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
import { motion } from "motion/react";
import { useLiquidGlass } from "../useLiquidGlass.js";
import { ease, itemMotion, listMotion } from "../motion.js";

export function MarketExplorer({
  markets,
  onOpen,
  onStudio,
}: {
  markets: Market[];
  onOpen: (market: Market) => void;
  onStudio: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All markets");
  const [sort, setSort] = useState("featured");
  const [page, setPage] = useState(1);
  const categoryGlass = useLiquidGlass<HTMLDivElement>();
  const createGlass = useLiquidGlass<HTMLButtonElement>();
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
  const pages = Math.max(1, Math.ceil(ordered.length / 6));
  const currentPage = Math.min(page, pages);
  return (
    <div className="page explorer">
      <div className="page-heading">
        <div>
          <h1>Markets</h1>
          <p>What happens next? Explore a forecast.</p>
        </div>
        <button
          ref={createGlass}
          className="secondary-button liquid-material"
          onClick={onStudio}
        >
          <Plus size={17} /> Draft a market
        </button>
      </div>

      <div className="overview-row">
        {featured && (
          <button className="featured-market" onClick={() => onOpen(featured)}>
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
              <div className="orbital orbit-one" />
              <div className="orbital orbit-two" />
              <div className="orbital orbit-three" />
              <div className="feature-probability">
                {percent(featured.probability)}
                <small>chance of YES</small>
              </div>
            </div>
          </button>
        )}
      </div>

      <div className="market-toolbar">
        <div className="section-title">
          <h2>Explore markets</h2>
          <span className="count-pill">{filtered.length}</span>
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
        ref={categoryGlass}
        className="category-tabs liquid-material"
        role="group"
        aria-label="Market categories"
      >
        {categories.map((item) => (
          <button
            key={item}
            className={category === item ? "selected" : ""}
            aria-pressed={category === item}
            onClick={(event) => {
              setCategory(item);
              setPage(1);
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            }}
          >
            {item === "All markets" && <LayoutGrid size={14} />}
            {item}
          </button>
        ))}
      </div>
      {ordered.length ? (
        <motion.div
          className="market-grid"
          variants={listMotion}
          initial="hidden"
          animate="show"
        >
          {ordered
            .slice((currentPage - 1) * 6, currentPage * 6)
            .map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                onOpen={() => onOpen(market)}
              />
            ))}
        </motion.div>
      ) : (
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
  onOpen,
}: {
  market: Market;
  onOpen: () => void;
}) {
  const move = moveLabel(market.change24h);
  return (
    <motion.button
      layout="position"
      variants={itemMotion}
      whileHover={{ y: -3 }}
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
        <strong>{percent(market.probability)}</strong>
        <span>
          <span className="probability-label">chance of </span>YES
        </span>
        <ChangeChip change={market.change24h} />
        <span className="market-open">{statusLabel(market)}</span>
      </div>
      <div className="probability-track">
        <span style={{ width: percent(market.probability) }} />
      </div>
      <div className="binary-prices">
        <span>
          Yes <strong>{(market.probability * 100).toFixed(1)}¢</strong>
        </span>
        <span>
          No <strong>{((1 - market.probability) * 100).toFixed(1)}¢</strong>
        </span>
      </div>
      <div className="market-card-footer">
        <span>{market.category}</span>
        <span>{date(market.closesAt)}</span>
      </div>
    </motion.button>
  );
}

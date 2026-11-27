import { useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { PeakcastClient } from "../../../shared/client.js";
import type { Outcome, Quote } from "../../../shared/types.js";
import {
  MAX_SHARES,
  edgeAt,
  type Multiplier,
  type Sizing,
} from "../../../shared/micro/sizer.js";
import { AnimatedNumber, Collapse, enterMotion } from "../../motion.js";
import { errorMessage, formatCredits } from "../../ui.js";

export const MULTIPLIER_LABELS: Record<Multiplier, string> = {
  0.25: "¼ Kelly",
  0.5: "½ Kelly",
  1: "Full Kelly",
};

export const points = (value: number): string => (value * 100).toFixed(1);
const percentOf = (value: number): string => `${(value * 100).toFixed(1)}%`;
const cents = (value: number): string => `${(value * 100).toFixed(1)}¢`;
const creditsText = (micros: number): string =>
  `${formatCredits(micros)} practice credits`;

/** What the result card shows: a prompt, a validation hint, or a sizing. */
export type ResultView =
  | { kind: "prompt" }
  | { kind: "invalid"; message: string }
  | { kind: "sized"; sizing: Sizing; multiplier: Multiplier };

export interface QuoteTarget {
  client: PeakcastClient;
  marketId: string;
}

interface SizerResultProps {
  view: ResultView;
  /** Set in market mode: enables the read-only quote check. */
  quoteTarget: QuoteTarget | null;
}

export function SizerResult({ view, quoteTarget }: SizerResultProps) {
  return (
    <section
      className="sizer-card sizer-result"
      aria-labelledby="sizer-result-title"
    >
      <h2 id="sizer-result-title" className="sizer-card-title">
        Kelly stake
      </h2>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view.kind} {...enterMotion}>
          {view.kind === "prompt" && (
            <p className="sizer-quiet">
              Enter your probability of YES to see which side has an edge and
              how much Kelly would stake.
            </p>
          )}
          {view.kind === "invalid" && (
            <p className="sizer-quiet">{view.message}</p>
          )}
          {view.kind === "sized" && (
            <Sized
              sizing={view.sizing}
              multiplier={view.multiplier}
              quoteTarget={quoteTarget}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function Sized({
  sizing,
  multiplier,
  quoteTarget,
}: {
  sizing: Sizing;
  multiplier: Multiplier;
  quoteTarget: QuoteTarget | null;
}) {
  if (!sizing.side)
    return (
      <p className="sizer-headline">
        {sizing.feeKillsEdge
          ? "No edge at this price. Your belief is within the fee of the market, so Kelly stakes 0."
          : "No edge at this price. Your belief matches the market, so Kelly stakes 0."}
      </p>
    );
  const side = sizing.side;
  return (
    <>
      <p className="sizer-headline">
        Buy <SideTag side={side} />: edge {points(sizing.edge)} points after
        fees
      </p>
      <div className="sizer-stake">
        <span className="sizer-stake-label">Stake</span>
        <strong>
          <AnimatedNumber value={sizing.stakeMicros} format={formatCredits} />
        </strong>
        <span>practice credits</span>
      </div>
      {sizing.cap && (
        <p className="sizer-cap">
          Capped at {MAX_SHARES.toLocaleString("en-US")} shares, the most one
          trade can buy. Those cost about {creditsText(sizing.cap.costMicros)}.
        </p>
      )}
      <Figures sizing={sizing} multiplier={multiplier} />
      <Notes sizing={sizing} multiplier={multiplier} />
      {quoteTarget && sizing.shares > 0 && (
        <QuoteCheck
          key={`${quoteTarget.marketId}:${side}`}
          target={quoteTarget}
          side={side}
          shares={sizing.shares}
          beliefSide={sizing.beliefSide}
        />
      )}
    </>
  );
}

function SideTag({ side }: { side: Outcome }) {
  return <strong className={`sizer-side ${side.toLowerCase()}`}>{side}</strong>;
}

function Figures({
  sizing,
  multiplier,
}: {
  sizing: Sizing;
  multiplier: Multiplier;
}) {
  const rows: [string, string][] = [
    ["Full Kelly fraction", percentOf(sizing.kellyFraction)],
    [
      `Applied (${MULTIPLIER_LABELS[multiplier]})`,
      percentOf(sizing.appliedFraction),
    ],
    [
      "Shares, about",
      sizing.shares > 0
        ? `${sizing.shares.toLocaleString("en-US")} at ${cents(sizing.effectivePrice)}`
        : "Less than one share",
    ],
    sizing.cap
      ? [
          `Expected profit on ${MAX_SHARES.toLocaleString("en-US")} shares`,
          `+${creditsText(sizing.cap.expectedProfitMicros)}`,
        ]
      : ["Expected profit", `+${creditsText(sizing.expectedProfitMicros)}`],
    [
      "Expected growth per bet",
      `${sizing.expectedGrowth >= 0 ? "+" : ""}${(sizing.expectedGrowth * 100).toFixed(2)}%`,
    ],
  ];
  return (
    <dl className="sizer-figures">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Notes({
  sizing,
  multiplier,
}: {
  sizing: Sizing;
  multiplier: Multiplier;
}) {
  const belief = percentOf(sizing.blendedBelief);
  return (
    <div className="sizer-notes">
      {multiplier < 1 && (
        <p>
          {MULTIPLIER_LABELS[multiplier]} bets as if your belief
          {sizing.side === "NO" ? " in NO" : ""} were {belief}.
        </p>
      )}
      <p>
        Full Kelly assumes your probability is right. If you are overconfident,
        it overbets.
      </p>
    </div>
  );
}

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; quote: Quote }
  | { status: "error"; message: string };

/**
 * Read-only: asks for a quote and never places a trade. Keyed by market and
 * side; when the share count moves (typing, or the 15 s price refresh) the
 * last quote stays on screen, marked stale, until it is checked again.
 */
function QuoteCheck({
  target,
  side,
  shares,
  beliefSide,
}: {
  target: QuoteTarget;
  side: Outcome;
  shares: number;
  beliefSide: number;
}) {
  const [state, setState] = useState<QuoteState>({ status: "idle" });
  const check = async () => {
    setState({ status: "loading" });
    try {
      const quote = await target.client.quote({
        marketId: target.marketId,
        outcome: side,
        action: "buy",
        shares,
      });
      setState({ status: "done", quote });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  };
  const busy = state.status === "loading";
  const stale = state.status === "done" && state.quote.shares !== shares;
  return (
    <div className="sizer-quote">
      <button
        type="button"
        className="secondary-button sizer-quote-button"
        disabled={busy}
        aria-describedby="sizer-quote-hint"
        onClick={() => void check()}
      >
        {busy ? (
          <LoaderCircle size={16} className="pc-spin" aria-hidden="true" />
        ) : (
          <Search size={16} aria-hidden="true" />
        )}
        {busy ? "Checking…" : "Check with a quote"}
      </button>
      <p id="sizer-quote-hint" className="sizer-hint">
        Prices {shares.toLocaleString("en-US")} {side} shares on this device.
        Nothing is bought.
      </p>
      <Collapse open={state.status === "done" || state.status === "error"}>
        {state.status === "done" && (
          <div className={stale ? "sizer-stale" : undefined}>
            {stale && (
              <p className="sizer-hint">
                Your stake changed since this quote for{" "}
                {state.quote.shares.toLocaleString("en-US")} shares. Check again
                to price {shares.toLocaleString("en-US")}.
              </p>
            )}
            <QuoteFigures quote={state.quote} side={side} belief={beliefSide} />
          </div>
        )}
        {state.status === "error" && (
          <div className="form-error" role="alert">
            <p>{state.message}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => void check()}
            >
              Try again
            </button>
          </div>
        )}
      </Collapse>
    </div>
  );
}

function QuoteFigures({
  quote,
  side,
  belief,
}: {
  quote: Quote;
  side: Outcome;
  belief: number;
}) {
  const edge = edgeAt(belief, quote.averagePrice);
  const after = side === "YES" ? quote.priceAfter : 1 - quote.priceAfter;
  return (
    <div className="sizer-quote-result">
      <dl className="sizer-figures">
        <div>
          <dt>Average price, fee included</dt>
          <dd>
            <AnimatedNumber value={quote.averagePrice} format={cents} />
          </dd>
        </div>
        <div>
          <dt>Total cost</dt>
          <dd>{creditsText(quote.amountMicros)}</dd>
        </div>
        <div>
          <dt>{side} price after</dt>
          <dd>{cents(after)}</dd>
        </div>
      </dl>
      <p
        className={`form-error ${edge > 0 ? "notice-success" : "notice-warning"}`}
      >
        <span>
          {edge > 0
            ? `The edge survives price impact: ${points(edge)} points.`
            : "Price impact eats the edge at this size; try a smaller multiplier."}
        </span>
      </p>
    </div>
  );
}

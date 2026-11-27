import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  crowdSentence,
  formatProbability,
  movedSentence,
  type UpdateOk,
  type UpdateResult,
} from "../../../shared/micro/bayes.js";
import type { Market } from "../../../shared/types.js";
import { AnimatedNumber } from "../../motion.js";
import { BitsBar } from "./BitsBar.js";

/** The value after it has stopped changing for `delay` ms. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** Settled text for the live region; empty until it first differs from the value on open, so opening the app announces nothing. */
function useAnnouncement(text: string, delay: number): string {
  const [initial] = useState(text);
  const [changed, setChanged] = useState(false);
  if (!changed && text !== initial) setChanged(true);
  const settled = useSettled(text, delay);
  return changed ? settled : "";
}

interface ResultProps {
  result: UpdateResult;
  /** The last valid result, shown greyed out while a field is invalid. */
  lastGood: UpdateOk | null;
  market?: Market;
  navigate: (path: string) => void;
}

function MarketLink({
  market,
  posterior,
  navigate,
}: {
  market: Market;
  posterior: number;
  navigate: (path: string) => void;
}) {
  return (
    <div className="bayes-crowd">
      <p>{crowdSentence(posterior, market.probability)}</p>
      <div className="bayes-crowd-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate(`/markets/${market.id}`)}
        >
          <ExternalLink size={16} aria-hidden="true" />
          Open market
        </button>
        <p className="bayes-hint">
          Size it in{" "}
          <button
            type="button"
            className="bayes-link"
            onClick={() => navigate("/apps/sizer")}
          >
            Stake sizer
          </button>{" "}
          at /apps/sizer.
        </p>
      </div>
    </div>
  );
}

export function Result({ result, lastGood, market, navigate }: ResultProps) {
  const shown = result.ok ? result : lastGood;
  // While a field is invalid the text stays on the last posterior, so nothing new is announced.
  const announced = useAnnouncement(
    shown ? `Posterior ${formatProbability(shown.posterior)}` : "",
    300,
  );
  return (
    <section
      className="bayes-card bayes-result"
      aria-labelledby="bayes-result-h"
    >
      <h2 id="bayes-result-h">Posterior</h2>
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>
      {!result.ok && <p className="bayes-fix">Fix the highlighted fields</p>}
      <div
        className={result.ok ? "bayes-result-body" : "bayes-result-body stale"}
        aria-disabled={result.ok ? undefined : true}
      >
        <p className="bayes-posterior">
          {shown ? (
            <AnimatedNumber
              value={shown.posterior}
              format={formatProbability}
            />
          ) : (
            "—"
          )}
        </p>
        {shown && (
          <>
            <p className="bayes-moved">{movedSentence(shown)}</p>
            <BitsBar result={shown} />
            {market && result.ok && (
              <MarketLink
                market={market}
                posterior={shown.posterior}
                navigate={navigate}
              />
            )}
          </>
        )}
      </div>
      <p className="bayes-caveat">
        Multiplying ratios assumes each piece of evidence is independent given
        the outcome. If two items share a cause, count it once.
      </p>
    </section>
  );
}

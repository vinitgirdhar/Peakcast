import { useEffect, useRef, useState } from "react";
import {
  BAR_BITS,
  formatProbability,
  logit2,
  signed,
  type UpdateOk,
} from "../../../shared/micro/bayes.js";

const ticks = [0.01, 0.1, 0.5, 0.9, 0.99] as const;
const pad = 14;
const trackY = 30;
const stepGap = 14;

/** Width of an element in CSS pixels, so the SVG draws crisp text and arrowheads at any size. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(200, Math.round(entry.contentRect.width))),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function summary(result: UpdateOk): string {
  const moves = result.steps.length;
  return (
    `Log-odds scale from ${-BAR_BITS} to +${BAR_BITS} bits. ` +
    `Prior ${formatProbability(result.prior)} at ${signed(logit2(result.prior), 1)} bits; ` +
    `posterior ${formatProbability(result.posterior)} at ${signed(result.totalBits, 1)} bits` +
    (moves ? ` after ${moves} ${moves === 1 ? "step" : "steps"}.` : ".")
  );
}

interface Arrow {
  key: string;
  from: number;
  to: number;
  y: number;
}

function StepArrow({ from, to, y }: Omit<Arrow, "key">) {
  const direction = to >= from ? 1 : -1;
  const className = direction > 0 ? "bayes-arrow up" : "bayes-arrow down";
  if (Math.abs(to - from) < 6)
    return <circle className={className} cx={to} cy={y} r={2.5} />;
  return (
    <g className={className}>
      <line x1={from} y1={y} x2={to - direction * 5} y2={y} />
      <polygon
        points={`${to},${y} ${to - direction * 7},${y - 4} ${to - direction * 7},${y + 4}`}
      />
    </g>
  );
}

/** Prior, posterior and one arrow per piece of evidence on a −10…+10 bit scale. */
export function BitsBar({ result }: { result: UpdateOk }) {
  const [ref, width] = useWidth(560);
  const x = (bits: number) =>
    pad +
    ((Math.min(Math.max(bits, -BAR_BITS), BAR_BITS) + BAR_BITS) /
      (2 * BAR_BITS)) *
      (width - 2 * pad);
  let running = logit2(result.prior);
  const arrows: Arrow[] = result.steps.map((step, index) => {
    const from = x(running);
    running += step.bits;
    return { key: step.id, from, to: x(running), y: 52 + index * stepGap };
  });
  const height = 52 + Math.max(arrows.length, 1) * stepGap;
  return (
    <div className="bayes-bar" ref={ref}>
      <svg
        role="img"
        aria-label={summary(result)}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          className="bayes-track"
          x1={pad}
          x2={width - pad}
          y1={trackY}
          y2={trackY}
        />
        {ticks.map((p) => (
          <g key={p} className="bayes-tick">
            <line x1={x(logit2(p))} x2={x(logit2(p))} y1={24} y2={36} />
            <text x={x(logit2(p))} y={14} textAnchor="middle">
              {Math.round(p * 100)}%
            </text>
          </g>
        ))}
        {arrows.map(({ key, ...arrow }) => (
          <StepArrow key={key} {...arrow} />
        ))}
        <circle
          className="bayes-prior-dot"
          cx={x(logit2(result.prior))}
          cy={trackY}
          r={6}
        />
        <circle
          className="bayes-posterior-dot"
          cx={x(result.totalBits)}
          cy={trackY}
          r={7}
        />
      </svg>
      <p className="bayes-bar-legend" aria-hidden="true">
        <span className="bayes-legend-prior">Prior</span>
        <span className="bayes-legend-posterior">Posterior</span>
        <span className="bayes-legend-up">Toward YES</span>
        <span className="bayes-legend-down">Toward NO</span>
      </p>
    </div>
  );
}

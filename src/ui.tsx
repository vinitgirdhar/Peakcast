import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Layers3 } from "lucide-react";
import {
  moveLabel,
  movePoints,
  percent,
  statusLabel,
} from "../shared/format.js";

export { moveLabel, percent, statusLabel };
export const MICRO = 1_000_000;
export const formatCredits = (micros: number, digits = 2) =>
  (micros / MICRO).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
export const date = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
export function ChangeChip({ change }: { change: number }) {
  const label = moveLabel(change);
  if (!label) return null;
  const up = change > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  const points = movePoints(change);
  return (
    <span className={`change-chip ${up ? "up" : "down"}`}>
      <Arrow size={12} strokeWidth={2.6} aria-hidden="true" />
      <span aria-hidden="true">
        {points}
        <span className="change-unit"> {points === 1 ? "pt" : "pts"}</span>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
export function BrandMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="m6 11 4.5 12L16 9l5.5 14L26 11"
        stroke="var(--on-selected, white)"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  text,
  action,
  compact = false,
}: {
  title: string;
  text: string;
  action?: ReactNode;
  /** Inline variant for use inside a panel that already has its own heading. */
  compact?: boolean;
}) {
  const Heading = compact ? "h3" : "h2";
  return (
    <div className={compact ? "empty-state compact" : "empty-state"}>
      {!compact && <Layers3 size={32} />}
      <Heading>{title}</Heading>
      <p>{text}</p>
      {action}
    </div>
  );
}

/** Placeholder rows while a list loads; screen readers hear the label only. */
export function SkeletonRows({
  label,
  count = 3,
}: {
  label: string;
  count?: number;
}) {
  return (
    <div className="skeleton-rows" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <span className="skeleton-row" aria-hidden="true" key={index}>
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </span>
      ))}
    </div>
  );
}

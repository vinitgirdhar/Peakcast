import { useId, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Layers3 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedNumber } from "./motion.js";
import {
  moveLabel,
  movePoints,
  percent,
  statusLabel,
} from "../shared/format.js";
import "./forms-motion.css";

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
const roundPoints = (value: number) => String(Math.round(value));
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
        <AnimatedNumber value={points} format={roundPoints} />
        <span className="change-unit"> {points === 1 ? "pt" : "pts"}</span>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
/** The Peakcast app icon: a price line that becomes a peak, dotted on to a rising sun. */
export function BrandMark() {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="brand-mark"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#6A8DFF" />
          <stop offset="0.55" stopColor="#4B4BE8" />
          <stop offset="1" stopColor="#2E1FAE" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FFF1C2" />
          <stop offset="0.5" stopColor="#FFC94D" />
          <stop offset="1" stopColor="#FF8A3D" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="8.5" fill={`url(#${id}-bg)`} />
      <path
        d="M6.25 22.25 11.6 16.3l2.85 2.45 5.55-7"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.25 22.25 11.6 16.3l2.85 2.45 5.55-7 6.2 12h-19.95Z"
        fill="white"
        fillOpacity="0.22"
      />
      <circle cx="22" cy="10.4" r="0.85" fill="white" fillOpacity="0.85" />
      <circle cx="25.9" cy="7.6" r="2.3" fill={`url(#${id}-sun)`} />
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

/** Copy icon that morphs into a check while a copy confirmation is showing. */
export function CopyStateIcon({ copied }: { copied: boolean }) {
  return (
    <span className="copy-state-icon" aria-hidden="true">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={copied ? "check" : "copy"}
          initial={{ opacity: 0, scale: 0.4, rotate: copied ? -45 : 45 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={{ type: "spring", stiffness: 520, damping: 26 }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

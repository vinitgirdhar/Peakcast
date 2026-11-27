import { motion } from "motion/react";
import { haptic } from "../haptics.js";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  /** Optional badge, e.g. how many items a tab holds. */
  count?: number;
}

interface SegmentsProps<T extends string | number> {
  /** Accessible group name; or pass `labelledBy` to point at a visible label. */
  label?: string;
  labelledBy?: string;
  /** Unique per control, so the sliding pill never jumps between groups. */
  layoutId: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** The app's segmented control, shared by every micro app: aria-pressed buttons with a sliding pill. */
export function Segments<T extends string | number>({
  label,
  labelledBy,
  layoutId,
  options,
  value,
  onChange,
  className,
}: SegmentsProps<T>) {
  return (
    <div
      className={className ? `micro-segments ${className}` : "micro-segments"}
      role="group"
      aria-label={label}
      aria-labelledby={labelledBy}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={selected ? "selected" : ""}
            aria-pressed={selected}
            aria-label={
              option.count === undefined
                ? undefined
                : `${option.label} ${option.count}`
            }
            onClick={() => {
              if (selected) return;
              haptic("selection");
              onChange(option.value);
            }}
          >
            {selected && (
              <motion.span
                className="micro-segment-pill"
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
                aria-hidden="true"
              />
            )}
            <span className="micro-segment-label">{option.label}</span>
            {!!option.count && (
              <span className="micro-segment-count" aria-hidden="true">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

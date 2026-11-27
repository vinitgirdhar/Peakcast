// Small building blocks shared by the journal's forms.
import { oneInLabel } from "../../../shared/micro/journal.js";

/** A field error, tied to its input with aria-describedby; announced on submit. */
export function FieldError({ id, text }: { id: string; text: string }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="form-error journal-field-error">
      {text}
    </p>
  );
}

export interface PercentFieldProps {
  id: string;
  label: string;
  value: string;
  error: string;
  onChange: (value: string) => void;
}

/** Whole percent 1–99: a number box and a paired slider, with "about 1 in N". */
export function PercentField({
  id,
  label,
  value,
  error,
  onChange,
}: PercentFieldProps) {
  const pct = Number(value);
  const hint = oneInLabel(pct);
  const describedBy = [`${id}-hint`, error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="journal-field">
      <label className="form-label" htmlFor={id} id={`${id}-label`}>
        {label}
      </label>
      <div className="journal-percent">
        <span className="journal-percent-box">
          <input
            id={id}
            className="text-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            step={1}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
          />
          <span aria-hidden="true">%</span>
        </span>
        <input
          className="journal-range"
          type="range"
          min={1}
          max={99}
          step={1}
          value={Number.isFinite(pct) && pct >= 1 && pct <= 99 ? pct : 50}
          aria-labelledby={`${id}-label`}
          aria-valuetext={`${value || 50}%`}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <p className="journal-hint" id={`${id}-hint`}>
        {hint || "Whole percent from 1 to 99"}
      </p>
      <FieldError id={`${id}-error`} text={error} />
    </div>
  );
}

export interface NoteFieldProps {
  id: string;
  value: string;
  error: string;
  onChange: (value: string) => void;
}

export function NoteField({ id, value, error, onChange }: NoteFieldProps) {
  const left = 280 - value.trim().length;
  return (
    <div className="journal-field">
      <label className="form-label" htmlFor={id}>
        Why? <span>Optional</span>
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        placeholder="What makes you think so?"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`}
        onChange={(event) => onChange(event.target.value)}
      />
      <p
        className={`journal-hint journal-count${left < 0 ? " over" : ""}`}
        id={`${id}-count`}
      >
        {left >= 0 ? `${left} characters left` : `${-left} characters over`}
      </p>
      <FieldError id={`${id}-error`} text={error} />
    </div>
  );
}

/** Today's local calendar date, `days` ahead, as YYYY-MM-DD. */
export function localDay(days = 0, from: Date = new Date()): string {
  const day = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + days,
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export const timeLabel = (iso: string): string => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "Unknown time"
    : at.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

export const dayLabel = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

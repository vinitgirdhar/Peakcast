import { forwardRef, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  MAX_EVIDENCE,
  MAX_LABEL,
  errorFor,
  formatProbability,
  formatRatio,
  likelihoodRatio,
  messages,
  signed,
  type FieldError,
  type Step,
} from "../../../shared/micro/bayes.js";
import { rowEnter, rowExit } from "../../motion.js";
import { Segments } from "../Segments.js";
import { rowName, toEvidence, type DraftRow } from "./draft.js";

const modes = [
  { value: "ratio", label: "Ratio" },
  { value: "chances", label: "Two chances" },
] as const;
const presets = [
  ["½", "0.5"],
  ["2", "2"],
  ["3", "3"],
  ["10", "10"],
] as const;

interface FieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  suffix?: string;
  onChange: (value: string) => void;
}

/** A labelled numeric text field with its inline error tied by aria-describedby. */
export function NumberField({
  id,
  label,
  value,
  error,
  suffix,
  onChange,
}: FieldProps) {
  return (
    <div className="bayes-field">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <div className="bayes-input-wrap" data-suffix={suffix}>
        <input
          id={id}
          className="text-input"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="bayes-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

interface RowProps {
  row: DraftRow;
  index: number;
  count: number;
  step?: Step;
  errors: readonly FieldError[];
  onChange: (row: DraftRow) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}

function Readout({ row, step }: { row: DraftRow; step?: Step }) {
  const ratio = likelihoodRatio(toEvidence(row));
  if (ratio === null) return null;
  return (
    <p className="bayes-readout">
      <span>{formatRatio(ratio)}</span>
      <span>{signed(Math.log2(ratio), 2)} bits</span>
      {step && <span>now {formatProbability(step.probabilityAfter)}</span>}
    </p>
  );
}

function RatioInputs({
  row,
  errors,
  onChange,
}: Pick<RowProps, "row" | "errors" | "onChange">) {
  const set = (key: "ratio" | "ifYes" | "ifNo") => (value: string) =>
    onChange({ ...row, [key]: value });
  if (row.mode === "ratio")
    return (
      <div className="bayes-ratio">
        <NumberField
          id={`${row.id}-ratio`}
          label="Likelihood ratio (×)"
          value={row.ratio}
          error={errorFor(errors, `${row.id}.ratio`)}
          onChange={set("ratio")}
        />
        <div className="bayes-presets" role="group" aria-label="Ratio presets">
          {presets.map(([label, value]) => (
            <button
              key={value}
              type="button"
              className="bayes-chip"
              aria-pressed={row.ratio === value}
              onClick={() => onChange({ ...row, ratio: value })}
            >
              ×{label}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="bayes-chances">
      <NumberField
        id={`${row.id}-yes`}
        label="If YES, how likely is this?"
        suffix="%"
        value={row.ifYes}
        error={errorFor(errors, `${row.id}.ifYes`)}
        onChange={set("ifYes")}
      />
      <NumberField
        id={`${row.id}-no`}
        label="If NO, how likely is this?"
        suffix="%"
        value={row.ifNo}
        error={errorFor(errors, `${row.id}.ifNo`)}
        onChange={set("ifNo")}
      />
    </div>
  );
}

const EvidenceRow = forwardRef<HTMLLIElement, RowProps>(
  function EvidenceRow(props, ref) {
    const { row, index, count, onChange, onMove, onRemove } = props;
    const name = rowName(row, index);
    return (
      <motion.li
        ref={ref}
        className="bayes-row"
        {...rowEnter(index)}
        layout="position"
        exit={rowExit}
      >
        <div className="bayes-row-head">
          <label className="sr-only" htmlFor={`${row.id}-label`}>
            Label for evidence {index + 1}
          </label>
          <input
            id={`${row.id}-label`}
            className="text-input bayes-label-input"
            placeholder={`Evidence ${index + 1}`}
            maxLength={MAX_LABEL}
            value={row.label}
            onChange={(event) =>
              onChange({ ...row, label: event.target.value })
            }
          />
          <div className="bayes-row-actions">
            <button
              type="button"
              className="bayes-icon-button"
              id={`${row.id}-up`}
              aria-label={`Move ${name} up`}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUp size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="bayes-icon-button"
              id={`${row.id}-down`}
              aria-label={`Move ${name} down`}
              disabled={index === count - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDown size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="bayes-icon-button danger"
              aria-label={`Remove ${name}`}
              onClick={onRemove}
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
        <Segments
          label={`How to weigh ${name}`}
          value={row.mode}
          options={modes}
          onChange={(mode) => onChange({ ...row, mode })}
          layoutId={`${row.id}-mode`}
        />
        <RatioInputs row={row} errors={props.errors} onChange={onChange} />
        <Readout row={row} step={props.step} />
      </motion.li>
    );
  },
);

interface ListProps {
  rows: readonly DraftRow[];
  steps: readonly Step[];
  errors: readonly FieldError[];
  onRows: (rows: DraftRow[]) => void;
  onAdd: () => void;
  onRemoved: () => void;
  /** Focuses an element by id once it has rendered. */
  onFocus: (id: string) => void;
  addRef: RefObject<HTMLButtonElement | null>;
}

const moved = (rows: readonly DraftRow[], from: number, to: number) => {
  const next = rows.filter((_, index) => index !== from);
  return [...next.slice(0, to), rows[from], ...next.slice(to)];
};

/** After a move, keep focus on the same arrow, or the other one once the row reaches an end and it is disabled. */
const arrowAfterMove = (
  id: string,
  to: number,
  count: number,
  offset: -1 | 1,
): string => {
  const sameEnabled = offset < 0 ? to > 0 : to < count - 1;
  const up = sameEnabled === offset < 0;
  return `${id}-${up ? "up" : "down"}`;
};

export function EvidenceList({
  rows,
  steps,
  errors,
  onRows,
  onAdd,
  onRemoved,
  onFocus,
  addRef,
}: ListProps) {
  const full = rows.length >= MAX_EVIDENCE;
  return (
    <section
      className="bayes-card bayes-evidence"
      aria-labelledby="bayes-evidence-h"
    >
      <div className="bayes-card-head">
        <h2 id="bayes-evidence-h">Evidence</h2>
        <span className="bayes-count">
          {rows.length} of {MAX_EVIDENCE}
        </span>
      </div>
      {rows.length === 0 && (
        <p className="bayes-hint bayes-empty">
          No evidence yet. For each thing you learn, ask how much more likely
          you would see it if the answer is YES than if it is NO.
        </p>
      )}
      <ol className="bayes-rows">
        <AnimatePresence mode="popLayout" initial={false}>
          {rows.map((row, index) => (
            <EvidenceRow
              key={row.id}
              row={row}
              index={index}
              count={rows.length}
              step={steps.find((step) => step.id === row.id)}
              errors={errors}
              onChange={(next) =>
                onRows(rows.map((item) => (item.id === row.id ? next : item)))
              }
              onMove={(offset) => {
                const to = index + offset;
                onRows(moved(rows, index, to));
                onFocus(arrowAfterMove(row.id, to, rows.length, offset));
              }}
              onRemove={() => {
                onRows(rows.filter((item) => item.id !== row.id));
                onRemoved();
              }}
            />
          ))}
        </AnimatePresence>
      </ol>
      <button
        ref={addRef}
        type="button"
        className="secondary-button bayes-add"
        disabled={full}
        aria-describedby={full ? "bayes-full" : undefined}
        onClick={onAdd}
      >
        <Plus size={17} aria-hidden="true" />
        Add evidence
      </button>
      {full && (
        <p id="bayes-full" className="bayes-hint">
          {messages.count}
        </p>
      )}
    </section>
  );
}

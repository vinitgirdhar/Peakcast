// "New forecast": on a Peakcast market or on your own question.
import { useState, type FormEvent } from "react";
import { Select } from "../../Select.js";
import { percent } from "../../ui.js";
import {
  MESSAGES,
  addCustomQuestion,
  addMarketForecast,
  shiftYears,
  type JournalResult,
  type JournalState,
} from "../../../shared/micro/journal.js";
import type { Market } from "../../../shared/types.js";
import { FieldError, NoteField, PercentField, localDay } from "./fields.js";
import { Segments } from "../Segments.js";

export type Commit = (result: JournalResult, notice: string) => string | null;
type Field = "pct" | "note" | "title" | "checkBy" | "form";
export type FieldErrors = Partial<Record<Field, string>>;

/** Puts a pure-module message under the input it is about. */
export function errorsFor(error: string | null): FieldErrors {
  if (!error) return {};
  const field: Field =
    error === MESSAGES.pct
      ? "pct"
      : error === MESSAGES.note
        ? "note"
        : error === MESSAGES.title || error === MESSAGES.duplicate
          ? "title"
          : error === MESSAGES.checkBy
            ? "checkBy"
            : "form";
  return { [field]: error };
}

type Kind = "market" | "custom";
const kinds = [
  { value: "market", label: "Peakcast market" },
  { value: "custom", label: "Own question" },
] as const;

export const openMarkets = (markets: readonly Market[]): Market[] =>
  markets
    .filter((market) => market.status === "open")
    .sort((a, b) => a.closesAt.localeCompare(b.closesAt));

interface JournalFormProps {
  state: JournalState;
  markets: readonly Market[];
  commit: Commit;
}

export function JournalForm({ state, markets, commit }: JournalFormProps) {
  const [kind, setKind] = useState<Kind>("market");
  const [marketId, setMarketId] = useState("");
  const [title, setTitle] = useState("");
  const [checkBy, setCheckBy] = useState(() => localDay(30));
  const [pct, setPct] = useState("60");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const open = openMarkets(markets);
  const market = open.find((item) => item.id === marketId) ?? open[0];
  const today = localDay();

  const edit =
    (field: Field, set: (value: string) => void) => (value: string) => {
      set(value);
      if (errors[field] || errors.form) setErrors({});
    };

  function result(now: string): JournalResult | null {
    if (kind === "market")
      return market
        ? addMarketForecast(state, market, Number(pct), note, now)
        : null;
    return addCustomQuestion(
      state,
      { uuid: crypto.randomUUID(), title, checkBy, pct: Number(pct), note },
      now,
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const outcome = result(new Date().toISOString());
    if (!outcome) return;
    const error = commit(outcome, "Forecast saved.");
    setErrors(errorsFor(error));
    if (error) return;
    setNote("");
    if (kind === "custom") setTitle("");
  }

  return (
    <section className="journal-card journal-new" aria-labelledby="journal-new">
      <h2 id="journal-new">New forecast</h2>
      <Segments
        label="Forecast on"
        layoutId="journal-kind"
        options={kinds}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setErrors({});
        }}
      />
      <form noValidate onSubmit={submit}>
        {kind === "market" ? (
          <MarketPicker
            open={open}
            market={market}
            onPick={(id) => {
              setMarketId(id);
              setErrors({});
            }}
          />
        ) : (
          <>
            <div className="journal-field">
              <label className="form-label" htmlFor="journal-title">
                Question
              </label>
              <textarea
                id="journal-title"
                rows={2}
                value={title}
                maxLength={240}
                placeholder="Will … happen by …?"
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={`journal-title-hint${errors.title ? " journal-title-error" : ""}`}
                onChange={(event) =>
                  edit("title", setTitle)(event.target.value)
                }
              />
              <p className="journal-hint" id="journal-title-hint">
                Write it so a stranger could resolve it: what, by when,
                according to whom.
              </p>
              <FieldError id="journal-title-error" text={errors.title ?? ""} />
            </div>
            <div className="journal-field">
              <label className="form-label" htmlFor="journal-check-by">
                Check by
              </label>
              <input
                id="journal-check-by"
                className="text-input"
                type="date"
                min={today}
                max={shiftYears(today, 5)}
                value={checkBy}
                aria-invalid={errors.checkBy ? true : undefined}
                aria-describedby={
                  errors.checkBy ? "journal-check-by-error" : undefined
                }
                onChange={(event) =>
                  edit("checkBy", setCheckBy)(event.target.value)
                }
              />
              <FieldError
                id="journal-check-by-error"
                text={errors.checkBy ?? ""}
              />
            </div>
          </>
        )}
        {(kind === "custom" || market) && (
          <>
            <PercentField
              id="journal-pct"
              label="Your probability of YES"
              value={pct}
              error={errors.pct ?? ""}
              onChange={edit("pct", setPct)}
            />
            <NoteField
              id="journal-note"
              value={note}
              error={errors.note ?? ""}
              onChange={edit("note", setNote)}
            />
            {errors.form && (
              <p role="alert" className="form-error">
                {errors.form}
              </p>
            )}
            <button className="primary-button journal-save" type="submit">
              Save forecast
            </button>
          </>
        )}
      </form>
    </section>
  );
}

function MarketPicker({
  open,
  market,
  onPick,
}: {
  open: Market[];
  market: Market | undefined;
  onPick: (id: string) => void;
}) {
  if (!market)
    return (
      <p className="notice-info journal-notice">
        No open markets right now. Add your own question instead.
      </p>
    );
  return (
    <div className="journal-field">
      <label className="form-label" htmlFor="journal-market">
        Market
      </label>
      <div className="journal-market">
        <Select
          id="journal-market"
          label="Market"
          value={market.id}
          onChange={onPick}
          options={open.map((item) => ({ value: item.id, label: item.title }))}
        />
        <span className="journal-crowd">
          <small>Crowd now</small>
          <strong>{percent(market.probability)}</strong>
        </span>
      </div>
    </div>
  );
}

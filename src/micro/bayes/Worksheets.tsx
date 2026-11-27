import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FilePlus2, Trash2 } from "lucide-react";
import {
  MAX_WORKSHEETS,
  checkTitle,
  defaultTitle,
  deleteWorksheet,
  formatProbability,
  parseNumber,
  saveWorksheet,
  type BayesState,
  type Worksheet,
} from "../../../shared/micro/bayes.js";
import { date } from "../../ui.js";
import { rowEnter, rowExit } from "../../motion.js";
import { saveMicro } from "../storage.js";
import {
  fromEvidence,
  newId,
  percentText,
  storedEvidence,
  type DraftRow,
} from "./draft.js";

/** The worksheet being edited, as typed. */
export interface Draft {
  /** Id of the saved worksheet it was loaded from, if any. */
  id: string | null;
  title: string;
  prior: string;
  marketId: string;
  rows: DraftRow[];
}

interface WorksheetsProps {
  state: BayesState;
  onState: (state: BayesState) => void;
  draft: Draft;
  /** False while any field is invalid. */
  valid: boolean;
  marketTitle?: string;
  onTitle: (title: string) => void;
  onSaved: (id: string | null) => void;
  onLoad: (draft: Draft) => void;
  onReset: () => void;
  onNotice: (text: string) => void;
}

const toDraft = (sheet: Worksheet): Draft => ({
  id: sheet.id,
  title: sheet.title,
  prior: percentText(sheet.prior),
  marketId: sheet.marketId ?? "",
  rows: sheet.evidence.map(fromEvidence),
});

const toSheet = (draft: Draft, id: string, title: string): Worksheet => ({
  id,
  title,
  prior: parseNumber(draft.prior) / 100,
  ...(draft.marketId ? { marketId: draft.marketId } : {}),
  evidence: draft.rows.map(storedEvidence),
  updatedAt: new Date().toISOString(),
});

const pieces = (count: number) =>
  `${count} ${count === 1 ? "piece" : "pieces"} of evidence`;

type SaveError = { field: "title" | "fields"; text: string };

export function Worksheets(props: WorksheetsProps) {
  const { state, draft, valid, onNotice } = props;
  const [error, setError] = useState<SaveError | null>(null);
  const shownError = error?.field === "fields" && valid ? null : error;

  const persist = (next: BayesState, notice: string): boolean => {
    if (!saveMicro("bayes", next)) {
      onNotice(
        "Could not save on this device. Storage may be full or blocked.",
      );
      return false;
    }
    props.onState(next);
    onNotice(notice);
    return true;
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!valid)
      return setError({
        field: "fields",
        text: "Fix the highlighted fields before saving.",
      });
    const checked = checkTitle(
      draft.title.trim() ? draft.title : defaultTitle(props.marketTitle),
    );
    if (!checked.ok) return setError({ field: "title", text: checked.error });
    setError(null);
    const sheet = toSheet(draft, draft.id ?? newId("ws"), checked.title);
    if (!persist(saveWorksheet(state, sheet), "Worksheet saved.")) return;
    props.onSaved(sheet.id);
    props.onTitle(sheet.title);
  };
  const remove = (sheet: Worksheet) => {
    if (!persist(deleteWorksheet(state, sheet.id), "Worksheet deleted."))
      return;
    if (draft.id === sheet.id) props.onSaved(null);
    // The row and its button are gone; keep keyboard focus in the panel.
    document.getElementById("bayes-title")?.focus();
  };

  return (
    <section
      className="bayes-card bayes-sheets"
      aria-labelledby="bayes-sheets-h"
    >
      <div className="bayes-card-head">
        <h2 id="bayes-sheets-h">Saved worksheets</h2>
        <span className="bayes-count">
          {state.worksheets.length} of {MAX_WORKSHEETS}
        </span>
      </div>
      <form className="bayes-save" onSubmit={save} noValidate>
        <div className="bayes-field">
          <label className="form-label" htmlFor="bayes-title">
            Title
          </label>
          <input
            id="bayes-title"
            className="text-input"
            placeholder={defaultTitle(props.marketTitle)}
            value={draft.title}
            aria-invalid={shownError?.field === "title"}
            aria-describedby={shownError ? "bayes-save-error" : undefined}
            onChange={(event) => {
              props.onTitle(event.target.value);
              if (error?.field === "title") setError(null);
            }}
          />
        </div>
        <button type="submit" className="primary-button">
          {draft.id ? "Save changes" : "Save"}
        </button>
      </form>
      {shownError && (
        <p id="bayes-save-error" role="alert" className="form-error">
          {shownError.text}
        </p>
      )}
      {draft.id && (
        <p className="bayes-hint bayes-editing">
          Saving updates this worksheet.{" "}
          <button type="button" className="bayes-link" onClick={props.onReset}>
            <FilePlus2 size={15} aria-hidden="true" />
            Start a new one
          </button>
        </p>
      )}
      {state.worksheets.length === 0 ? (
        <p className="bayes-hint bayes-empty">Saved worksheets appear here.</p>
      ) : (
        <ul className="bayes-sheet-list">
          <AnimatePresence mode="popLayout" initial={false}>
            {state.worksheets.map((sheet, index) => (
              <motion.li
                key={sheet.id}
                className={draft.id === sheet.id ? "current" : undefined}
                {...rowEnter(index)}
                layout="position"
                exit={rowExit}
              >
                <div className="bayes-sheet-text">
                  <strong>{sheet.title}</strong>
                  <span>
                    Prior {formatProbability(sheet.prior)} ·{" "}
                    {pieces(sheet.evidence.length)} · {date(sheet.updatedAt)}
                  </span>
                </div>
                <button
                  type="button"
                  className="secondary-button bayes-load"
                  aria-label={`Load ${sheet.title}`}
                  onClick={() => props.onLoad(toDraft(sheet))}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="bayes-icon-button danger"
                  aria-label={`Delete ${sheet.title}`}
                  onClick={() => remove(sheet)}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

// An expanded question: its history, an update form and its actions.
import { useState, type FormEvent } from "react";
import { ExternalLink } from "lucide-react";
import { percent } from "../../ui.js";
import {
  deleteQuestion,
  reopenCustom,
  resolveCustom,
  updateForecast,
  type JournalOutcome,
  type JournalQuestion,
  type JournalState,
} from "../../../shared/micro/journal.js";
import type { Market } from "../../../shared/types.js";
import { errorsFor, type Commit, type FieldErrors } from "./JournalForm.js";
import { NoteField, PercentField, timeLabel } from "./fields.js";

const outcomeLabel: Record<JournalOutcome, string> = {
  YES: "YES",
  NO: "NO",
  VOID: "Void",
};

export interface QuestionDetailProps {
  question: JournalQuestion;
  /** The linked market, when it is on this device's list. */
  market?: Market;
  state: JournalState;
  commit: Commit;
  navigate: (path: string) => void;
  /** Called after a delete or resolve saved, so the list can keep focus when this row leaves. */
  onSettled: (questionId: string) => void;
}

export function QuestionDetail(props: QuestionDetailProps) {
  const { question: q, market } = props;
  const editable =
    q.kind === "custom" ? !q.resolution : market?.status === "open";
  return (
    <div className="journal-detail">
      <History question={q} />
      {editable ? (
        <UpdateForm {...props} />
      ) : (
        q.kind === "market" && (
          <p className="journal-hint">
            {market
              ? "This market is no longer open for forecasts."
              : "Not on this device's market list, so it is not scored."}
          </p>
        )
      )}
      <Actions {...props} />
    </div>
  );
}

function History({ question }: { question: JournalQuestion }) {
  return (
    <ol className="journal-history" aria-label="Forecast history, oldest first">
      {question.forecasts.map((forecast, index) => (
        <li key={`${forecast.at}-${index}`}>
          <span className="journal-history-time">{timeLabel(forecast.at)}</span>
          <strong>{forecast.pct}%</strong>
          {forecast.crowd !== undefined && (
            <span className="journal-history-crowd">
              crowd {percent(forecast.crowd)}
            </span>
          )}
          {forecast.note && (
            <p className="journal-history-note">{forecast.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

const domId = (id: string) => `journal-${id.replace(/[^a-zA-Z0-9-]/g, "-")}`;

function UpdateForm({ question, market, state, commit }: QuestionDetailProps) {
  const last = question.forecasts[question.forecasts.length - 1];
  const [pct, setPct] = useState(String(last?.pct ?? 50));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const id = domId(question.id);

  function submit(event: FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();
    const result = updateForecast(
      state,
      question.id,
      Number(pct),
      note,
      now,
      market,
    );
    const error = commit(result, "Forecast updated.");
    setErrors(errorsFor(error));
    if (!error) setNote("");
  }
  const clear = (set: (value: string) => void) => (value: string) => {
    set(value);
    setErrors({});
  };

  return (
    <form className="journal-update" noValidate onSubmit={submit}>
      <h3>Update forecast</h3>
      <PercentField
        id={`${id}-pct`}
        label="New probability of YES"
        value={pct}
        error={errors.pct ?? ""}
        onChange={clear(setPct)}
      />
      <NoteField
        id={`${id}-note`}
        value={note}
        error={errors.note ?? ""}
        onChange={clear(setNote)}
      />
      {errors.form && (
        <p role="alert" className="form-error">
          {errors.form}
        </p>
      )}
      <button className="secondary-button" type="submit">
        Save update
      </button>
    </form>
  );
}

function Actions({
  question: q,
  market,
  state,
  commit,
  navigate,
  onSettled,
}: QuestionDetailProps) {
  const [confirming, setConfirming] = useState(false);
  const settle = (error: string | null) => {
    if (!error) onSettled(q.id);
  };
  const resolve = (outcome: JournalOutcome) =>
    settle(
      commit(
        resolveCustom(state, q.id, outcome, new Date().toISOString()),
        `Resolved ${outcomeLabel[outcome]}.`,
      ),
    );
  return (
    <div className="journal-actions">
      {q.kind === "market" && market && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate(`/markets/${market.id}`)}
        >
          Open market <ExternalLink size={14} aria-hidden="true" />
        </button>
      )}
      {q.kind === "custom" && !q.resolution && (
        <ResolveButtons title={q.title} onResolve={resolve} />
      )}
      {q.kind === "custom" && q.resolution && (
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            settle(commit(reopenCustom(state, q.id), "Question reopened."))
          }
        >
          Reopen
        </button>
      )}
      {confirming ? (
        <span
          className="journal-confirm"
          role="group"
          aria-label="Confirm delete"
        >
          <span>Delete this question?</span>
          <button
            type="button"
            className="secondary-button journal-danger"
            onClick={() =>
              settle(
                commit(
                  { ok: true, state: deleteQuestion(state, q.id) },
                  "Question deleted.",
                ),
              )
            }
          >
            Delete
          </button>
          <button
            type="button"
            className="secondary-button"
            autoFocus
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="secondary-button journal-delete"
          onClick={() => setConfirming(true)}
        >
          Delete…
        </button>
      )}
    </div>
  );
}

/** YES, NO and Void, each labelled with the question for screen readers. */
export function ResolveButtons({
  title,
  onResolve,
}: {
  title: string;
  onResolve: (outcome: JournalOutcome) => void;
}) {
  return (
    <span
      className="journal-resolve"
      role="group"
      aria-label={`Resolve “${title}”`}
    >
      {(["YES", "NO", "VOID"] as const).map((outcome) => (
        <button
          key={outcome}
          type="button"
          className={`secondary-button journal-outcome ${outcome.toLowerCase()}`}
          onClick={() => onResolve(outcome)}
        >
          {outcomeLabel[outcome]}
        </button>
      ))}
    </span>
  );
}

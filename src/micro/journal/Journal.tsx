// Forecast journal: write down probabilities, update them, get scored.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { enterMotion } from "../../motion.js";
import { loadMicro, saveMicro } from "../storage.js";
import type { MicroAppProps } from "../types.js";
import {
  dueQuestions,
  parseJournal,
  resolveCustom,
  summarize,
  type JournalQuestion,
  type JournalState,
} from "../../../shared/micro/journal.js";
import { JournalForm, type Commit } from "./JournalForm.js";
import { JournalSummary, score } from "./JournalSummary.js";
import { QuestionList } from "./QuestionList.js";
import { ResolveButtons } from "./QuestionDetail.js";
import { dayLabel, localDay } from "./fields.js";
import "./journal.css";

const forecastCount = (questions: readonly unknown[]): number =>
  questions.reduce<number>((sum, q) => {
    const forecasts = (q as { forecasts?: unknown } | null)?.forecasts;
    return sum + (Array.isArray(forecasts) ? forecasts.length : 0);
  }, 0);

/** Loads the journal and notes whether anything stored had to be skipped. */
function loadJournal(): { state: JournalState; skipped: boolean } {
  return loadMicro("journal", (raw) => {
    const state = parseJournal(raw);
    if (raw === undefined) return { state, skipped: false };
    const stored = (raw as { questions?: unknown } | null)?.questions;
    const questions = Array.isArray(stored) ? stored : [];
    const skipped =
      !Array.isArray(stored) ||
      questions.length !== state.questions.length ||
      forecastCount(questions) !== forecastCount(state.questions);
    return { state, skipped };
  });
}

/** Announces the headline score once things settle, never every keystroke, and not on open. */
function useAnnouncement(text: string): string {
  const [said, setSaid] = useState("");
  const first = useRef<string | null>(text);
  useEffect(() => {
    if (first.current === text) return;
    first.current = null;
    const timer = setTimeout(() => setSaid(text), 300);
    return () => clearTimeout(timer);
  }, [text]);
  return said;
}

export default function Journal({
  markets,
  navigate,
  onNotice,
}: MicroAppProps) {
  const [loaded] = useState(loadJournal);
  const [state, setState] = useState<JournalState>(loaded.state);
  const [saveFailed, setSaveFailed] = useState(false);
  const today = localDay();
  const summary = useMemo(() => summarize(state, markets), [state, markets]);
  const due = dueQuestions(state, today);
  const announcement = useAnnouncement(
    summary.brier === null
      ? `${summary.pending} pending, none scored yet.`
      : `${summary.scored} scored, Brier score ${score(summary.brier)}.`,
  );

  const commit: Commit = (result, notice) => {
    if (!result.ok) return result.error;
    setState(result.state);
    const saved = saveMicro("journal", result.state);
    setSaveFailed(!saved);
    if (saved) onNotice(notice);
    return null;
  };

  return (
    <div className="micro-journal">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {saveFailed && (
        <p role="alert" className="form-error journal-banner">
          Could not save on this device. Storage may be full; delete old
          questions and try again.
        </p>
      )}
      {loaded.skipped && (
        <p className="form-error notice-warning journal-banner">
          Some saved journal entries could not be read and were skipped.
        </p>
      )}
      <JournalSummary summary={summary} />
      <div className="journal-layout">
        <AnimatePresence initial={false}>
          {due.length > 0 && (
            <DueCallout
              key="due"
              due={due}
              onResolve={(q, outcome) => {
                const error = commit(
                  resolveCustom(state, q.id, outcome, new Date().toISOString()),
                  `Resolved ${outcome === "VOID" ? "Void" : outcome}.`,
                );
                // The resolved item leaves the callout; keep keyboard focus on the page.
                if (!error)
                  document.getElementById("journal-questions")?.focus();
              }}
            />
          )}
        </AnimatePresence>
        <JournalForm state={state} markets={markets} commit={commit} />
        <QuestionList
          state={state}
          markets={markets}
          today={today}
          commit={commit}
          navigate={navigate}
        />
      </div>
    </div>
  );
}

function DueCallout({
  due,
  onResolve,
}: {
  due: JournalQuestion[];
  onResolve: (q: JournalQuestion, outcome: "YES" | "NO" | "VOID") => void;
}) {
  return (
    <motion.section
      className="journal-card journal-due"
      aria-labelledby="journal-due"
      {...enterMotion}
      exit={{ opacity: 0, y: -6 }}
    >
      <h2 id="journal-due">Needs resolving</h2>
      <p className="journal-hint">
        These questions reached their check-by date. What happened?
      </p>
      <ul>
        {due.map((q) => (
          <li key={q.id}>
            <span className="journal-due-text">
              <strong>{q.title}</strong>
              <small>Check by {q.checkBy ? dayLabel(q.checkBy) : "—"}</small>
            </span>
            <ResolveButtons
              title={q.title}
              onResolve={(outcome) => onResolve(q, outcome)}
            />
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

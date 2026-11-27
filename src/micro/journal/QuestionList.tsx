// The question list: Open / Resolved / All, each row expanding in place.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { Collapse, rowEnter, rowExit } from "../../motion.js";
import { EmptyState, percent } from "../../ui.js";
import {
  latestForecast,
  questionStatus,
  type JournalQuestion,
  type JournalState,
  type QuestionStatus,
} from "../../../shared/micro/journal.js";
import type { Market } from "../../../shared/types.js";
import type { Commit } from "./JournalForm.js";
import { QuestionDetail } from "./QuestionDetail.js";
import { Segments } from "../Segments.js";

type Tab = "open" | "resolved" | "all";

const statusLabel: Record<QuestionStatus, string> = {
  open: "Open",
  due: "Due",
  YES: "Resolved YES",
  NO: "Resolved NO",
  VOID: "Void",
};
const isOpen = (status: QuestionStatus) =>
  status === "open" || status === "due";

interface QuestionListProps {
  state: JournalState;
  markets: readonly Market[];
  today: string;
  commit: Commit;
  navigate: (path: string) => void;
}

export function QuestionList(props: QuestionListProps) {
  const { state, markets, today } = props;
  const [tab, setTab] = useState<Tab>("open");
  const [expanded, setExpanded] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const settled = useRef<string | null>(null);
  const rows = state.questions.map((question) => ({
    question,
    status: questionStatus(question, markets, today),
    market: markets.find((item) => item.id === question.marketId),
  }));
  const openCount = rows.filter((row) => isOpen(row.status)).length;
  const shown = rows.filter((row) =>
    tab === "all" ? true : isOpen(row.status) === (tab === "open"),
  );
  const tabs = [
    { value: "open", label: "Open", count: openCount },
    { value: "resolved", label: "Resolved", count: rows.length - openCount },
    { value: "all", label: "All", count: rows.length },
  ] as const;

  // Delete, resolve and reopen remove the focused button: focus the row's
  // toggle if the row is still on this tab, otherwise the heading, so focus
  // never falls to <body>.
  useEffect(() => {
    const id = settled.current;
    if (id === null) return;
    settled.current = null;
    const toggle = shown.some((row) => row.question.id === id)
      ? document.getElementById(`${rowId(id)}-toggle`)
      : null;
    (toggle ?? heading.current)?.focus();
  });

  return (
    <section
      className="journal-card journal-questions"
      aria-labelledby="journal-questions"
    >
      <h2 id="journal-questions" ref={heading} tabIndex={-1}>
        Questions
      </h2>
      {rows.length === 0 ? (
        <EmptyState
          compact
          title="No forecasts yet"
          text="Pick a market or write your own question, then give it a probability."
        />
      ) : (
        <>
          <Segments
            label="Show questions"
            layoutId="journal-tab"
            options={tabs}
            value={tab}
            onChange={setTab}
          />
          {shown.length === 0 ? (
            <p className="journal-hint journal-tab-empty">
              {tab === "open"
                ? "Nothing open. Every question has an answer."
                : "Nothing resolved yet."}
            </p>
          ) : (
            <ul className="journal-list">
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((row, index) => (
                  <motion.li
                    key={row.question.id}
                    {...rowEnter(index)}
                    layout="position"
                    exit={rowExit}
                    className={expanded === row.question.id ? "expanded" : ""}
                  >
                    <QuestionRow
                      {...row}
                      expanded={expanded === row.question.id}
                      onToggle={() =>
                        setExpanded(
                          expanded === row.question.id ? null : row.question.id,
                        )
                      }
                    />
                    <Collapse
                      open={expanded === row.question.id}
                      id={`${rowId(row.question.id)}-detail`}
                    >
                      <QuestionDetail
                        {...props}
                        question={row.question}
                        market={row.market}
                        onSettled={(id) => {
                          settled.current = id;
                        }}
                      />
                    </Collapse>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const rowId = (id: string) =>
  `journal-row-${id.replace(/[^a-zA-Z0-9-]/g, "-")}`;

function QuestionRow({
  question: q,
  status,
  market,
  expanded,
  onToggle,
}: {
  question: JournalQuestion;
  status: QuestionStatus;
  market?: Market;
  expanded: boolean;
  onToggle: () => void;
}) {
  const latest = latestForecast(q);
  const missing = q.kind === "market" && !market;
  return (
    <button
      type="button"
      id={`${rowId(q.id)}-toggle`}
      className="journal-row"
      aria-expanded={expanded}
      aria-controls={expanded ? `${rowId(q.id)}-detail` : undefined}
      onClick={onToggle}
    >
      <span className="journal-row-main">
        <strong className="journal-row-title">{q.title}</strong>
        <span className="journal-row-meta">
          <span className={`journal-chip ${q.kind}`}>
            {q.kind === "market" ? "market" : "own"}
          </span>
          <span className={`journal-status ${status.toLowerCase()}`}>
            {statusLabel[status]}
          </span>
          {market && <span>Crowd now {percent(market.probability)}</span>}
          {missing && <span>Not on this device's market list</span>}
        </span>
      </span>
      <span className="journal-row-end">
        <strong>{latest ? `${latest.pct}%` : "—"}</strong>
        <small>yours</small>
      </span>
      <ChevronDown
        className="journal-row-chevron"
        size={18}
        aria-hidden="true"
      />
    </button>
  );
}

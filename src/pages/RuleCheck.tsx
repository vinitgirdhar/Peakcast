import { useEffect, useState } from "react";
import { CircleCheck, ExternalLink, TriangleAlert } from "lucide-react";
import {
  blockingReason,
  lintDraft,
  type LintField,
  type LintFinding,
  type LintReport,
} from "../../shared/lint.js";
import { CHECK_TITLES } from "../../shared/lint-data.js";
import type { DraftInput, RuleCheck } from "../../shared/types.js";

const FIELD_LABELS: Record<LintField, string> = {
  question: "Question",
  sourceName: "Primary source",
  sourceUrl: "Source URL",
  closesAt: "Closing time",
  yesRule: "YES rule",
  noRule: "NO rule",
  invalidRule: "Missing evidence rule",
};
const GROUPS = [
  ["block", "Must fix before launch"],
  ["warn", "Review before launch"],
  ["info", "Notes"],
] as const;
const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;
const count = (report: LintReport, severity: LintFinding["severity"]) =>
  report.findings.filter((item) => item.severity === severity).length;

export function RuleBadge({ report }: { report: LintReport }) {
  return (
    <span className={`rule-badge ${report.label.toLowerCase()}`}>
      {report.label} · risk {report.risk}
    </span>
  );
}

function FindingBody({ item }: { item: LintFinding }) {
  return (
    <>
      <strong>
        {FIELD_LABELS[item.field]}
        {item.match && <mark>{item.match}</mark>}
      </strong>
      <span>{item.message}</span>
    </>
  );
}

/** Findings grouped by severity; with onSelect each one focuses its field. */
export function FindingList({
  findings,
  onSelect,
}: {
  findings: LintFinding[];
  onSelect?: (field: LintField) => void;
}) {
  return GROUPS.map(([severity, heading]) => {
    const items = findings.filter((item) => item.severity === severity);
    if (!items.length) return null;
    return (
      <div key={severity} className={`finding-group ${severity}`}>
        <p className="finding-group-title">{heading}</p>
        <ul>
          {items.map((item, index) => (
            <li key={`${item.id}-${item.field}-${index}`}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(item.field)}>
                  <FindingBody item={item} />
                </button>
              ) : (
                <div>
                  <FindingBody item={item} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  });
}

/** Live check of the create form, debounced so typing stays smooth. */
export function RuleCheckPanel({
  draft,
  onSelect,
}: {
  draft: DraftInput;
  onSelect: (field: LintField) => void;
}) {
  const [report, setReport] = useState(() => lintDraft(draft));
  const key = JSON.stringify(draft);
  useEffect(() => {
    const timer = setTimeout(() => setReport(lintDraft(draft)), 300);
    return () => clearTimeout(timer);
  }, [key]);
  return (
    <section className="rule-check" aria-labelledby="rule-check-title">
      <div className="rule-check-heading">
        <h3 id="rule-check-title">Rule check</h3>
        <RuleBadge report={report} />
      </div>
      <p className="sr-only" aria-live="polite">
        {`Rule check: ${plural(count(report, "block"), "blocking problem")}, ${plural(count(report, "warn"), "warning")}, ${plural(count(report, "info"), "note")}.`}
      </p>
      {report.findings.length ? (
        <FindingList findings={report.findings} onSelect={onSelect} />
      ) : (
        <p className="fine-print">
          {draft.question.trim()
            ? "No problems found so far."
            : "Start with the question; each field is checked as you fill it."}
        </p>
      )}
    </section>
  );
}

/**
 * What stands between a saved draft and launch: blocking problems, or the
 * warning and source acknowledgements. The server enforces only the blocks.
 */
export function LaunchReview({
  id,
  report,
  sourceUrl,
  checked,
  onToggle,
}: {
  id: string;
  report: LintReport;
  sourceUrl: string;
  checked: Set<string>;
  onToggle: (key: string) => void;
}) {
  const blocked = blockingReason(report);
  const warnings = count(report, "warn");
  return (
    <div className="launch-review">
      <FindingList findings={report.findings} />
      {blocked ? (
        <p className="form-error">{blocked} Edit it as a new draft.</p>
      ) : (
        warnings > 0 && (
          <>
            <p className="fine-print">
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                Open the source <ExternalLink size={12} />
              </a>
            </p>
            {[
              [
                "reviewed",
                warnings === 1
                  ? "I reviewed this warning."
                  : `I reviewed these ${warnings} warnings.`,
              ],
              [
                "opened",
                "I opened the source and it shows the figure the rules name.",
              ],
            ].map(([name, label]) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={checked.has(`${id}:${name}`)}
                  onChange={() => onToggle(`${id}:${name}`)}
                />
                {label}
              </label>
            ))}
          </>
        )
      )}
    </div>
  );
}

/** Whether a saved draft may launch from the studio. */
export const launchReady = (
  id: string,
  report: LintReport,
  checked: Set<string>,
) =>
  !blockingReason(report) &&
  (!count(report, "warn") ||
    (checked.has(`${id}:reviewed`) && checked.has(`${id}:opened`)));

/** The rule-check line on a launched market's rules view. */
export function RuleCheckLine({ check }: { check?: RuleCheck }) {
  if (!check) return null;
  if (!check.warnings.length)
    return (
      <p className="rule-check-line clear">
        <CircleCheck size={15} /> Rule check: clear
      </p>
    );
  return (
    <div className="rule-check-line">
      <p>
        <TriangleAlert size={15} /> Launched with{" "}
        {plural(check.warnings.length, "unresolved warning")}
      </p>
      <ul>
        {check.warnings.map((id) => (
          <li key={id}>{CHECK_TITLES[id] ?? id}</li>
        ))}
      </ul>
    </div>
  );
}

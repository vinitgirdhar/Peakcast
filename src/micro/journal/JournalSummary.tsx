// The score strip: scored, Brier, log score, skill against the crowd, pending.
import { AnimatedNumber } from "../../motion.js";
import { ReliabilityDiagram } from "../../pages/PortfolioExtras.js";
import type { JournalSummary as Summary } from "../../../shared/micro/journal.js";

// Same formatting as the Portfolio accuracy card.
export const score = (value: number): string => value.toFixed(3);
const signedScore = (value: number) => `${value > 0 ? "+" : ""}${score(value)}`;
const whole = (value: number) => String(Math.round(value));

function Stat({
  name,
  label,
  value,
  format,
  note,
  tone = "",
}: {
  name: string;
  label: string;
  value: number | null;
  format: (value: number) => string;
  note: string;
  tone?: string;
}) {
  return (
    <div className={`journal-stat stat-${name}`}>
      <span>{label}</span>
      <strong className={tone}>
        {value === null ? (
          "—"
        ) : (
          <AnimatedNumber value={value} format={format} />
        )}
      </strong>
      <small>{note}</small>
    </div>
  );
}

export function JournalSummary({ summary }: { summary: Summary }) {
  const { skill } = summary;
  return (
    <section
      className="journal-card journal-summary"
      aria-labelledby="journal-summary"
    >
      <h2 id="journal-summary">Your scores</h2>
      <div className="journal-summary-body">
        <div className="journal-stats">
          <Stat
            name="scored"
            label="Scored"
            value={summary.scored}
            format={whole}
            note={
              summary.voided ? `${summary.voided} void` : "resolved YES or NO"
            }
          />
          <Stat
            name="brier"
            label="Brier score"
            value={summary.brier}
            format={score}
            note="lower is better"
          />
          <Stat
            name="log"
            label="Log score"
            value={summary.logScore}
            format={score}
            note="0 is perfect"
          />
          <Stat
            name="skill"
            label="Skill vs crowd"
            value={skill}
            format={signedScore}
            tone={skill === null ? "" : skill >= 0 ? "positive" : "negative"}
            note={
              skill === null
                ? "on resolved Peakcast markets"
                : `over ${summary.linkedScored} ${summary.linkedScored === 1 ? "market" : "markets"}`
            }
          />
          <Stat
            name="pending"
            label="Pending"
            value={summary.pending}
            format={whole}
            note="waiting for an answer"
          />
        </div>
        {summary.scored ? (
          <ReliabilityDiagram buckets={summary.buckets} />
        ) : (
          <p className="journal-summary-empty">
            Scores appear once a question resolves. Aim for 20 or more before
            reading much into calibration.
          </p>
        )}
      </div>
    </section>
  );
}

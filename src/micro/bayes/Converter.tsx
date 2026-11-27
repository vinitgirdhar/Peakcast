import { useId, useState } from "react";
import { ArrowRightLeft, ChevronDown } from "lucide-react";
import {
  oddsFormats,
  parseOdds,
  priorPercent,
  toOddsForms,
  type OddsFormat,
  type OddsForms,
} from "../../../shared/micro/bayes.js";
import { Collapse } from "../../motion.js";
import { Segments } from "../Segments.js";

const formatNames: Record<OddsFormat, string> = {
  percent: "Percent",
  decimal: "Decimal",
  american: "American",
  fractional: "Fractional",
  odds: "Odds",
  oneIn: "1 in N",
};
const placeholders: Record<OddsFormat, string> = {
  percent: "35%",
  decimal: "2.50",
  american: "+150",
  fractional: "3/2",
  odds: "2:3",
  oneIn: "4",
};
const outputs: readonly [keyof OddsForms, string][] = [
  ["percent", "Percent"],
  ["decimal", "Decimal"],
  ["american", "American"],
  ["fractional", "Fractional (against)"],
  ["odds", "Odds (for)"],
  ["oneIn", "1 in N"],
  ["bits", "Bits"],
];
const options = oddsFormats.map((value) => ({
  value,
  label: formatNames[value],
}));

interface ConverterProps {
  /** Sets the worksheet prior to the converted probability. */
  onUsePrior: (probability: number) => void;
}

/** Percent, decimal, American, fractional, odds and "1 in N", plus bits. */
export function Converter({ onUsePrior }: ConverterProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<OddsFormat>("percent");
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseOdds(format, text) : null;
  const errorId = `${id}-error`;
  return (
    <section className="bayes-card bayes-converter" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>
        <button
          type="button"
          className="bayes-disclosure"
          aria-expanded={open}
          aria-controls={open ? `${id}-body` : undefined}
          onClick={() => setOpen(!open)}
        >
          <ArrowRightLeft size={17} aria-hidden="true" />
          <span>Odds converter</span>
          <ChevronDown size={17} className="bayes-chevron" aria-hidden="true" />
        </button>
      </h2>
      <Collapse open={open} id={`${id}-body`}>
        <div className="bayes-converter-body">
          <Segments
            label="Odds format"
            value={format}
            options={options}
            onChange={setFormat}
            layoutId={`${id}-format`}
            className="bayes-format"
          />
          <label className="form-label" htmlFor={`${id}-input`}>
            {formatNames[format]} odds
          </label>
          <input
            id={`${id}-input`}
            className="text-input"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholders[format]}
            value={text}
            aria-invalid={parsed?.ok === false}
            aria-describedby={parsed?.ok === false ? errorId : undefined}
            onChange={(event) => setText(event.target.value)}
          />
          {parsed?.ok === false && (
            <p id={errorId} className="bayes-field-error">
              {parsed.error}
            </p>
          )}
          {parsed?.ok ? (
            <Forms
              forms={toOddsForms(parsed.probability)}
              onUse={() => onUsePrior(parsed.probability)}
            />
          ) : (
            !parsed && (
              <p className="bayes-hint">
                Type odds in any format to see all the others.
              </p>
            )
          )}
        </div>
      </Collapse>
    </section>
  );
}

function Forms({ forms, onUse }: { forms: OddsForms; onUse: () => void }) {
  return (
    <>
      <dl className="bayes-forms">
        {outputs.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{forms[key]}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="secondary-button" onClick={onUse}>
        {/* The prior field accepts 0.1–99.9%, so the label names the value it will really get. */}
        Use {priorPercent(forms.probability).toFixed(1)}% as prior
      </button>
    </>
  );
}

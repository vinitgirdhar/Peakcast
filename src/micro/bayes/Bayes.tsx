import { useEffect, useMemo, useRef, useState } from "react";
import {
  errorFor,
  parseBayes,
  parseNumber,
  priorPercent,
  update,
  type UpdateOk,
} from "../../../shared/micro/bayes.js";
import { Select } from "../../Select.js";
import { loadMicro } from "../storage.js";
import type { MicroAppProps } from "../types.js";
import { Converter } from "./Converter.js";
import { EvidenceList, NumberField } from "./EvidenceList.js";
import { Result } from "./Result.js";
import { Worksheets, type Draft } from "./Worksheets.js";
import { blankRow, toEvidence, type DraftRow } from "./draft.js";
import "./bayes.css";

const priorText = (p: number): string => String(priorPercent(p));

/** Moves focus to an element once React has rendered it. */
function useFocusLater() {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    document.getElementById(target)?.focus();
    setTarget(null);
  }, [target]);
  return setTarget;
}

/** Keeps the last valid result so it can stay on screen, greyed out, while a field is invalid. */
function useLastGood(result: ReturnType<typeof update>): UpdateOk | null {
  const [lastGood, setLastGood] = useState<UpdateOk | null>(
    result.ok ? result : null,
  );
  if (result.ok && result !== lastGood) setLastGood(result);
  return lastGood;
}

export default function Bayes({ markets, navigate, onNotice }: MicroAppProps) {
  const [sheets, setSheets] = useState(() => loadMicro("bayes", parseBayes));
  const [prior, setPrior] = useState("50");
  const [marketId, setMarketId] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const addRef = useRef<HTMLButtonElement>(null);
  const focusLater = useFocusLater();

  const evidence = useMemo(() => rows.map(toEvidence), [rows]);
  const probability = parseNumber(prior) / 100;
  const result = useMemo(
    () => update(probability, evidence),
    [probability, evidence],
  );
  const lastGood = useLastGood(result);
  const errors = result.ok ? [] : result.errors;
  const market = markets.find((item) => item.id === marketId);

  const pickMarket = (id: string) => {
    setMarketId(id);
    const picked = markets.find((item) => item.id === id);
    if (picked) setPrior(priorText(picked.probability));
  };
  const addRow = () => {
    const row = blankRow();
    setRows([...rows, row]);
    focusLater(`${row.id}-label`);
  };
  const load = (draft: Draft) => {
    setPrior(draft.prior);
    setRows(draft.rows);
    setMarketId(draft.marketId);
    setCurrentId(draft.id);
    setTitle(draft.title);
    focusLater("bayes-prior");
  };
  const reset = () =>
    load({ id: null, title: "", prior: "50", marketId: "", rows: [] });

  const options = [
    { value: "", label: "No market" },
    ...markets.map((item) => ({ value: item.id, label: item.title })),
  ];
  return (
    <div className="bayes-layout">
      <section
        className="bayes-card bayes-prior"
        aria-labelledby="bayes-prior-h"
      >
        <h2 id="bayes-prior-h">Prior</h2>
        <p className="bayes-hint">
          Your probability before the new evidence, or the market's price.
        </p>
        <div className="bayes-prior-fields">
          <NumberField
            id="bayes-prior"
            label="Prior probability"
            suffix="%"
            value={prior}
            error={errorFor(errors, "prior")}
            onChange={setPrior}
          />
          <div className="bayes-field">
            <label className="form-label" htmlFor="bayes-market">
              Start from a market
            </label>
            <Select
              id="bayes-market"
              label="Start from a market"
              value={market ? marketId : ""}
              options={options}
              onChange={pickMarket}
            />
            {markets.length === 0 && (
              <p className="bayes-hint">Markets appear here once they load.</p>
            )}
          </div>
        </div>
      </section>
      <EvidenceList
        rows={rows}
        steps={result.ok ? result.steps : []}
        errors={errors}
        onRows={setRows}
        onAdd={addRow}
        onRemoved={() => addRef.current?.focus()}
        onFocus={focusLater}
        addRef={addRef}
      />
      <Result
        result={result}
        lastGood={lastGood}
        market={market}
        navigate={navigate}
      />
      <Converter onUsePrior={(p) => setPrior(priorText(p))} />
      <Worksheets
        state={sheets}
        onState={setSheets}
        draft={{ id: currentId, title, prior, marketId, rows }}
        valid={result.ok}
        marketTitle={market?.title}
        onTitle={setTitle}
        onSaved={setCurrentId}
        onLoad={load}
        onReset={reset}
        onNotice={onNotice}
      />
    </div>
  );
}

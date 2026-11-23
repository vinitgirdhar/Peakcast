import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { Lightbulb, Sparkles } from "lucide-react";
import type { WildcatterClient } from "../../shared/client.js";
import { explainFacts } from "../../shared/explain.js";
import type {
  Capabilities,
  Market,
  MarketExplanation,
} from "../../shared/types.js";
import { enterMotion } from "../motion.js";
import { errorMessage } from "../ui.js";
import { DetailPanel } from "./MarketExtras.js";
import "../explain.css";

interface ExplainProps {
  market: Market;
  client: WildcatterClient;
  capabilities: Capabilities | null;
}

/** "Explain this market": computed facts, plus an optional AI explainer. */
export function ExplainPanel({ market, client, capabilities }: ExplainProps) {
  return (
    <DetailPanel
      title="Explain this market"
      icon={<Lightbulb size={17} />}
      collapsible
    >
      <h3 className="explain-heading">What the market says</h3>
      <dl className="explain-facts">
        {explainFacts(market).map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.text}</dd>
          </div>
        ))}
      </dl>
      {capabilities?.aiConfigured && (
        <AIExplainer
          market={market}
          client={client}
          capabilities={capabilities}
        />
      )}
    </DetailPanel>
  );
}

function AIExplainer({
  market,
  client,
  capabilities,
}: ExplainProps & { capabilities: Capabilities }) {
  const tokenId = useId();
  const managed = capabilities.aiAccessManaged ?? false;
  const provider = capabilities.defaultAIProvider ?? undefined;
  const labelOf = (id?: string) =>
    capabilities.aiProviders.find((item) => item.id === id)?.label ?? "AI";
  const label = labelOf(provider);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MarketExplanation | null>(null);

  async function run() {
    setBusy(true);
    setError("");
    try {
      setResult(await client.explainMarket(market.id, token, provider));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="explain-ai">
      {!result && (
        <>
          {!managed && (
            <>
              <label className="form-label" htmlFor={tokenId}>
                AI access token
              </label>
              <input
                className="text-input"
                id={tokenId}
                type="password"
                minLength={16}
                maxLength={256}
                autoComplete="off"
                disabled={busy}
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </>
          )}
          <button
            type="button"
            className="secondary-button"
            aria-busy={busy}
            disabled={busy || (!managed && token.length < 16)}
            onClick={() => void run()}
          >
            <Sparkles size={14} />
            {busy ? "Explaining…" : "Explain with AI"}
          </button>
          <p className="panel-hint">
            Sends this market's text and numbers to {label}. Usage may incur
            charges.
          </p>
        </>
      )}
      <p className="sr-only" role="status">
        {busy
          ? `Asking ${label} to explain this market.`
          : result
            ? "AI explanation ready."
            : ""}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <ExplanationView result={result} label={labelOf(result.provider)} />
      )}
    </div>
  );
}

function ExplanationView({
  result,
  label,
}: {
  result: MarketExplanation;
  label: string;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  // The button that asked is gone now, so keyboard focus moves to the answer.
  useEffect(() => ref.current?.focus(), []);
  const time = new Date(result.generatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <motion.section
      ref={ref}
      tabIndex={-1}
      className="critique explain-result"
      aria-labelledby={id}
      {...enterMotion}
    >
      <h3 id={id}>
        <Sparkles size={14} /> AI-generated, not advice
      </h3>
      <p className="panel-hint">
        Written by {label} at <time dateTime={result.generatedAt}>{time}</time>{" "}
        from this market's own text and numbers. It may be wrong and is not
        financial advice.
      </p>
      <p className="explain-summary">{result.summary}</p>
      <ExplainList title="What drives the price" items={result.drivers} />
      <ExplainList title="Would move it up" items={result.wouldMoveUp} />
      <ExplainList title="Would move it down" items={result.wouldMoveDown} />
      {result.baseRateNote && (
        <ExplainList title="Base rate" items={[result.baseRateNote]} />
      )}
      <ExplainList title="Caveats" items={result.caveats} />
    </motion.section>
  );
}

function ExplainList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </>
  );
}

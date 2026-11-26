import { Lightbulb } from "lucide-react";
import { motion } from "motion/react";
import { explainFacts } from "../../shared/explain.js";
import type { Market } from "../../shared/types.js";
import { DetailPanel } from "./MarketExtras.js";
import { rowEnter } from "../motion.js";
import "../explain.css";

/** "Explain this market": facts computed from the market's own numbers. */
export function ExplainPanel({ market }: { market: Market }) {
  return (
    <DetailPanel
      title="Explain this market"
      icon={<Lightbulb size={17} />}
      collapsible
    >
      <h3 className="explain-heading">What the market says</h3>
      {/* The facts step in one by one each time the panel opens. */}
      <dl className="explain-facts">
        {explainFacts(market).map((fact, index) => (
          <motion.div key={fact.label} {...rowEnter(index)}>
            <dt>{fact.label}</dt>
            <dd>{fact.text}</dd>
          </motion.div>
        ))}
      </dl>
    </DetailPanel>
  );
}

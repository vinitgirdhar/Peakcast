import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { itemMotion, listMotion } from "../motion.js";
import { microApps } from "./registry.js";
import "./micro.css";

export function MicroHub({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="page micro-hub">
      <div className="page-heading">
        <div>
          <h1>Micro apps</h1>
          <p>
            Small tools for practising forecasting. Everything stays on this
            device.
          </p>
        </div>
      </div>
      <motion.ul
        className="micro-grid"
        variants={listMotion}
        initial="hidden"
        animate="show"
      >
        {microApps.map(({ id, name, tagline, icon: Icon }) => (
          <motion.li key={id} variants={itemMotion}>
            <button
              className="micro-card"
              onClick={() => navigate(`/apps/${id}`)}
            >
              <span className="micro-card-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="micro-card-text">
                <strong>{name}</strong>
                <span>{tagline}</span>
              </span>
              <ChevronRight
                className="micro-card-chevron"
                size={18}
                aria-hidden="true"
              />
            </button>
          </motion.li>
        ))}
      </motion.ul>
      <p className="fine-print">
        Practice tools. Peakcast uses practice credits only; nothing here is
        financial advice.
      </p>
    </div>
  );
}

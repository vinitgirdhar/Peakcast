// Host contract for micro apps (docs/plans/micro-apps.md). No imports from app folders.
import type { PeakcastClient } from "../../shared/client.js";
import type { Market, Portfolio } from "../../shared/types.js";

export interface MicroAppProps {
  /** Same client App uses. Apps call read-only methods only: markets, market, history, quote, portfolio, calibration. */
  client: PeakcastClient;
  /** App's current public market list; may be empty. */
  markets: Market[];
  /** Null until loaded or when loading failed. */
  portfolio: Portfolio | null;
  /** In-app navigation, e.g. navigate(`/markets/${id}`). Paths only, no query strings. */
  navigate: (path: string) => void;
  /** Shows the shared toast. */
  onNotice: (text: string) => void;
}

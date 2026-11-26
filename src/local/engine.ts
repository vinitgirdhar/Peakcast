// The whole Peakcast API, running on the device: the same Store and routes as
// the optional Node server (server/), over SQLite compiled to WebAssembly.
import type { SqlJsStatic } from "sql.js";
import type { DatabaseSync } from "node:sqlite";
import { Store } from "../../server/database.js";
import { registerApi } from "../../server/routes.js";
import { settleDue } from "../../server/resolution.js";
import { seedDemoActivity } from "../../server/demo.js";
import { LocalApp } from "./router.js";
import { SqlJsDatabase } from "./sqlite.js";

/** How long a proposed outcome can be disputed before anyone may settle it. */
export const DISPUTE_WINDOW_MS = 120_000;

export function createEngine(
  SQL: SqlJsStatic,
  saved: Uint8Array | undefined,
  onWrite: () => void,
) {
  const database = new SqlJsDatabase(SQL, saved, onWrite);
  const store = new Store("peakcast", database as unknown as DatabaseSync);
  store.showDisplayNames = true;
  const app = new LocalApp();
  registerApi(app.asFastify(), store, {
    disputeWindowMs: DISPUTE_WINDOW_MS,
    // Nobody else can reach this device: no workspaces, invites or share links.
    teams: false,
    shareOrigin: () => null,
  });
  return {
    handle: (request: Request) => app.handle(request),
    settleDue: () => settleDue(store),
    /** Adds sample players and activity, once per database (server/demo.ts). */
    seedSamples: () => seedDemoActivity(store),
    export: () => database.export(),
  };
}

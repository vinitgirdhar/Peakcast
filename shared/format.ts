import type { Market } from "./types.js";

/** Display formatting shared by the React UI and the server-rendered embed widget. */
export const percent = (value: number) => `${Math.round(value * 100)}%`;
export const statusLabel = (market: Market) =>
  market.status === "resolved"
    ? `Resolved ${market.resolution?.outcome ?? ""}`.trim()
    : {
        open: "Open",
        closed: "Closed",
        proposed: "Outcome proposed",
        disputed: "Disputed",
      }[market.status];
/** Whole percentage points moved in 24 hours; 0 when the move is under half a point. */
export const movePoints = (change: number) =>
  Math.abs(change) < 0.005 ? 0 : Math.round(Math.abs(change) * 100);
/** "Up 4 points in 24 hours", or null when the market is flat. */
export function moveLabel(change: number): string | null {
  const points = movePoints(change);
  if (!points) return null;
  return `${change > 0 ? "Up" : "Down"} ${points} ${points === 1 ? "point" : "points"} in 24 hours`;
}

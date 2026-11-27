// What the form holds: text as typed, converted to the pure module's numbers on every render.
import { parseNumber, type Evidence } from "../../../shared/micro/bayes.js";

export interface DraftRow {
  id: string;
  label: string;
  mode: Evidence["mode"];
  /** Likelihood ratio as typed. */
  ratio: string;
  /** Percent as typed. */
  ifYes: string;
  /** Percent as typed. */
  ifNo: string;
}

let counter = 0;
/** Unique on this device; never contains "." because field ids are `${id}.ratio`. */
export const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

export const blankRow = (): DraftRow => ({
  id: newId("ev"),
  label: "",
  mode: "ratio",
  ratio: "1",
  ifYes: "50",
  ifNo: "50",
});

/** 0.3 → "30"; trims float noise such as 0.07 × 100. */
export const percentText = (p: number): string =>
  String(Number((p * 100).toFixed(4)));

export const toEvidence = (row: DraftRow): Evidence => ({
  id: row.id,
  label: row.label.trim(),
  mode: row.mode,
  ratio: parseNumber(row.ratio),
  ifYes: parseNumber(row.ifYes) / 100,
  ifNo: parseNumber(row.ifNo) / 100,
});

export const fromEvidence = (e: Evidence): DraftRow => ({
  id: e.id,
  label: e.label,
  mode: e.mode,
  ratio: e.ratio === undefined ? "1" : String(e.ratio),
  ifYes: e.ifYes === undefined ? "50" : percentText(e.ifYes),
  ifNo: e.ifNo === undefined ? "50" : percentText(e.ifNo),
});

/** Only the fields that matter for the chosen mode are stored. */
export const storedEvidence = (row: DraftRow): Evidence => {
  const e = toEvidence(row);
  return e.mode === "ratio"
    ? { id: e.id, label: e.label, mode: "ratio", ratio: e.ratio }
    : {
        id: e.id,
        label: e.label,
        mode: "chances",
        ifYes: e.ifYes,
        ifNo: e.ifNo,
      };
};

export const rowName = (row: DraftRow, index: number): string =>
  row.label.trim() || `Evidence ${index + 1}`;

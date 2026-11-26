import { Value } from "@sinclair/typebox/value";
import { FormatRegistry } from "@sinclair/typebox";
import type { DraftInput } from "../shared/types.js";
import { DraftSchema } from "./schemas.js";
import { DomainError } from "./database.js";

if (!FormatRegistry.Has("date-time"))
  FormatRegistry.Set(
    "date-time",
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value),
  );

/** Value.Check, not a compiled validator: the on-device build runs without eval. */
export function validateDraft(input: unknown): asserts input is DraftInput {
  if (!Value.Check(DraftSchema, input))
    throw new DomainError(
      "The draft is incomplete or invalid. Check every rule, URL and date.",
    );
  let url: URL;
  try {
    url = new URL(input.sourceUrl);
  } catch {
    throw new DomainError("Use a valid public HTTPS source URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.includes(".")
  )
    throw new DomainError("Use a public HTTPS source URL without credentials.");
  if (Date.parse(input.closesAt) <= Date.now())
    throw new DomainError("The closing time must be in the future.");
}

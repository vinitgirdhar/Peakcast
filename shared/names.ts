/** A word: a letter, then letters or combining marks (Hindi vowel signs, accents). */
const WORD = String.raw`\p{L}[\p{L}\p{M}]*`;
/** Words joined by single spaces, apostrophes, hyphens or periods ("Ada", "Mary-Jane O'Neil", "J. R. Tolkien", "विनीत"). */
const NAME = new RegExp(`^${WORD}(?:(?:[.'-] ?| )${WORD})*\\.?$`, "u");

/** Trims and collapses runs of spaces, as the server stores the name. */
export const normalizeDisplayName = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const isValidDisplayName = (value: string): boolean => {
  const name = normalizeDisplayName(value);
  return name.length >= 2 && name.length <= 40 && NAME.test(name);
};

/**
 * What is wrong with a name as typed, for a live hint; null when it is fine.
 * Empty input is not an error yet (nothing typed).
 */
export function displayNameProblem(value: string): string | null {
  const name = normalizeDisplayName(value);
  if (!name) return null;
  if (/\p{N}/u.test(name)) return "Numbers aren't allowed. Enter your name only.";
  if (/[^\p{L}\p{M} .'-]/u.test(name))
    return "Only letters are allowed, with spaces, hyphens (-) or apostrophes (').";
  if (name.length > 40) return "Keep your name to 40 characters or fewer.";
  if (!/^\p{L}/u.test(name)) return "Start your name with a letter.";
  if (/[.'-]{2,}|[.'-] [.'-]/u.test(name))
    return "Use one hyphen, apostrophe or period between names.";
  if (name.length < 2) return "Your name needs at least 2 letters.";
  if (!isValidDisplayName(name)) return "Enter your name, like Ada Lovelace.";
  return null;
}

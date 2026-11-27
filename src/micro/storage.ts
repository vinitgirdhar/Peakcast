// Per-app persistence for micro apps. Never throws: storage can be full, blocked or corrupt.
const prefix = "peakcast.micro.";

export const microKey = (id: string): string => `${prefix}${id}.v1`;

/** Parses the stored JSON; `parse` receives `undefined` when it is missing, corrupt or storage is blocked. */
export function loadMicro<T>(id: string, parse: (raw: unknown) => T): T {
  let raw: unknown;
  try {
    const text = localStorage.getItem(microKey(id));
    raw = text === null ? undefined : JSON.parse(text);
  } catch {
    raw = undefined;
  }
  return parse(raw);
}

/** False when storage is full or disabled. */
export function saveMicro(id: string, value: unknown): boolean {
  try {
    localStorage.setItem(microKey(id), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Removes every micro-app key. Called when the account is deleted. */
export function clearMicroData(): void {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked: nothing was stored either.
  }
}

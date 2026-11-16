import { ApiError } from "../shared/client.js";
import { BrandMark } from "./ui.js";

/** Retry only readiness reads; account creation and trades must never be replayed here. */
export async function waitForBackend(signal: AbortSignal) {
  const deadline = Date.now() + 180_000;
  while (!signal.aborted && Date.now() < deadline) {
    if (!navigator.onLine)
      throw new Error("You’re offline. Reconnect, then try again.");
    const request = new AbortController();
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, Math.min(15_000, deadline - Date.now()));
    try {
      const response = await fetch("/api/v1/capabilities", {
        cache: "no-store",
        signal: request.signal,
      });
      if (response.headers.get("content-type")?.includes("application/json")) {
        const body = await response.json();
        if (response.ok && body.mode === "demo") return;
        throw new ApiError(
          typeof body.message === "string"
            ? body.message
            : "The server returned an unexpected startup response.",
          response.status,
        );
      }
      await response.body?.cancel();
      if (
        !response.ok &&
        ![408, 425, 500, 502, 503, 504].includes(response.status)
      )
        throw new ApiError(
          "The server could not open this workspace. Please try again.",
          response.status,
        );
    } catch (error) {
      if (signal.aborted)
        throw new DOMException("Startup cancelled", "AbortError");
      if (error instanceof ApiError) throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
    await new Promise<void>((resolve, reject) => {
      const abortPause = () => {
        clearTimeout(pause);
        reject(new DOMException("Startup cancelled", "AbortError"));
      };
      const pause = setTimeout(
        () => {
          signal.removeEventListener("abort", abortPause);
          resolve();
        },
        Math.min(3000, Math.max(0, deadline - Date.now())),
      );
      signal.addEventListener("abort", abortPause, { once: true });
      if (signal.aborted) abortPause();
    });
  }
  throw new Error(
    "The server is taking longer than expected to wake up. Please try again in a moment.",
  );
}

export function BackendStartup({ warming }: { warming: boolean }) {
  return (
    <div
      className="startup-screen"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="startup-mark" aria-hidden="true">
        <span className="startup-halo" />
        <span className="startup-halo" />
        <BrandMark />
      </div>
      <span className="startup-brand">wildcatter.</span>
      <h2>
        {warming ? "The server is warming up." : "Opening your workspace."}
      </h2>
      <p>
        {warming
          ? "(Please allow a minute or two. Our free demo server may be waking from inactivity.)"
          : "Connecting to the demo server…"}
      </p>
      <div className="startup-progress" aria-hidden="true">
        <span />
      </div>
      <p className="startup-caption">
        Your workspace will open automatically when it’s ready.
      </p>
    </div>
  );
}

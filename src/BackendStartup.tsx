import { ApiError } from "../shared/client.js";
import { useState, type CSSProperties } from "react";
import { motion, type Variants } from "motion/react";
import { BrandMark } from "./ui.js";
import { ease } from "./motion.js";

/** Retry only readiness reads; account creation and trades must never be replayed here. */
export async function waitForBackend(signal: AbortSignal) {
  const deadline = Date.now() + 180_000;
  while (!signal.aborted && Date.now() < deadline) {
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
            : "The app returned an unexpected startup response.",
          response.status,
        );
      }
      await response.body?.cancel();
      if (
        !response.ok &&
        ![408, 425, 500, 502, 503, 504].includes(response.status)
      )
        throw new ApiError(
          "Peakcast could not open this workspace. Please try again.",
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
    "Peakcast could not open its on-device data. Close the app and open it again.",
  );
}

// When the boot screen first appeared. main.tsx shows it before the app mounts and
// App shows it again; the shared clock lets the logo animation continue, not restart.
let bootStart: number | undefined;

const leaveScreen: Variants = {
  leave: { opacity: 0, transition: { duration: 0.32, ease, delay: 0.06 } },
};
const leaveLogo: Variants = {
  leave: { opacity: 0, scale: 1.1, transition: { duration: 0.26, ease } },
};

/** Full-screen boot logo; fades out when the app is ready (wrap in AnimatePresence). */
export function BackendStartup({ warming }: { warming: boolean }) {
  const [offset] = useState(() => {
    // On Android the native splash already played the mark's intro: continue it, not replay it.
    bootStart ??=
      performance.now() -
      ((
        window as { PeakcastAndroid?: { launchElapsedMs?: () => number } }
      ).PeakcastAndroid?.launchElapsedMs?.() ?? 0);
    return bootStart - performance.now();
  });
  return (
    <motion.div
      className="startup-screen boot-screen"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ "--boot-offset": `${offset}ms` } as CSSProperties}
      // Hand-off to the app: the logo swells and fades as the screen clears,
      // while the shell rises in underneath (shell-motion.css, data-ready).
      exit="leave"
      variants={leaveScreen}
    >
      <motion.div
        className="boot-logo"
        aria-hidden="true"
        variants={leaveLogo}
      >
        <span className="boot-glow" />
        <span className="boot-floor" />
        <span className="boot-tile">
          <BrandMark />
          <span className="boot-sheen" />
        </span>
      </motion.div>
      {/* Out of flow, so the logo sits dead centre like the Android launch icon. */}
      <div className="boot-below">
        <span className="boot-wordmark" aria-hidden="true">
          peakcast<span>.</span>
        </span>
        <h2 className="sr-only">Opening your workspace.</h2>
        {/* Only a slow start earns words; a fast one is just the logo. */}
        <div className="boot-status" hidden={!warming}>
          <p>Still loading your data on this device…</p>
          <div className="startup-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

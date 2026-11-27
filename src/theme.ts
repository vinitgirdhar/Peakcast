import { useEffect, useState } from "react";
import { isAndroidApp } from "./platform.js";
export type Theme = "light" | "dark" | "system";
export function currentTheme(): Theme {
  const value = localStorage.getItem("peakcast.theme");
  if (value === "dark" || value === "light" || value === "system") return value;
  // The Android app follows the phone, like its launch screen; the website
  // defaults to light. Either can be changed in Settings.
  return isAndroidApp ? "system" : "light";
}
export function applyTheme() {
  const value = currentTheme();
  const dark =
    value === "dark" ||
    (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  const next = dark ? "dark" : "light";
  // The Android app matches its system bars and next launch screen to this.
  (
    window as { PeakcastAndroid?: { setSystemTheme?: (dark: boolean) => void } }
  ).PeakcastAndroid?.setSystemTheme?.(dark);
  const paint = () => {
    root.dataset.theme = next;
    root.style.colorScheme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#000000" : "#f7f8fa");
  };
  const animate =
    root.dataset.theme !== undefined &&
    root.dataset.theme !== next &&
    "startViewTransition" in document &&
    document.visibilityState === "visible" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animate) {
    paint();
    return;
  }
  // One GPU cross-fade between two snapshots (shell-motion.css) instead of
  // transitioning every element's colours, which repainted the whole page.
  // theme-switching stops per-element colour transitions from lagging behind.
  root.classList.add("theme-switching");
  const transition = document.startViewTransition(paint);
  transition.ready.catch(() => {
    /* Skipped (e.g. tab hidden): paint() still ran, so the switch is instant. */
  });
  void transition.finished.finally(() =>
    root.classList.remove("theme-switching"),
  );
}
export function useTheme() {
  const [theme, update] = useState(currentTheme);
  useEffect(() => {
    const sync = () => update(currentTheme());
    window.addEventListener("peakcast-theme", sync);
    return () => window.removeEventListener("peakcast-theme", sync);
  }, []);
  return {
    theme,
    setTheme: (value: Theme) => {
      localStorage.setItem("peakcast.theme", value);
      applyTheme();
      window.dispatchEvent(new Event("peakcast-theme"));
    },
  };
}

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
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // The Android app matches its system bars and next launch screen to this.
  (
    window as { PeakcastAndroid?: { setSystemTheme?: (dark: boolean) => void } }
  ).PeakcastAndroid?.setSystemTheme?.(dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#000000" : "#f7f8fa");
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

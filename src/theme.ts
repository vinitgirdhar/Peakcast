import { useEffect, useState } from "react";
export type Theme = "light" | "dark" | "system";
export function currentTheme(): Theme {
  const value = localStorage.getItem("wildcatter.theme");
  // Light is the default; following the system is an explicit choice in Settings.
  return value === "dark" || value === "system" ? value : "light";
}
export function applyTheme() {
  const value = currentTheme();
  const dark =
    value === "dark" ||
    (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#000000" : "#f7f8fa");
}
export function useTheme() {
  const [theme, update] = useState(currentTheme);
  useEffect(() => {
    const sync = () => update(currentTheme());
    window.addEventListener("wildcatter-theme", sync);
    return () => window.removeEventListener("wildcatter-theme", sync);
  }, []);
  return {
    theme,
    setTheme: (value: Theme) => {
      localStorage.setItem("wildcatter.theme", value);
      applyTheme();
      window.dispatchEvent(new Event("wildcatter-theme"));
    },
  };
}

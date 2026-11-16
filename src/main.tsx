import { createRoot } from "react-dom/client";
import { applyTheme } from "./theme.js";
import { App } from "./App.js";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/inter";
import "./styles.css";

applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  applyTheme,
);
createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* The online application remains available without offline installation. */
    });
  });
}

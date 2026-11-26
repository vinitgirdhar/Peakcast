import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { applyTheme } from "./theme.js";
import { App } from "./App.js";
import { MotionConfig } from "motion/react";
import { ease } from "./motion.js";
import { startOnDeviceApi } from "./local/index.js";
import { BackendStartup } from "./BackendStartup.js";
import "@fontsource-variable/inter";
import "./styles.css";
import "./design.css";

applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  applyTheme,
);
const root = createRoot(document.getElementById("root")!);
// The boot logo shows while the on-device engine starts. It lives outside #root,
// which stays empty until the app (and its API) is ready; App then continues
// the same animation in its own boot overlay.
const bootHost = document.body.appendChild(document.createElement("div"));
const boot = createRoot(bootHost);
boot.render(<BackendStartup warming={false} />);
function show(screen: ReactNode) {
  flushSync(() => root.render(screen));
  boot.unmount();
  bootHost.remove();
}
// Everything runs on this device: the API starts before the first screen.
startOnDeviceApi().then(
  () =>
    show(
      <MotionConfig reducedMotion="user" transition={{ duration: 0.24, ease }}>
        <App />
      </MotionConfig>,
    ),
  (error: unknown) => {
    console.error("Peakcast could not start", error);
    show(
      <main className="startup-screen" role="alert">
        <h2>Peakcast could not start on this device.</h2>
        <p>
          Private browsing or blocked site storage can stop it. Allow storage
          for this app, then reopen it.
        </p>
      </main>,
    );
  },
);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* The app still works; it just will not open offline from the browser. */
    });
  });
}

// Where this copy of Peakcast is running. The same web build ships as the
// website, inside the Android app (android/MainActivity.java) and inside the
// Windows app (desktop/main.mjs); each serves it from its own origin.

// Preview aid: open any page with ?platform=android to see the Android layout in a
// browser; it lasts for the tab (sessionStorage). It only changes presentation.
function previewPlatform(): string | null {
  try {
    const asked = new URLSearchParams(location.search).get("platform");
    if (asked) sessionStorage.setItem("peakcast.platform", asked);
    return sessionStorage.getItem("peakcast.platform");
  } catch {
    return null;
  }
}

/** The Android app: its bundled files are served from this reserved host. */
export const isAndroidApp =
  location.hostname === "appassets.androidplatform.net" ||
  previewPlatform() === "android";

/** The Windows desktop app. */
export const isDesktopApp = location.protocol === "app:";

/** Installed as an app (not a browser tab): Android, Windows, or a home-screen PWA. */
export const isInstalledApp =
  isAndroidApp ||
  isDesktopApp ||
  matchMedia("(display-mode: standalone)").matches;

export const platformName = isAndroidApp
  ? "Android app"
  : isDesktopApp
    ? "Windows app"
    : isInstalledApp
      ? "Installed web app"
      : "Web";

/** From package.json at build time (vite.config.ts). */
export const appVersion = __APP_VERSION__;
export const buildDate = __BUILD_DATE__;

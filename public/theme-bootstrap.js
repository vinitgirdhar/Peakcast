(() => {
  try {
    // Same default as src/theme.ts: the Android app follows the phone.
    const preference =
      localStorage.getItem("peakcast.theme") ||
      (location.hostname === "appassets.androidplatform.net"
        ? "system"
        : "light");
    const dark =
      preference === "dark" ||
      (preference === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {
    /* The application can still open when browser storage is unavailable. */
  }
})();

(() => {
  try {
    const preference = localStorage.getItem("wildcatter.theme");
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

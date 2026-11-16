(() => {
  const backend = "https://wildcatter-p3yy.onrender.com";
  const destination =
    new URLSearchParams(location.search).get("app") === "1" ? "/markets" : "/";
  const title = document.getElementById("wake-title");
  const message = document.getElementById("wake-message");
  const progress = document.getElementById("wake-progress");
  const caption = document.getElementById("wake-caption");
  const retry = document.getElementById("wake-retry");
  let probe, probeTimeout, retryTimeout, warmingTimeout, deadline;
  let stopped = true;

  function cleanup() {
    stopped = true;
    for (const timer of [probeTimeout, retryTimeout, warmingTimeout, deadline])
      clearTimeout(timer);
    if (probe) {
      probe.onload = probe.onerror = null;
      probe.removeAttribute("src");
      probe = null;
    }
  }
  function fail() {
    cleanup();
    title.textContent = navigator.onLine
      ? "A little longer than expected."
      : "You’re offline.";
    message.textContent = navigator.onLine
      ? "The server hasn’t responded yet. Please try again in a moment."
      : "Reconnect to the internet, then try again.";
    progress.hidden = true;
    caption.hidden = true;
    retry.hidden = false;
  }
  function check() {
    if (stopped) return;
    if (!navigator.onLine) return fail();
    // A decoded, uncached app icon confirms the backend is serving our app, not Render's HTML interstitial.
    const image = new Image();
    probe = image;
    let finished = false;
    const again = () => {
      if (finished || stopped) return;
      finished = true;
      clearTimeout(probeTimeout);
      image.onload = image.onerror = null;
      image.removeAttribute("src");
      retryTimeout = setTimeout(check, 3000);
    };
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      if (stopped || finished) return;
      finished = true;
      cleanup();
      location.replace(backend + destination);
    };
    image.onerror = again;
    probeTimeout = setTimeout(again, 15000);
    image.src = backend + "/icon-192.png?__wake=" + Date.now();
  }
  function start() {
    cleanup();
    stopped = false;
    retry.hidden = true;
    progress.hidden = false;
    caption.hidden = false;
    title.textContent = "Getting your workspace ready.";
    message.textContent = "Connecting to the demo server…";
    warmingTimeout = setTimeout(() => {
      title.textContent = "The server is warming up.";
      message.textContent =
        "(Please allow a minute or two. Our free demo server may be waking from inactivity.)";
    }, 3000);
    deadline = setTimeout(fail, 180000);
    check();
  }
  retry.addEventListener("click", start);
  window.addEventListener("pagehide", cleanup);
  start();
})();

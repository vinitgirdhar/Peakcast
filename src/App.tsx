import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  LayoutGrid,
  Menu,
  Settings as SettingsIcon,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ApiError, PeakcastClient } from "../shared/client.js";
import type {
  Account,
  Capabilities,
  Inbox,
  Market,
  Portfolio,
} from "../shared/types.js";
import { NotificationBell } from "./Notifications.js";
import { MobileDock } from "./Dock.js";
import { haptic } from "./haptics.js";
import { isAndroidApp } from "./platform.js";
import { BrandMark, EmptyState, errorMessage, formatCredits } from "./ui.js";
import { AnimatedNumber, ease } from "./motion.js";
import { MarketExplorer } from "./pages/Markets.js";
import { MarketDetail } from "./pages/MarketDetail.js";
import { PortfolioView } from "./pages/Portfolio.js";
import { DraftStudio } from "./pages/DraftStudio.js";
import { About } from "./pages/About.js";
import { LeaderboardView } from "./pages/Leaderboard.js";
import { Settings } from "./pages/Settings.js";
import { Landing } from "./pages/Landing.js";
import { BackendStartup, waitForBackend } from "./BackendStartup.js";
import { Teams } from "./pages/Teams.js";
import { WorkspaceView, type WorkspaceTab } from "./pages/Workspace.js";
import { JoinWorkspace } from "./pages/JoinWorkspace.js";
import { Onboarding, type OnboardingInput } from "./pages/Onboarding.js";
import { Legal, legalPaths } from "./pages/Legal.js";
import { TERMS_VERSION } from "../shared/legal.js";
// About lives inside Settings (its "About this app" section links to /about).
const navItems = [
  { path: "/markets", label: "Markets", icon: LayoutGrid },
  { path: "/portfolio", label: "Portfolio", icon: Wallet },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/studio", label: "Draft studio", icon: Sparkles },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
];
// Shown only where the server offers workspaces (not in the Windows app).
const teamsNavItems = [
  ...navItems.slice(0, 4),
  { path: "/teams", label: "Teams", icon: Users },
  ...navItems.slice(4),
];
// Phone tabs: the raised + in the middle replaces Draft studio (and Teams).
const dockItems = navItems.filter((item) => item.path !== "/studio");
const workspaceRoute =
  /^\/teams\/([0-9a-f-]{36})(?:\/(leaderboard|members)|\/markets\/([^/]+)(\/rules)?)?$/;
const storageKey = "peakcast.token.v1";
/** Same breakpoint as the phone layout in styles.css (bottom dock, no sidebar). */
const phoneQuery = "(max-width:760px), (pointer:coarse) and (max-width:1024px)";
export function App() {
  const [path, setPath] = useState(() => {
    // The Android app has no landing page: it opens on the markets.
    if (isAndroidApp && ["/", "/welcome"].includes(location.pathname))
      history.replaceState(history.state, "", "/markets");
    return location.pathname;
  });
  const [token, setToken] = useState(
    () => localStorage.getItem(storageKey) ?? "",
  );
  const [markets, setMarkets] = useState<Market[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [warming, setWarming] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const connected = ready && portfolio !== null;
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  // Workspace that Draft studio should launch to when opened from that workspace.
  const [launchTo, setLaunchTo] = useState<string | undefined>();
  // "new": no account yet; "consent": an older account that never accepted the terms.
  const [onboarding, setOnboarding] = useState<"new" | "consent" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [install, setInstall] = useState<
    (Event & { prompt: () => Promise<void> }) | null
  >(null);
  const client = new PeakcastClient("", token);
  function navigate(next: string, launchWorkspace?: string) {
    if (isAndroidApp && (next === "/" || next === "/welcome"))
      next = "/markets";
    history.pushState({}, "", next);
    setPath(next);
    setMenu(false);
    setLaunchTo(launchWorkspace);
    scrollTo(0, 0);
  }
  async function refresh(current = token) {
    const api = new PeakcastClient("", current);
    const [m, p, c, n] = await Promise.all([
      api.markets(),
      api.portfolio(),
      api.capabilities(),
      api.notifications(),
    ]);
    setMarkets(m.items);
    setPortfolio(p);
    setCapabilities(c);
    setInbox(n);
    setError("");
  }
  useEffect(() => {
    const back = () => {
      setPath(location.pathname);
      setMenu(false);
    };
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("popstate", back);
    window.addEventListener("beforeinstallprompt", onInstall);
    let active = true;
    const controller = new AbortController();
    setReady(false);
    setWarming(false);
    setError("");
    const warmingTimer = setTimeout(() => {
      if (active) setWarming(true);
    }, 3000);
    void (async () => {
      try {
        await waitForBackend(controller.signal);
        if (!active) return;
        let current = localStorage.getItem(storageKey) ?? "";
        let account: Account | null = null;
        if (current) {
          try {
            account = await new PeakcastClient("", current).account();
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 401) throw e;
            current = "";
            localStorage.removeItem(storageKey);
            setNotice("Your previous session expired. Set up a new account.");
          }
        }
        if (!active) return;
        setToken(current);
        if (!current) setOnboarding("new");
        else if (account?.termsVersion !== TERMS_VERSION)
          setOnboarding("consent");
        else {
          setOnboarding(null);
          await refresh(current);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        clearTimeout(warmingTimer);
        if (active) {
          setWarming(false);
          setReady(true);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(warmingTimer);
      window.removeEventListener("popstate", back);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, [startupAttempt]);
  useEffect(() => {
    if (!token || !connected) return;
    let active = true,
      pending = false;
    let slow: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      slow = setTimeout(() => {
        if (active) setWarming(true);
      }, 3000);
      void (async () => {
        try {
          await waitForBackend(controller.signal);
          if (active) await refresh(token);
        } catch (e) {
          if (!active) return;
          if (e instanceof ApiError && e.status === 401) {
            setPortfolio(null);
            setReady(false);
            setStartupAttempt((attempt) => attempt + 1);
          } else setError(errorMessage(e));
        } finally {
          clearTimeout(slow);
          pending = false;
          if (active) setWarming(false);
        }
      })();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(slow);
      controller.abort();
    };
  }, [token, connected]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!dialog.current) return;
    if (menu) dialog.current.showModal();
    else dialog.current.close();
    const previous = document.body.style.overflow;
    if (menu) document.body.style.overflow = "hidden";
    const mobile = matchMedia(phoneQuery);
    const desktop = matchMedia("(min-width:1100px)");
    const close = () => {
      if (mobile.matches || desktop.matches) setMenu(false);
    };
    mobile.addEventListener("change", close);
    desktop.addEventListener("change", close);
    return () => {
      document.body.style.overflow = previous;
      mobile.removeEventListener("change", close);
      desktop.removeEventListener("change", close);
    };
  }, [menu]);
  // Plain links to in-app pages (Settings → About, Terms, Help) open without a reload.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target ||
        link.hasAttribute("download") ||
        link.origin !== location.origin
      )
        return;
      const next = link.pathname;
      if (next !== "/about" && !legalPaths[next]) return;
      event.preventDefault();
      navigate(next);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  // Phone header stays pinned; a hairline shadow appears once content scrolls under it.
  const topbar = useRef<HTMLElement>(null);
  useEffect(() => {
    const onScroll = () =>
      topbar.current?.toggleAttribute("data-scrolled", scrollY > 4);
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);
  async function installApp() {
    if (install) {
      try {
        await install.prompt();
      } catch {
        setNotice(
          "Installation could not start. Use your browser’s install menu to try again.",
        );
      }
      setInstall(null);
    } else
      setNotice(
        "Use your browser menu to install the app. On iPhone, choose Share, then Add to Home Screen.",
      );
  }
  const route = /^\/markets\/([^/]+)(\/rules)?$/.exec(path);
  const marketId = route?.[1];
  const selected = markets.find((m) => m.id === marketId);
  const studio = path === "/studio" || path === "/studio/drafts";
  const about = path === "/about";
  // The marketing landing page is for the website; the Android app opens on markets.
  const landing = !isAndroidApp && (path === "/" || path === "/welcome");
  const teams = capabilities?.teams ?? false;
  const nav = teams ? teamsNavItems : navItems;
  const team = teams ? workspaceRoute.exec(path) : null;
  const joining = teams && path === "/join";
  const teamsPage = teams && (path === "/teams" || joining || !!team);
  const section = marketId
    ? "Markets"
    : studio
      ? "Draft studio"
      : about
        ? "Settings"
        : teamsPage
          ? "Teams"
          : (nav.find((n) => n.path === path)?.label ?? "Page not found");
  async function finishOnboarding(input: OnboardingInput) {
    let current = token;
    // Reuse an account a failed earlier attempt already created.
    if (!current) {
      current = (await new PeakcastClient().createSession()).token;
      localStorage.setItem(storageKey, current);
      setToken(current);
    }
    await new PeakcastClient("", current).completeOnboarding(input);
    await refresh(current);
    setOnboarding(null);
  }
  function signedOut() {
    localStorage.removeItem(storageKey);
    setToken("");
    setPortfolio(null);
    setInbox(null);
    setOnboarding("new");
    navigate("/");
    setNotice("Your account was deleted.");
  }
  const routeKey = team
    ? `/teams/${team[1]}`
    : marketId
      ? `/markets/${marketId}`
      : studio
        ? "/studio"
        : path;
  // Phones push deeper pages in from the right and pop back from the left;
  // React's "adjust state while rendering" pattern keeps the direction StrictMode-safe.
  // About opens from Settings, so it pushes like a page inside it.
  const depth = routeKey === "/about" ? 3 : routeKey.split("/").length;
  const [lastRoute, setLastRoute] = useState({ key: routeKey, depth, dir: 0 });
  if (lastRoute.key !== routeKey)
    setLastRoute({
      key: routeKey,
      depth,
      dir: Math.sign(depth - lastRoute.depth),
    });
  const phone = matchMedia(phoneQuery).matches;
  const routeEnter =
    phone && lastRoute.dir
      ? { opacity: 0, x: lastRoute.dir * 28 }
      : { opacity: 0, y: 6 };
  const legal = legalPaths[path];
  if (legal)
    return (
      <>
        <Legal
          page={legal}
          token={token}
          onBack={() =>
            history.length > 1 ? history.back() : navigate("/markets")
          }
          onDeleted={signedOut}
        />
        <Toast notice={notice} onDismiss={() => setNotice("")} />
      </>
    );
  // First child of each fragment below, so it survives the switch to onboarding and fades out.
  const boot = (
    <AnimatePresence>
      {!ready && <BackendStartup key="boot" warming={warming} />}
    </AnimatePresence>
  );
  if (ready && onboarding && !landing)
    return (
      <>
        {boot}
        <Onboarding
          key={onboarding}
          consentOnly={onboarding === "consent"}
          onComplete={finishOnboarding}
        />
        <Toast notice={notice} onDismiss={() => setNotice("")} />
      </>
    );
  if (landing)
    return (
      <>
        <Landing
          onContinue={() => navigate("/markets")}
          onInstall={installApp}
          canInstall={!!install}
        />
        <Toast notice={notice} onDismiss={() => setNotice("")} />
      </>
    );
  return (
    <>
      {boot}
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <aside className="desktop-sidebar" aria-label="Workspace">
          <button
            className="brand"
            aria-label="Peakcast home"
            onClick={() => navigate("/markets")}
          >
            <BrandMark />
            <span>peakcast.</span>
          </button>
          <span className="workspace-label">Your workspace</span>
          <nav aria-label="Main navigation">
            {nav.map(({ path: p, label, icon: Icon }) => (
              <button
                key={p}
                className={`nav-item ${section === label ? "active" : ""}`}
                aria-current={section === label ? "page" : undefined}
                onClick={() => navigate(p)}
              >
                {section === label && (
                  <motion.span
                    className="nav-active-bg"
                    layoutId="desktop-selection"
                    transition={{ duration: 0.28, ease }}
                  />
                )}
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="profile">
              <span className="status-dot" />
              <div>
                <strong>Practice. Learn. Forecast.</strong>
                <span>Demo credits. Real curiosity.</span>
              </div>
            </div>
          </div>
        </aside>
        <dialog
          ref={dialog}
          className="navigation-drawer"
          aria-label="Workspace menu"
          onClose={() => {
            setMenu(false);
            menuTrigger.current?.focus({ preventScroll: true });
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setMenu(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const controls = event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),a[href]",
            );
            const first = controls[0],
              last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <aside
            id="main-navigation"
            className="sidebar"
            aria-label="Main navigation"
          >
            <button
              className="icon-button close-navigation"
              aria-label="Close navigation"
              onClick={() => setMenu(false)}
            >
              <X size={18} />
            </button>
            <button
              className="brand"
              aria-label="Peakcast home"
              onClick={() => navigate("/markets")}
            >
              <BrandMark />
              <span>
                peakcast<span className="brand-dot">.</span>
              </span>
            </button>
            <div className="workspace-label">Workspace</div>
            <div className="navigation-material">
              <nav>
                {nav.map(({ path: p, label, icon: Icon }, index) => (
                  <button
                    key={p}
                    className={`nav-item ${section === label ? "active" : ""}`}
                    aria-current={section === label ? "page" : undefined}
                    onClick={() => navigate(p)}
                  >
                    {section === label && (
                      <motion.span
                        className="nav-active-bg"
                        layoutId="sidebar-selection"
                        transition={{ duration: 0.22, ease }}
                      />
                    )}
                    <span className={`nav-icon nav-icon-${index}`}>
                      <Icon size={18} />
                    </span>
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </div>
            <div className="sidebar-bottom">
              <div className="profile">
                <span className="status-dot" />
                <div>
                  <strong>Demo credits</strong>
                  <span>No real-money trading</span>
                </div>
              </div>
            </div>
          </aside>
        </dialog>
        <div className="main-shell">
          <header className="topbar" ref={topbar}>
            <div className="breadcrumb">
              <button
                className="icon-button desktop-menu"
                ref={menuTrigger}
                aria-label="Open navigation"
                aria-expanded={menu}
                aria-controls="main-navigation"
                onClick={() => setMenu(!menu)}
              >
                <Menu size={20} />
              </button>
              <button
                className="mobile-brand"
                aria-label="Peakcast home"
                onClick={() => navigate("/markets")}
              >
                <BrandMark />
                <span>peakcast.</span>
              </button>
              <strong>{section}</strong>
            </div>
            <div className="top-actions">
              <span className="environment">
                <span className="status-dot" />
                Demo environment
              </span>
              <button
                className="balance-button"
                onClick={() => navigate("/portfolio")}
              >
                <span className="balance-icon">
                  <Wallet size={16} />
                  {portfolio?.bonus.available && (
                    <span className="bonus-dot" aria-hidden="true" />
                  )}
                </span>
                <span>
                  {portfolio ? (
                    <AnimatedNumber
                      value={portfolio.balanceMicros}
                      format={formatCredits}
                    />
                  ) : (
                    "—"
                  )}{" "}
                  <small>credits</small>
                  {portfolio?.bonus.available && (
                    <span className="sr-only">(daily bonus ready)</span>
                  )}
                </span>
              </button>
              <NotificationBell
                client={client}
                inbox={inbox}
                onInbox={setInbox}
                onOpenMarket={(id, workspaceId) =>
                  navigate(
                    workspaceId
                      ? `/teams/${workspaceId}/markets/${id}`
                      : `/markets/${id}`,
                  )
                }
              />
              <button
                className="icon-button help-button"
                aria-label="Read platform documentation"
                onClick={() => navigate("/about")}
              >
                <CircleHelp size={19} />
              </button>
            </div>
          </header>
          <main id="main" tabIndex={-1}>
            {ready && warming && (
              <div className="backend-connection-notice" role="status">
                <span className="startup-progress" aria-hidden="true">
                  <span />
                </span>
                <p>Loading your data on this device…</p>
              </div>
            )}
            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <button
                  onClick={() =>
                    portfolio
                      ? void refresh().catch((e) => setError(errorMessage(e)))
                      : setStartupAttempt((attempt) => attempt + 1)
                  }
                >
                  Retry
                </button>
              </div>
            )}
            {!ready ? null : error && !portfolio ? (
              <EmptyState
                title="Your workspace isn’t ready yet."
                text="Use Retry above to reconnect. Your current page will stay open."
              />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  className="route-surface"
                  key={routeKey}
                  // ponytail: no exit fade, so the new page starts immediately instead of after a blank gap.
                  initial={routeEnter}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ duration: phone ? 0.24 : 0.18, ease }}
                >
                  {path === "/markets" && (
                    <MarketExplorer
                      markets={markets}
                      onOpen={(m) => navigate(`/markets/${m.id}`)}
                      onStudio={() => navigate("/studio")}
                    />
                  )}{" "}
                  {marketId &&
                    (selected ? (
                      <MarketDetail
                        key={selected.id}
                        market={selected}
                        portfolio={portfolio}
                        client={client}
                        view={route?.[2] ? "rules" : "forecast"}
                        onView={(view) => {
                          haptic("selection");
                          navigate(
                            `/markets/${selected.id}${view === "rules" ? "/rules" : ""}`,
                          );
                        }}
                        onBack={() => navigate("/markets")}
                        onTrade={() => refresh()}
                        onNotice={setNotice}
                        shareOrigin={capabilities?.shareOrigin ?? null}
                      />
                    ) : (
                      <EmptyState
                        title="Market not found"
                        text="This market is not available."
                        action={
                          <button
                            className="primary-button"
                            onClick={() => navigate("/markets")}
                          >
                            Browse markets
                          </button>
                        }
                      />
                    ))}
                  {path === "/portfolio" && (
                    <PortfolioView
                      portfolio={portfolio}
                      markets={markets}
                      onOpen={(id) => navigate(`/markets/${id}`)}
                      onBrowse={() => navigate("/markets")}
                      client={client}
                      onRefresh={() => refresh()}
                      onNotice={setNotice}
                    />
                  )}{" "}
                  {path === "/leaderboard" && (
                    <LeaderboardView client={client} />
                  )}
                  {path === "/settings" && (
                    <Settings token={token} onDeleted={signedOut} />
                  )}{" "}
                  {studio && (
                    <DraftStudio
                      client={client}
                      example={markets[0]}
                      onNotice={setNotice}
                      onLaunched={(market) => {
                        haptic("success");
                        setNotice(
                          market.workspaceId
                            ? "Private market launched. Only workspace members can see it."
                            : "Market launched. You earn 1% of every trade.",
                        );
                        navigate(
                          market.workspaceId
                            ? `/teams/${market.workspaceId}/markets/${market.id}`
                            : `/markets/${market.id}`,
                        );
                        void refresh().catch((e) => setError(errorMessage(e)));
                      }}
                      view={path.endsWith("/drafts") ? "drafts" : "create"}
                      onView={(view) => {
                        haptic("selection");
                        navigate(
                          view === "drafts" ? "/studio/drafts" : "/studio",
                          launchTo,
                        );
                      }}
                      teams={teams}
                      launchTo={launchTo}
                    />
                  )}{" "}
                  {teams && path === "/teams" && (
                    <Teams
                      client={client}
                      onOpen={(id) => navigate(`/teams/${id}`)}
                      onNotice={setNotice}
                    />
                  )}
                  {joining && (
                    <JoinWorkspace
                      client={client}
                      onJoined={(workspace) => {
                        setNotice(`You joined ${workspace.name}.`);
                        navigate(`/teams/${workspace.id}`);
                      }}
                      onTeams={() => navigate("/teams")}
                    />
                  )}
                  {team && (
                    <WorkspaceView
                      client={client}
                      workspaceId={team[1]}
                      tab={(team[2] as WorkspaceTab | undefined) ?? "markets"}
                      marketId={team[3]}
                      marketView={team[4] ? "rules" : "forecast"}
                      navigate={navigate}
                      onNotice={setNotice}
                      onDraft={() => navigate("/studio", team[1])}
                      onLeft={() => {
                        setNotice("You left the workspace.");
                        navigate("/teams");
                      }}
                      shareOrigin={capabilities?.shareOrigin ?? null}
                    />
                  )}
                  {about && (
                    <About
                      canInstall={!!install}
                      onInstall={installApp}
                      onBack={() => navigate("/settings")}
                    />
                  )}{" "}
                  {!marketId &&
                    !studio &&
                    !about &&
                    !teamsPage &&
                    !nav.some((n) => n.path === path) && (
                      <EmptyState
                        title="Page not found"
                        text="Return to the market explorer to keep forecasting."
                        action={
                          <button
                            className="primary-button"
                            onClick={() => navigate("/markets")}
                          >
                            Browse markets
                          </button>
                        }
                      />
                    )}
                </motion.div>
              </AnimatePresence>
            )}
            <footer className="footer">
              <span>
                <span className="status-dot" />
                Demo credits
              </span>
              <button onClick={() => navigate("/about")}>
                About this app
                <ArrowUpRight size={14} />
              </button>
            </footer>
          </main>
        </div>
        <MobileDock
          items={dockItems}
          section={section}
          teams={teams}
          client={client}
          onNavigate={navigate}
        />
        <Toast notice={notice} onDismiss={() => setNotice("")} />
      </div>
    </>
  );
}

function Toast({
  notice,
  onDismiss,
}: {
  notice: string;
  onDismiss: () => void;
}) {
  return (
    // The live region stays mounted so screen readers announce each new toast.
    <div aria-live="polite" className="toast-region">
      <AnimatePresence>
        {notice && (
          <motion.div
            role="status"
            className="toast liquid-material"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease }}
          >
            <Check size={18} />
            <span>{notice}</span>
            <button aria-label="Dismiss notification" onClick={onDismiss}>
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

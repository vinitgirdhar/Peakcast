import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  Code2,
  LayoutGrid,
  Menu,
  Settings as SettingsIcon,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ApiError, WildcatterClient } from "../shared/client.js";
import type {
  Capabilities,
  Inbox,
  Market,
  Portfolio,
} from "../shared/types.js";
import { NotificationBell } from "./Notifications.js";
import { BrandMark, EmptyState, errorMessage, formatCredits } from "./ui.js";
import { AnimatedNumber, ease } from "./motion.js";
import { MarketExplorer } from "./pages/Markets.js";
import { MarketDetail } from "./pages/MarketDetail.js";
import { PortfolioView } from "./pages/Portfolio.js";
import { DraftStudio } from "./pages/DraftStudio.js";
import { Developers } from "./pages/Developers.js";
import { LeaderboardView } from "./pages/Leaderboard.js";
import { Settings } from "./pages/Settings.js";
import { Landing } from "./pages/Landing.js";
import { BackendStartup, waitForBackend } from "./BackendStartup.js";
import { Teams } from "./pages/Teams.js";
import { WorkspaceView, type WorkspaceTab } from "./pages/Workspace.js";
import { JoinWorkspace } from "./pages/JoinWorkspace.js";
const navItems = [
  { path: "/markets", label: "Markets", icon: LayoutGrid },
  { path: "/portfolio", label: "Portfolio", icon: Wallet },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/studio", label: "Draft studio", icon: Sparkles },
  { path: "/developers", label: "Developers", icon: Code2 },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
];
// Shown only where the server offers workspaces (not in the Windows app).
const teamsNavItems = [
  ...navItems.slice(0, 4),
  { path: "/teams", label: "Teams", icon: Users },
  ...navItems.slice(4),
];
// The phone dock holds six destinations: Teams takes the Developers slot there.
const teamsDockItems = teamsNavItems.filter(
  (item) => item.path !== "/developers",
);
const workspaceRoute =
  /^\/teams\/([0-9a-f-]{36})(?:\/(leaderboard|members)|\/markets\/([^/]+)(\/rules)?)?$/;
const storageKey = "wildcatter.demo.token.v1";
export function App() {
  const [path, setPath] = useState(location.pathname);
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
  const dialog = useRef<HTMLDialogElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [install, setInstall] = useState<
    (Event & { prompt: () => Promise<void> }) | null
  >(null);
  const client = new WildcatterClient("", token);
  function navigate(next: string, launchWorkspace?: string) {
    history.pushState({}, "", next);
    setPath(next);
    setMenu(false);
    setLaunchTo(launchWorkspace);
    scrollTo(0, 0);
  }
  async function refresh(current = token) {
    const api = new WildcatterClient("", current);
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
        if (current) {
          try {
            await new WildcatterClient("", current).portfolio();
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 401) throw e;
            current = "";
            setNotice(
              "Your previous demo session expired. A new demo account was created.",
            );
          }
        }
        if (!current) {
          current = (await new WildcatterClient().createSession()).token;
          localStorage.setItem(storageKey, current);
        }
        if (active) {
          setToken(current);
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
    const mobile = matchMedia(
      "(max-width:760px), (pointer:coarse) and (max-width:1024px)",
    );
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
  const developers = [
    "/developers",
    "/developers/api",
    "/developers/setup",
  ].includes(path);
  const landing = path === "/" || path === "/welcome";
  const teams = capabilities?.teams ?? false;
  const nav = teams ? teamsNavItems : navItems;
  const team = teams ? workspaceRoute.exec(path) : null;
  const joining = teams && path === "/join";
  const teamsPage = teams && (path === "/teams" || joining || !!team);
  const section = marketId
    ? "Markets"
    : studio
      ? "Draft studio"
      : developers
        ? "Developers"
        : teamsPage
          ? "Teams"
          : (nav.find((n) => n.path === path)?.label ?? "Page not found");
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
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="desktop-sidebar" aria-label="Workspace">
        <button
          className="brand"
          aria-label="Wildcatter home"
          onClick={() => navigate("/markets")}
        >
          <BrandMark />
          <span>wildcatter.</span>
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
          <button
            className="nav-item"
            onClick={() => navigate("/developers/setup")}
          >
            <CircleHelp size={18} />
            App & integrations
          </button>
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
            aria-label="Wildcatter home"
            onClick={() => navigate("/markets")}
          >
            <BrandMark />
            <span>
              wildcatter<span className="brand-dot">.</span>
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
            <button
              className="nav-item subdued"
              onClick={() => navigate("/developers/setup")}
            >
              <BookOpen size={18} />
              App & integrations
            </button>
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
        <header className="topbar">
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
              aria-label="Wildcatter home"
              onClick={() => navigate("/markets")}
            >
              <BrandMark />
              <span>wildcatter.</span>
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
              onClick={() => navigate("/developers")}
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
              <p>
                The server is warming up.{" "}
                <span>(Please allow a minute or two.)</span>
              </p>
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
          {!ready ? (
            <BackendStartup warming={warming} />
          ) : error && !portfolio ? (
            <EmptyState
              title="Your workspace isn’t ready yet."
              text="Use Retry above to reconnect. Your current page will stay open."
            />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="route-surface"
                key={
                  team
                    ? `/teams/${team[1]}`
                    : marketId
                      ? `/markets/${marketId}`
                      : studio
                        ? "/studio"
                        : path
                }
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.2, ease }}
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
                      onView={(view) =>
                        navigate(
                          `/markets/${selected.id}${view === "rules" ? "/rules" : ""}`,
                        )
                      }
                      onBack={() => navigate("/markets")}
                      onTrade={() => refresh()}
                      onNotice={setNotice}
                      shareOrigin={capabilities?.shareOrigin ?? null}
                      capabilities={capabilities}
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
                {path === "/leaderboard" && <LeaderboardView client={client} />}
                {path === "/settings" && (
                  <Settings
                    managed={capabilities?.aiAccessManaged ?? false}
                    token={token}
                    providers={capabilities?.aiProviders ?? []}
                    onRefresh={() => refresh()}
                  />
                )}{" "}
                {studio && (
                  <DraftStudio
                    managed={capabilities?.aiAccessManaged ?? false}
                    client={client}
                    configured={capabilities?.aiConfigured ?? false}
                    providers={capabilities?.aiProviders ?? []}
                    defaultProvider={capabilities?.defaultAIProvider ?? null}
                    example={markets[0]}
                    onNotice={setNotice}
                    onLaunched={(market) => {
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
                    onView={(view) =>
                      navigate(
                        view === "drafts" ? "/studio/drafts" : "/studio",
                        launchTo,
                      )
                    }
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
                {developers && (
                  <Developers
                    token={token}
                    view={
                      path.endsWith("/api")
                        ? "api"
                        : path.endsWith("/setup")
                          ? "setup"
                          : "overview"
                    }
                    onView={(view) =>
                      navigate(
                        `/developers${view === "overview" ? "" : `/${view}`}`,
                      )
                    }
                    installed={!!install}
                    onInstall={installApp}
                  />
                )}{" "}
                {!marketId &&
                  !studio &&
                  !developers &&
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
            <button onClick={() => navigate("/developers/setup")}>
              About this app
              <ArrowUpRight size={14} />
            </button>
          </footer>
        </main>
      </div>
      <nav className="mobile-dock" aria-label="Quick navigation">
        {(teams ? teamsDockItems : navItems).map(
          ({ path: p, label, icon: Icon }) => (
            <button
              key={p}
              onClick={() => navigate(p)}
              aria-current={section === label ? "page" : undefined}
              className={section === label ? "selected" : ""}
            >
              {section === label && (
                <motion.span
                  className="dock-selection"
                  layoutId="dock-selection"
                  transition={{ duration: 0.22, ease }}
                />
              )}
              <Icon size={21} />
              <span>{label === "Draft studio" ? "Studio" : label}</span>
            </button>
          ),
        )}
      </nav>
      <Toast notice={notice} onDismiss={() => setNotice("")} />
    </div>
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

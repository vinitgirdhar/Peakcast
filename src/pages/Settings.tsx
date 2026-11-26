import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../theme.js";
import { motion } from "motion/react";
import { AccountSection } from "./AccountSection.js";
import { appVersion, buildDate, platformName } from "../platform.js";
import "../settings.css";
export function Settings({
  token,
  onDeleted,
}: {
  token: string;
  onDeleted: () => void;
}) {
  const { theme, setTheme } = useTheme();
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Make Peakcast your own.</p>
        </div>
      </div>
      <AccountSection token={token} onDeleted={onDeleted} />
      <section className="settings-panel">
        <h2>Appearance</h2>
        <p>Choose a look for the app.</p>
        <div
          className="appearance-options"
          role="group"
          aria-label="Appearance"
        >
          {(
            [
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Monitor },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-pressed={theme === item.id}
              onClick={() => setTheme(item.id)}
            >
              {theme === item.id && (
                <motion.span
                  className="appearance-selection"
                  layoutId="appearance-selection"
                />
              )}
              <item.icon size={22} />
              {item.label}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-panel">
        <h2>Your data</h2>
        <p>
          Everything you do in Peakcast stays on this device: your account,
          credits, trades and drafts. Nothing is sent to a server. Clearing the
          app’s storage or uninstalling it erases it.
        </p>
      </section>
      <section className="settings-panel" aria-labelledby="app-info">
        <h2 id="app-info">About this app</h2>
        <dl className="app-info">
          <div>
            <dt>Version</dt>
            <dd>{appVersion}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>{platformName}</dd>
          </div>
          <div>
            <dt>Built</dt>
            <dd>{new Date(`${buildDate}T00:00:00`).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>Stored on this device, works offline</dd>
          </div>
          <div>
            <dt>Credits</dt>
            <dd>Practice only, no real money</dd>
          </div>
        </dl>
        <nav className="app-info-links" aria-label="App information">
          <a href="/about">About Peakcast</a>
          <a href="/help">Help</a>
          <a href="/terms">Terms of Use</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/delete-account">Delete account</a>
        </nav>
        <p className="fine-print">© {new Date().getFullYear()} Bay2Peak</p>
      </section>
    </div>
  );
}

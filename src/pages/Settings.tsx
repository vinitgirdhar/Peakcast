import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Coins,
  FileText,
  HardDrive,
  Monitor,
  Moon,
  Shield,
  Smartphone,
  Sun,
  Tag,
} from "lucide-react";
import { useTheme, type Theme } from "../theme.js";
import { motion } from "motion/react";
import { AccountSection } from "./AccountSection.js";
import { haptic } from "../haptics.js";
import { appVersion, buildDate, platformName } from "../platform.js";
import "../settings.css";

const appearance = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

const links = [
  { href: "/about", label: "About Peakcast", icon: BookOpen, tone: "indigo" },
  { href: "/help", label: "Help", icon: CircleHelp, tone: "blue" },
  { href: "/terms", label: "Terms of Use", icon: FileText, tone: "gray" },
  { href: "/privacy", label: "Privacy Policy", icon: Shield, tone: "gray" },
] as const;

export function Settings({
  token,
  onDeleted,
}: {
  token: string;
  onDeleted: () => void;
}) {
  const { theme, setTheme } = useTheme();
  // The pill moves on this frame; the theme cross-fade starts two frames
  // later, so the two animations never compete for the same frames.
  const [selected, setSelected] = useState<Theme>(theme);
  useEffect(() => setSelected(theme), [theme]);
  function choose(id: Theme) {
    if (id === selected) return;
    haptic("selection");
    setSelected(id);
    requestAnimationFrame(() => requestAnimationFrame(() => setTheme(id)));
  }
  const info = [
    { label: "Version", value: appVersion, icon: Tag, tone: "gray" },
    { label: "Platform", value: platformName, icon: Smartphone, tone: "gray" },
    {
      label: "Built",
      value: new Date(`${buildDate}T00:00:00`).toLocaleDateString(),
      icon: CalendarDays,
      tone: "gray",
    },
    {
      label: "Data",
      value: "Stored on this device, works offline",
      icon: HardDrive,
      tone: "gray",
    },
    {
      label: "Credits",
      value: "Practice only, no real money",
      icon: Coins,
      tone: "orange",
    },
  ];
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Make Peakcast your own.</p>
        </div>
      </div>
      <AccountSection token={token} onDeleted={onDeleted}>
        <section
          className="settings-section"
          aria-labelledby="appearance-heading"
        >
          <h2 id="appearance-heading">Appearance</h2>
          <div className="settings-group">
            <div
              className="appearance-options"
              role="group"
              aria-label="Appearance"
            >
              {appearance.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={selected === item.id}
                  onClick={() => choose(item.id)}
                >
                  {selected === item.id && (
                    <motion.span
                      className="appearance-selection"
                      layoutId="appearance-selection"
                      transition={{
                        type: "spring",
                        stiffness: 520,
                        damping: 40,
                      }}
                    />
                  )}
                  <item.icon size={20} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <p className="settings-footer">
            Choose a look for the app. System follows your phone.
          </p>
        </section>
        <section className="settings-section" aria-labelledby="data-heading">
          <h2 id="data-heading">Your data</h2>
          <p className="settings-group settings-note">
            Everything you do in Peakcast stays on this device: your account,
            credits, trades and drafts. Nothing is sent to a server. Clearing
            the app’s storage or uninstalling it erases it.
          </p>
        </section>
        <section className="settings-section" aria-labelledby="app-info">
          <h2 id="app-info">About this app</h2>
          <dl className="settings-group app-info">
            {info.map((row) => (
              <div className="settings-row" key={row.label}>
                <span
                  className="settings-icon"
                  data-tone={row.tone}
                  aria-hidden="true"
                >
                  <row.icon size={17} />
                </span>
                <dt className="settings-label">{row.label}</dt>
                <dd className="settings-value">{row.value}</dd>
              </div>
            ))}
          </dl>
          <nav
            className="settings-group app-info-links"
            aria-label="App information"
          >
            {links.map((link) => (
              <a className="settings-row" href={link.href} key={link.href}>
                <span
                  className="settings-icon"
                  data-tone={link.tone}
                  aria-hidden="true"
                >
                  <link.icon size={17} />
                </span>
                <span className="settings-label">{link.label}</span>
                <ChevronRight
                  className="settings-chevron"
                  size={17}
                  aria-hidden="true"
                />
              </a>
            ))}
          </nav>
        </section>
      </AccountSection>
      <p className="fine-print">© {new Date().getFullYear()} Vinit Girdhar</p>
    </div>
  );
}

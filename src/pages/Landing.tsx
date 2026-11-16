import {
  ArrowRight,
  Code2,
  Download,
  LineChart,
  Monitor,
  Moon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
} from "lucide-react";
import { BrandMark } from "../ui.js";
import { useTheme } from "../theme.js";

const features = [
  {
    icon: LineChart,
    title: "Instant YES / NO pricing",
    text: "An automated market maker quotes every trade up front, with a 1% price limit you can see before you confirm.",
  },
  {
    icon: ShieldCheck,
    title: "Rules you can read",
    text: "Every market names its primary source, closing time and exactly what resolves YES, NO or sends it to review.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted drafting",
    text: "Write a question, then tighten its resolution rules with Gemini, Groq, OpenAI or a local Ollama model.",
  },
  {
    icon: Code2,
    title: "Open developer API",
    text: "The same versioned HTTP API and typed client that power this app, documented with OpenAPI.",
  },
];

export function Landing({
  onContinue,
  onInstall,
  canInstall,
}: {
  onContinue: () => void;
  onInstall: () => Promise<void>;
  canInstall: boolean;
}) {
  const { setTheme } = useTheme();
  const dark = document.documentElement.dataset.theme === "dark";
  return (
    <div className="landing">
      <header>
        <a className="brand" href="/">
          <BrandMark />
          <span>wildcatter.</span>
        </a>
        <div className="landing-nav">
          <a href="/developers">Developers</a>
          <button
            className="icon-button theme-toggle"
            aria-label="Switch color theme"
            onClick={() => setTheme(dark ? "light" : "dark")}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <main>
        <div className="landing-copy">
          <span className="landing-eyebrow">
            <span className="status-dot" />
            Demo credits only · No real money
          </span>
          <h1>
            Turn your view
            <br />
            into a forecast.
          </h1>
          <p>
            Explore prediction markets, trade YES or NO with 10,000 practice
            credits, and draft sharper questions with AI. One workspace on web,
            desktop and mobile.
          </p>
          <div className="landing-actions">
            <button className="primary-button" onClick={onContinue}>
              Continue on the web
              <ArrowRight size={18} />
            </button>
            <button className="text-button" onClick={() => void onInstall()}>
              {canInstall ? "Install browser app" : "Prefer the browser app?"}
            </button>
          </div>
          <div className="landing-downloads">
            <a
              href="/downloads/Wildcatter-Windows.zip"
              className="secondary-button"
            >
              <Monitor size={17} />
              Download for Windows
              <Download size={15} />
            </a>
            <a
              className="secondary-button"
              href="/downloads/Wildcatter-Android.apk"
            >
              <Smartphone size={17} />
              Download for Android
              <Download size={15} />
            </a>
          </div>
        </div>
        <div className="landing-preview" aria-label="Illustrative market">
          <div className="landing-preview-top">
            <span className="small-pill">Science</span>
            <span>Illustrative market</span>
          </div>
          <h2>Will the next breakthrough happen this year?</h2>
          <div className="landing-preview-number">
            68%<small>chance of YES</small>
          </div>
          <svg
            viewBox="0 0 400 120"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0 105C50 100 70 78 110 82S170 50 210 56S280 30 320 28S380 14 400 12V120H0Z"
              fill="#315cf5"
              fillOpacity="0.1"
            />
            <path
              d="M0 105C50 100 70 78 110 82S170 50 210 56S280 30 320 28S380 14 400 12"
              fill="none"
              stroke="#4f6ef7"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="landing-preview-outcomes">
            <span className="yes">
              Yes <strong>68.0¢</strong>
            </span>
            <span className="no">
              No <strong>32.0¢</strong>
            </span>
          </div>
        </div>
      </main>
      <section className="landing-features" aria-label="What you can do">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon size={20} />
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>
      <footer>
        <span>Wildcatter · Demo environment, no real-money payouts.</span>
        <a href="/developers">
          Build with our API <ArrowRight size={14} />
        </a>
      </footer>
    </div>
  );
}

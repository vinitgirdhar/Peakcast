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
  ArrowUpRight,
  LayoutGrid,
  Wallet,
  Trophy,
} from "lucide-react";
import { BrandMark } from "../ui.js";
import { useTheme } from "../theme.js";
import { motion, useReducedMotion } from "motion/react";
import { ease, itemMotion, listMotion } from "../motion.js";

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
  const reduce = useReducedMotion();
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
        <motion.div
          className="landing-copy"
          variants={listMotion}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          <motion.span className="landing-eyebrow" variants={itemMotion}>
            <span className="status-dot" />A workspace for the curious
          </motion.span>
          <motion.h1 variants={itemMotion}>
            Turn your view
            <br />
            into a forecast.
          </motion.h1>
          <motion.p variants={itemMotion}>
            Big questions. Clear possibilities. Explore prediction markets,
            sharpen your instincts, and put your perspective into practice.
          </motion.p>
          <motion.div
            className="landing-actions"
            variants={itemMotion}
            role="region"
            aria-label="Get Wildcatter"
          >
            <button className="primary-button" onClick={onContinue}>
              Continue on the web
              <ArrowRight size={18} />
            </button>
            <a
              href="/downloads/Wildcatter-Windows.zip"
              className="secondary-button"
            >
              <Monitor size={17} />
              Download desktop app
              <Download size={15} />
            </a>
            <a
              href="/downloads/Wildcatter-Android.apk"
              className="secondary-button"
            >
              <Smartphone size={17} />
              Download for Android
              <Download size={15} />
            </a>
          </motion.div>
          <motion.p className="landing-disclaimer" variants={itemMotion}>
            10,000 practice credits to begin. No real money.
          </motion.p>
          <motion.div variants={itemMotion} className="landing-install">
            <button className="text-button" onClick={() => void onInstall()}>
              {canInstall ? "Install browser app" : "Install as a browser app"}
            </button>
            <span>Desktop download for Windows 64-bit.</span>
          </motion.div>
        </motion.div>
        <motion.div
          className="product-preview"
          aria-label="Illustrative forecasting workspace"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: reduce ? 0 : 0.65, ease }}
        >
          <aside className="preview-navigation" aria-hidden="true">
            <span className="preview-wordmark">wildcatter.</span>
            <span className="preview-nav-active">
              <LayoutGrid size={16} />
              Markets
            </span>
            <span>
              <Wallet size={16} />
              Portfolio
            </span>
            <span>
              <Trophy size={16} />
              Leaderboard
            </span>
            <span>
              <Sparkles size={16} />
              Draft studio
            </span>
            <small>
              <span className="status-dot" />
              Demo workspace
            </small>
          </aside>
          <div className="preview-workspace">
            <div className="preview-topline">
              <span>Markets</span>
              <span>
                10,000 <small>credits</small>
              </span>
            </div>
            <div className="preview-heading">
              <h2>A world of possibilities.</h2>
              <span>Illustrative preview</span>
            </div>
            <div className="preview-dashboard">
              <div className="landing-preview" aria-label="Illustrative market">
                <div className="landing-preview-top">
                  <span className="small-pill">Science</span>
                  <ArrowUpRight size={17} />
                </div>
                <h3>Will the next breakthrough happen this year?</h3>
                <div className="landing-preview-number">
                  68%<small>chance of YES</small>
                </div>
                <svg
                  viewBox="0 0 500 130"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient
                      id="preview-fill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop stopColor="currentColor" stopOpacity=".08" />
                      <stop
                        offset="1"
                        stopColor="currentColor"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 105 25 90 50 98 75 70 100 80 125 55 150 68 175 60 200 78 225 52 250 58 275 35 300 42 325 20 350 32 375 18 400 38 425 14 450 20 475 6 500 14V130H0Z"
                    fill="url(#preview-fill)"
                  />
                  <motion.path
                    d="M0 105 25 90 50 98 75 70 100 80 125 55 150 68 175 60 200 78 225 52 250 58 275 35 300 42 325 20 350 32 375 18 400 38 425 14 450 20 475 6 500 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={reduce ? { pathLength: 1 } : undefined}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: reduce ? 0 : 1.2, ease }}
                  />
                </svg>
                <div className="preview-chart-axis">
                  <span>9:00</span>
                  <span>12:00</span>
                  <span>15:00</span>
                  <span>18:00</span>
                </div>
              </div>
              <div className="preview-ticket">
                <Wallet size={20} />
                <span>Your practice balance</span>
                <strong>
                  10,000<small>credits</small>
                </strong>
                <div className="preview-ticket-rule" />
                <span>Choose a possibility.</span>
                <div className="landing-preview-outcomes">
                  <span className="yes">
                    Yes <strong>68.0¢</strong>
                  </span>
                  <span className="no">
                    No <strong>32.0¢</strong>
                  </span>
                </div>
                <span className="preview-trade-button">
                  Your perspective matters.
                </span>
              </div>
            </div>
            <div className="preview-market-list">
              {[
                {
                  symbol: "₿",
                  category: "Crypto",
                  title: "The next chapter for Bitcoin",
                  chance: "72%",
                },
                {
                  symbol: "↗",
                  category: "Economy",
                  title: "Where do rates go from here?",
                  chance: "64%",
                },
                {
                  symbol: "✳",
                  category: "Technology",
                  title: "What will AI make possible?",
                  chance: "81%",
                },
              ].map((item) => (
                <div key={item.category}>
                  <span
                    className={`preview-market-symbol ${item.category.toLowerCase()}`}
                  >
                    {item.symbol}
                  </span>
                  <div>
                    <small>{item.category}</small>
                    <strong>{item.title}</strong>
                  </div>
                  <span>{item.chance}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </main>
      <section
        id="product-film"
        className="product-film"
        aria-labelledby="product-film-title"
      >
        <div className="product-film-heading">
          <div>
            <span className="landing-eyebrow">
              The product film · 1 min 54 sec
            </span>
            <h2 id="product-film-title">A closer look at Wildcatter.</h2>
          </div>
          <p>
            From your first question to a considered forecast. See the real app
            across Windows, web and Android.
          </p>
        </div>
        <div className="product-film-frame">
          <video
            controls
            playsInline
            preload="none"
            poster="/media/wildcatter-product-introduction.jpg"
            width="1920"
            height="1080"
            aria-label="Introducing Wildcatter — narrated product film"
          >
            <source
              src="/media/wildcatter-product-introduction.mp4"
              type="video/mp4"
            />
            <track
              kind="captions"
              src="/media/wildcatter-product-introduction.en.vtt"
              srcLang="en"
              label="English"
              default
            />
            <p>
              <a href="/media/wildcatter-product-introduction.mp4">
                Download the Wildcatter product film
              </a>
              .
            </p>
          </video>
        </div>
        <details className="product-film-details">
          <summary>About the film & credits</summary>
          <p>
            Filmed using the actual application and demo credits. Windows has a
            separate local workspace. Web and Android share hosted market data;
            the refresh interval is compressed in the demonstration.
          </p>
          <p>
            Music: “Happy Beats / Business Moves, Vol. 12” by Sascha Ende,
            ende.app, under{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
            . Android is a trademark of Google LLC. The Android robot is
            reproduced or modified from work created and shared by Google and
            used according to terms described in the{" "}
            <a href="https://creativecommons.org/licenses/by/3.0/">
              Creative Commons 3.0 Attribution License
            </a>
            . Windows is a trademark of Microsoft Corporation.
          </p>
          <a href="/media/wildcatter-product-introduction.mp4" download>
            Download the film (MP4)
          </a>
        </details>
      </section>
      <motion.section
        className="landing-features"
        aria-label="What you can do"
        variants={listMotion}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
      >
        {features.map(({ icon: Icon, title, text }) => (
          <motion.div key={title} variants={itemMotion}>
            <Icon size={20} />
            <h3>{title}</h3>
            <p>{text}</p>
          </motion.div>
        ))}
      </motion.section>
      <footer>
        <span>Wildcatter · Demo environment, no real-money payouts.</span>
        <a href="/developers">
          Build with our API <ArrowRight size={14} />
        </a>
      </footer>
    </div>
  );
}

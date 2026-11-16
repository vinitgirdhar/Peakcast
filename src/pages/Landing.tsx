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
  Play,
} from "lucide-react";
import { useRef, useState } from "react";
import { BrandMark } from "../ui.js";
import { useTheme } from "../theme.js";
import { motion, useReducedMotion } from "motion/react";
import { itemMotion, listMotion } from "../motion.js";

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
  const film = useRef<HTMLVideoElement>(null);
  const [filmStarted, setFilmStarted] = useState(false);
  function playFilm() {
    const video = film.current;
    if (!video) return;
    setFilmStarted(true);
    video.src = "/media/wildcatter-product-introduction.mp4";
    // Keep the request inside the click gesture; native controls remain available if playback is blocked.
    void video.play().catch(() => {});
  }
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
            ref={film}
            controls={filmStarted}
            playsInline
            preload="none"
            poster="/media/wildcatter-product-introduction.jpg"
            width="1920"
            height="1080"
            aria-label="Introducing Wildcatter — narrated product film"
          >
            <track
              kind="captions"
              src={
                filmStarted
                  ? "/media/wildcatter-product-introduction.en.vtt"
                  : undefined
              }
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
          {!filmStarted && (
            <button
              type="button"
              className="product-film-start"
              aria-label="Play the Wildcatter product film"
              onClick={playFilm}
            >
              <span>
                <Play size={20} fill="currentColor" aria-hidden="true" />
                Watch the film
              </span>
            </button>
          )}
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

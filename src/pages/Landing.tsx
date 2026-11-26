import {
  ArrowRight,
  HardDrive,
  Download,
  LineChart,
  Monitor,
  Moon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Play,
  Plus,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { BrandMark } from "../ui.js";
import { useTheme } from "../theme.js";
import { motion, useReducedMotion } from "motion/react";
import { Collapse, itemMotion, listMotion } from "../motion.js";

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
    title: "Build your own markets",
    text: "Draft a question, let the rule checker flag vague wording, then launch it and earn 1% of every trade.",
  },
  {
    icon: HardDrive,
    title: "Private by design",
    text: "No server, no sign-up, no tracking. Everything runs and stays on your device, even offline.",
  },
];

const faqs = [
  {
    question: "Can I try Peakcast without installing anything?",
    answer:
      "Yes. Choose Continue on the web above to open the workspace in your browser. You start with 5,000 practice credits.",
  },
  {
    question: "How do I install the Windows desktop app?",
    answer:
      "Choose Download desktop app above, extract the entire ZIP into a folder, then open Peakcast.exe. The download is for Windows 64-bit and runs fully offline.",
  },
  {
    question: "Is there an Android app?",
    answer:
      "Yes. Choose Download for Android above, open the downloaded APK on your phone, and follow the installation prompts. The app runs fully on your phone and needs no internet connection.",
  },
  {
    question: "Can I use it on iPhone, iPad, or Mac?",
    answer:
      "Use the web app in your browser. On iPhone or iPad, open the site in Safari and choose Share, then Add to Home Screen. Other supported browsers offer an Install app option in their menu. There is no native iOS or macOS download.",
  },
  {
    question: "Does my data sync across devices?",
    answer:
      "No. Peakcast has no server, so each browser, phone or computer keeps its own separate account, credits and markets. Nothing you do leaves the device.",
  },
  {
    question: "Does Peakcast use real money?",
    answer:
      "No. This is a demo with practice credits. Credits cannot be purchased, withdrawn, or exchanged for money, and there are no real-money payouts.",
  },
  {
    question: "What happens if I clear my browser data or uninstall?",
    answer:
      "Your account and everything in it are erased, because they exist only on that device. You can start again with a fresh 5,000 credits.",
  },
];

function FAQItem({ question, answer }: (typeof faqs)[number]) {
  const answerId = useId();
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const open = expanded || hovered;
  return (
    <div
      className="landing-faq-item"
      onPointerEnter={(event) => {
        if (
          event.pointerType === "mouse" &&
          matchMedia("(hover: hover)").matches
        )
          setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="landing-faq-question"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => {
          setExpanded(!open);
          setHovered(false);
        }}
      >
        {question}
        <Plus size={18} aria-hidden="true" />
      </button>
      <div inert={!open}>
        <Collapse open={open} id={answerId}>
          <p>{answer}</p>
        </Collapse>
      </div>
    </div>
  );
}

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
          <span>peakcast.</span>
        </a>
        <div className="landing-nav">
          <a href="/about">About</a>
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
            aria-label="Get Peakcast"
          >
            <button className="primary-button" onClick={onContinue}>
              Continue on the web
              <ArrowRight size={18} />
            </button>
            <a
              href="/downloads/Peakcast-Windows.zip"
              className="secondary-button"
            >
              <Monitor size={17} />
              Download desktop app
              <Download size={15} />
            </a>
            <a
              href="/downloads/Peakcast-Android.apk"
              className="secondary-button"
            >
              <Smartphone size={17} />
              Download for Android
              <Download size={15} />
            </a>
          </motion.div>
          <motion.p className="landing-disclaimer" variants={itemMotion}>
            5,000 practice credits to begin. No real money.
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
            <h2 id="product-film-title">A closer look at Peakcast.</h2>
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
            aria-label="Introducing Peakcast — narrated product film"
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
                Download the Peakcast product film
              </a>
              .
            </p>
          </video>
          {!filmStarted && (
            <button
              type="button"
              className="product-film-start"
              aria-label="Play the Peakcast product film"
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
      <motion.section
        id="faq"
        className="landing-faq"
        aria-labelledby="faq-title"
        variants={itemMotion}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
      >
        <div className="landing-faq-heading">
          <span className="landing-eyebrow">A few helpful answers</span>
          <h2 id="faq-title">Questions? Start here.</h2>
          <p>Everything you need to get settled in.</p>
        </div>
        <div className="landing-faq-list">
          {faqs.map((faq) => (
            <FAQItem key={faq.question} {...faq} />
          ))}
        </div>
      </motion.section>
      <footer>
        <span>Peakcast · Practice credits only, no real-money payouts.</span>
        <nav aria-label="Footer">
          <a href="#faq">FAQ</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/help">Help</a>
          <a href="/about">
            About Peakcast <ArrowRight size={14} />
          </a>
        </nav>
      </footer>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BrandMark, errorMessage } from "../ui.js";
import { ease } from "../motion.js";
import { haptic } from "../haptics.js";
import { isAndroidApp } from "../platform.js";
import "../onboarding.css";

const intro = [
  {
    icon: Sparkles,
    title: "Forecast the future. Trade what you believe.",
    text: "Every market is a yes-or-no question about something that hasn't happened yet. Buy YES or NO, and the price moves with the crowd.",
  },
  {
    icon: Scale,
    title: "Prices are probabilities.",
    text: "A YES price of 70 means the crowd thinks there's about a 70% chance. When a market resolves, each winning share pays 1 credit. Outcomes need evidence and can be challenged.",
  },
  {
    icon: ShieldCheck,
    title: "Start in Playground mode.",
    text: "You get 5,000 practice credits to learn with. They have no cash value and can't be bought or withdrawn. Real-money trading is not offered.",
  },
] as const;

export interface OnboardingInput {
  displayName: string;
  acceptTerms: boolean;
  confirmAdult: boolean;
}

interface OnboardingProps {
  /** Existing accounts only need to give consent, so they skip the intro. */
  consentOnly?: boolean;
  onComplete: (input: OnboardingInput) => Promise<void>;
}

type Step = "profile" | number;

/** Each line of a step rises in after the one before it. */
const line: Variants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0, transition: { duration: 0.42, ease } },
};
const icon: Variants = {
  enter: { opacity: 0, scale: 0.5, rotate: -18 },
  center: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: "spring", stiffness: 380, damping: 16 },
  },
};
const stagger: Variants = {
  center: { transition: { staggerChildren: 0.06 } },
};

export function Onboarding({
  consentOnly = false,
  onComplete,
}: OnboardingProps) {
  // The Android app asks for the profile first, then walks through the intro;
  // the website shows the intro first and ends with the profile.
  const profileFirst = isAndroidApp && !consentOnly;
  const order: Step[] = consentOnly
    ? ["profile"]
    : profileFirst
      ? ["profile", 0, 1, 2]
      : [0, 1, 2, "profile"];
  const [index, setIndex] = useState(0);
  // 0 on first open: the first screen rises in place instead of sliding.
  const [direction, setDirection] = useState(0);
  const [name, setName] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reduce = useReducedMotion();
  const step = order[index];
  const profileAt = order.indexOf("profile");
  const lastIndex = order.length - 1;
  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(next);
    haptic("selection");
  };
  const valid = name.trim().length >= 2 && adult && terms;
  async function finish() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await onComplete({
        displayName: name.trim(),
        acceptTerms: terms,
        confirmAdult: adult,
      });
      haptic("success");
    } catch (e) {
      haptic("warning");
      setError(errorMessage(e));
      setBusy(false);
      // The error is shown on the profile step, where it can be fixed.
      if (profileFirst) go(profileAt);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    if (profileFirst) go(index + 1);
    else void finish();
  }
  const offset = reduce ? 0 : 36;
  const slide = typeof step === "number" ? intro[step] : undefined;
  const slides = order.filter((item): item is number => item !== "profile");
  const canSkip = slide !== undefined && index < lastIndex;
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-top">
          {index > 0 ? (
            <button
              className="icon-button"
              aria-label="Back"
              onClick={() => go(index - 1)}
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <span className="onboarding-brand">
              <BrandMark /> peakcast.
            </span>
          )}
          {canSkip && (
            <button
              className="text-button"
              onClick={() => (profileFirst ? void finish() : go(profileAt))}
            >
              Skip
            </button>
          )}
        </div>
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={index}
            className="onboarding-step"
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * offset }),
              center: {
                opacity: 1,
                x: 0,
                transition: {
                  duration: 0.3,
                  ease,
                  staggerChildren: 0.07,
                  delayChildren: direction ? 0.02 : 0.12,
                },
              },
              exit: (d: number) => ({
                opacity: 0,
                x: -d * offset,
                transition: { duration: 0.2, ease },
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {slide ? (
              <>
                <motion.span className="onboarding-icon" variants={icon}>
                  <slide.icon size={28} />
                </motion.span>
                <motion.h1 variants={line}>{slide.title}</motion.h1>
                <motion.p variants={line}>{slide.text}</motion.p>
              </>
            ) : (
              <motion.form
                className="onboarding-form"
                onSubmit={submit}
                variants={stagger}
              >
                <motion.h1 variants={line}>
                  {consentOnly
                    ? "Before you continue"
                    : profileFirst
                      ? "Welcome to Peakcast"
                      : "Create your profile"}
                </motion.h1>
                <motion.p variants={line}>
                  {consentOnly
                    ? "We've updated how accounts work. Choose a display name and confirm the terms to keep playing."
                    : profileFirst
                      ? "Choose a display name to get started. It stays on this phone."
                      : "Your display name appears on comments and team leaderboards."}
                </motion.p>
                <motion.label className="field" variants={line}>
                  <span>Display name</span>
                  <input
                    value={name}
                    maxLength={40}
                    autoComplete="nickname"
                    placeholder="e.g. Ada"
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                </motion.label>
                <motion.label className="check" variants={line}>
                  <input
                    type="checkbox"
                    checked={adult}
                    onChange={(event) => {
                      setAdult(event.target.checked);
                      haptic("selection");
                    }}
                  />
                  <span>I am 18 or older.</span>
                </motion.label>
                <motion.label className="check" variants={line}>
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(event) => {
                      setTerms(event.target.checked);
                      haptic("selection");
                    }}
                  />
                  <span>
                    I agree to the{" "}
                    <a href="/terms" target="_blank" rel="noreferrer">
                      Terms of Use
                    </a>{" "}
                    and{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer">
                      Privacy Policy
                    </a>
                    .
                  </span>
                </motion.label>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <motion.button
                  className="primary-button"
                  disabled={!valid || busy}
                  variants={line}
                >
                  {busy && <Loader2 size={16} className="button-spinner" />}
                  {busy
                    ? "Setting up…"
                    : consentOnly
                      ? "Continue"
                      : profileFirst
                        ? "Continue"
                        : "Start with 5,000 credits"}
                  {profileFirst && !busy && <ArrowRight size={16} />}
                </motion.button>
              </motion.form>
            )}
          </motion.div>
        </AnimatePresence>
        {slide && (
          <div className="onboarding-bottom">
            <div className="onboarding-dots" aria-hidden="true">
              {slides.map((item) => (
                <span key={item} className={item === step ? "active" : ""} />
              ))}
            </div>
            {index < lastIndex ? (
              <button className="primary-button" onClick={() => go(index + 1)}>
                {order[index + 1] === "profile" ? "Get started" : "Next"}{" "}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void finish()}
              >
                {busy && <Loader2 size={16} className="button-spinner" />}
                {busy ? "Setting up…" : "Start with 5,000 credits"}{" "}
                {!busy && <ArrowRight size={16} />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

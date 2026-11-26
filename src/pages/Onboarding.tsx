import { useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Scale, ShieldCheck, Sparkles } from "lucide-react";
import { BrandMark, errorMessage } from "../ui.js";
import { ease } from "../motion.js";
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

export function Onboarding({ consentOnly = false, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(consentOnly ? intro.length : 0);
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reduce = useReducedMotion();
  const last = intro.length;
  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };
  const valid = name.trim().length >= 2 && adult && terms;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await onComplete({
        displayName: name.trim(),
        acceptTerms: terms,
        confirmAdult: adult,
      });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const offset = reduce ? 0 : 28;
  const slide = intro[step];
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-top">
          {step > 0 && !(consentOnly && step === last) ? (
            <button
              className="icon-button"
              aria-label="Back"
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <span className="onboarding-brand">
              <BrandMark /> wildcatter.
            </span>
          )}
          {step < last && (
            <button className="text-button" onClick={() => go(last)}>
              Skip
            </button>
          )}
        </div>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={step}
            className="onboarding-step"
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * offset }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: -d * offset }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease }}
          >
            {slide ? (
              <>
                <span className="onboarding-icon">
                  <slide.icon size={28} />
                </span>
                <h1>{slide.title}</h1>
                <p>{slide.text}</p>
              </>
            ) : (
              <form className="onboarding-form" onSubmit={submit}>
                <h1>{consentOnly ? "Before you continue" : "Create your profile"}</h1>
                <p>
                  {consentOnly
                    ? "We've updated how accounts work. Choose a display name and confirm the terms to keep playing."
                    : "Your display name appears on comments and team leaderboards."}
                </p>
                <label className="field">
                  <span>Display name</span>
                  <input
                    value={name}
                    maxLength={40}
                    autoComplete="nickname"
                    placeholder="e.g. Ada"
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={adult}
                    onChange={(event) => setAdult(event.target.checked)}
                  />
                  <span>I am 18 or older.</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(event) => setTerms(event.target.checked)}
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
                </label>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="primary-button" disabled={!valid || busy}>
                  {busy
                    ? "Setting up…"
                    : consentOnly
                      ? "Continue"
                      : "Start with 5,000 credits"}
                </button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
        {step < last && (
          <div className="onboarding-bottom">
            <div className="onboarding-dots" aria-hidden="true">
              {intro.map((_, index) => (
                <span key={index} className={index === step ? "active" : ""} />
              ))}
            </div>
            <button className="primary-button" onClick={() => go(step + 1)}>
              {step === last - 1 ? "Get started" : "Next"} <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

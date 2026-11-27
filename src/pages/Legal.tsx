import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  FileText,
  Gamepad2,
  Link2,
  Mail,
  MessageSquare,
  Scale,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { BrandMark, errorMessage } from "../ui.js";
import { TERMS_VERSION } from "../../shared/legal.js";
import { PeakcastClient } from "../../shared/client.js";
import "../onboarding.css";
import "./legal.css";

export type LegalPage = "terms" | "privacy" | "help" | "delete-account";
export const legalPaths: Record<string, LegalPage> = {
  "/terms": "terms",
  "/privacy": "privacy",
  "/help": "help",
  "/delete-account": "delete-account",
};

const CONTACT = "girdharvinit786@gmail.com";

interface LegalProps {
  page: LegalPage;
  token: string;
  onBack: () => void;
  onDeleted: () => void;
}

/** Public pages: reachable without an account, linked from the Play listing. */
export function Legal({ page, token, onBack, onDeleted }: LegalProps) {
  const content = {
    terms: <Terms />,
    privacy: <Privacy />,
    help: <Help />,
    "delete-account": <DeleteAccount token={token} onDeleted={onDeleted} />,
  }[page];
  return (
    <div className="legal-page">
      <header className="legal-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <span className="legal-brand">
          <BrandMark /> peakcast.
        </span>
      </header>
      <article className="legal-body">{content}</article>
      <nav className="legal-footer" aria-label="Legal and help">
        <p className="legal-group-title">More</p>
        <ul className="legal-links">
          {footerLinks
            .filter((link) => link.page !== page)
            .map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <a href={href}>
                  <span className="legal-icon">
                    <Icon size={16} />
                  </span>
                  <span>{label}</span>
                  <ChevronRight size={16} className="legal-chevron" />
                </a>
              </li>
            ))}
        </ul>
        <p className="legal-copy">© {new Date().getFullYear()} Vinit Girdhar</p>
      </nav>
    </div>
  );
}

const footerLinks: {
  page: LegalPage;
  href: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { page: "terms", href: "/terms", label: "Terms of Use", icon: FileText },
  {
    page: "privacy",
    href: "/privacy",
    label: "Privacy Policy",
    icon: ShieldCheck,
  },
  {
    page: "help",
    href: "/help",
    label: "Help and questions",
    icon: CircleHelp,
  },
  {
    page: "delete-account",
    href: "/delete-account",
    label: "Delete account",
    icon: Trash2,
  },
];

/** Large title, the version line and a short plain-language summary. */
function Intro({ title, summary }: { title: string; summary: string[] }) {
  return (
    <div className="legal-intro">
      <h1>{title}</h1>
      <p className="legal-meta">
        Version {TERMS_VERSION} · Last updated{" "}
        {new Date(TERMS_VERSION).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      <div className="legal-summary">
        <p className="legal-summary-title">In short</p>
        <ul>
          {summary.map((line) => (
            <li key={line}>
              <BadgeCheck size={16} aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** One topic as a card: an icon tile, a heading and its text. */
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="legal-section">
      <h2>
        <span className="legal-icon">
          <Icon size={16} />
        </span>
        {title}
      </h2>
      <div className="legal-text">{children}</div>
    </section>
  );
}

function ContactRow() {
  return (
    <a className="legal-contact" href={`mailto:${CONTACT}`}>
      <span className="legal-icon">
        <Mail size={16} />
      </span>
      <span className="legal-contact-text">
        <strong>Contact us</strong>
        <small>{CONTACT}</small>
      </span>
      <ChevronRight size={16} className="legal-chevron" />
    </a>
  );
}

function Terms() {
  return (
    <>
      <Intro
        title="Terms of Use"
        summary={[
          "Peakcast is a forecasting game played with practice credits.",
          "Credits have no cash value and can never be bought or withdrawn.",
          "You must be 18 or older to play.",
          "Your account lives only on your device.",
        ]}
      />
      <Section title="What Peakcast is" icon={Gamepad2}>
        <p>
          Peakcast is a forecasting game. You trade on questions about future
          events using <strong>practice credits</strong>. Practice credits have
          no cash value, cannot be bought, sold, transferred or withdrawn, and
          cannot be exchanged for money, goods or prizes.
        </p>
      </Section>
      <Section title="Who can use it" icon={UserRound}>
        <p>
          You must be at least 18 years old. You confirm this when you create an
          account. Do not use Peakcast where forecasting games are not allowed.
        </p>
      </Section>
      <Section title="Your account" icon={Smartphone}>
        <p>
          Each new account starts with 5,000 practice credits. Keep your device
          secure: anyone with access to your signed-in app can use your account.
          You can delete your account at any time in Settings or at{" "}
          <a href="/delete-account">/delete-account</a>.
        </p>
      </Section>
      <Section title="Playground mode" icon={ShieldCheck}>
        <p>
          All trading happens in Playground mode with practice credits. Peakcast
          has no real-money trading, no purchases and no prizes of any kind.
        </p>
      </Section>
      <Section title="Markets and resolution" icon={Scale}>
        <p>
          Prices reflect what players trade, not facts or advice. Markets settle
          by the stated rules: a proposal, a challenge window, and an operator
          ruling if challenged. Rulings are final within the game.
        </p>
      </Section>
      <Section title="Content you post" icon={MessageSquare}>
        <p>
          Be respectful. Do not post illegal, hateful, harassing or misleading
          content, personal data about others, or spam. We may remove content
          and suspend accounts that break these rules.
        </p>
      </Section>
      <Section title="Your data stays on your device" icon={Smartphone}>
        <p>
          Peakcast has no server. Your account and activity are saved only on
          the device you use. We cannot see, recover or restore them; clearing
          the app’s storage or uninstalling it erases them.
        </p>
      </Section>
      <Section title="No advice, no warranty" icon={TriangleAlert}>
        <p>
          Nothing in Peakcast is financial, legal or betting advice. The service
          is provided as is and may change or stop. To the extent the law
          allows, we are not liable for indirect losses arising from its use.
        </p>
      </Section>
      <ContactRow />
    </>
  );
}

function Privacy() {
  return (
    <>
      <Intro
        title="Privacy Policy"
        summary={[
          "We collect nothing: Peakcast has no server.",
          "No ads, analytics or tracking.",
          "Your name and activity stay on this device.",
          "Delete everything any time from Settings.",
        ]}
      />
      <Section title="We collect nothing" icon={ShieldCheck}>
        <p>
          Peakcast runs entirely on your device and has no server. Nothing you
          do in the app is sent to us or to anyone else, and we cannot see it.
          The app works without an internet connection.
        </p>
        <p>
          It does not ask for your email, phone number, contacts, location,
          photos or advertising ID. Peakcast shows no ads and has no analytics
          or tracking.
        </p>
      </Section>
      <Section title="What stays on your device" icon={Smartphone}>
        <ul>
          <li>The display name you choose.</li>
          <li>
            The date you accepted the Terms and confirmed you are 18 or over.
          </li>
          <li>
            Game activity: trades, positions, orders, markets and drafts you
            create, comments and your watchlist.
          </li>
        </ul>
        <p>
          These are kept in the app’s own storage, used only to run the game on
          this device. Other devices and people cannot see them.
        </p>
      </Section>
      <Section title="Links to other sites" icon={Link2}>
        <p>
          Market sources and evidence are links to other websites. They open in
          your browser only when you tap them, and those sites’ own privacy
          policies apply.
        </p>
      </Section>
      <Section title="Deleting your data" icon={Trash2}>
        <p>
          Delete your account at any time in Settings or at{" "}
          <a href="/delete-account">/delete-account</a>: your display name,
          drafts, comments, watchlist and notifications are removed and open
          orders are cancelled. Clearing the app’s storage or uninstalling it
          erases everything.
        </p>
      </Section>
      <ContactRow />
    </>
  );
}

const helpItems = [
  [
    "What is Peakcast?",
    "A forecasting game. Each market asks a yes-or-no question about the future. The YES price is the crowd's estimate of the chance it happens.",
  ],
  [
    "Is this real money?",
    "No. You play with practice credits that have no cash value. Every new account starts with 5,000.",
  ],
  [
    "What is Playground mode?",
    "The mode where you trade practice credits. It is always on; Peakcast has no real-money trading.",
  ],
  [
    "How do I make money in the game?",
    "Buy shares in the outcome you think is underpriced. If you are right, each share pays 1 credit when the market resolves.",
  ],
  [
    "How are markets resolved?",
    "The creator proposes an outcome with evidence. Anyone can challenge it with a 100-credit bond during the challenge window. Challenged markets get an operator ruling.",
  ],
  [
    "Can I create my own market?",
    "Yes. Write a draft in the Draft studio, then launch it by staking 500 credits. You earn 1% of every trade.",
  ],
  [
    "I ran out of credits.",
    "Claim the daily bonus in Portfolio. Credits cannot be bought.",
  ],
  [
    "How do I delete my account?",
    "Settings → Account → Delete account, or visit /delete-account.",
  ],
] as const;

function Help() {
  return (
    <>
      <div className="legal-intro">
        <h1>Help and questions</h1>
        <p className="legal-meta">Tap a question to see the answer.</p>
      </div>
      <div className="legal-faq">
        {helpItems.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
      <p className="legal-group-title">Still stuck?</p>
      <ContactRow />
    </>
  );
}

function DeleteAccount({
  token,
  onDeleted,
}: {
  token: string;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await new PeakcastClient("", token).deleteAccount();
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <>
      <div className="legal-intro">
        <h1>Delete your account</h1>
      </div>
      <p className="legal-warning">
        <TriangleAlert size={18} aria-hidden="true" />
        Your Peakcast account exists only on the device where you created it; no
        copy is kept on any server. Deleting it removes your display name,
        drafts, comments, watchlist and notifications, cancels open orders and
        signs you out. Past trades stay without your profile because market
        prices depend on them. To erase everything, clear the app's storage or
        uninstall it. This cannot be undone.
      </p>
      {token ? (
        <div className="delete-box">
          <label htmlFor="delete-confirm">
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            id="delete-confirm"
            value={confirm}
            autoComplete="off"
            onChange={(event) => setConfirm(event.target.value)}
          />
          <button
            className="danger-button"
            disabled={confirm !== "DELETE" || busy}
            onClick={remove}
          >
            {busy ? "Deleting…" : "Delete my account"}
          </button>
          {error && <p className="form-error">{error}</p>}
        </div>
      ) : (
        <p className="legal-card-text">
          Peakcast keeps no data on any server, so there is nothing for us to
          delete remotely. Open Peakcast on the phone, computer or browser you
          play on and choose Settings → Account → Delete account. Uninstalling
          the app, or clearing the browser's data for this site, erases your
          account and everything in it. Questions:{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      )}
    </>
  );
}

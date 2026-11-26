import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandMark, errorMessage } from "../ui.js";
import { TERMS_VERSION } from "../../shared/legal.js";
import { PeakcastClient } from "../../shared/client.js";
import "../onboarding.css";

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
      <footer className="legal-footer">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/help">Help</a>
        <a href="/delete-account">Delete account</a>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Terms() {
  return (
    <>
      <h1>Terms of Use</h1>
      <p className="legal-meta">Version {TERMS_VERSION}</p>
      <Section title="1. What Peakcast is">
        <p>
          Peakcast is a forecasting game. You trade on questions about future
          events using <strong>practice credits</strong>. Practice credits have
          no cash value, cannot be bought, sold, transferred or withdrawn, and
          cannot be exchanged for money, goods or prizes.
        </p>
      </Section>
      <Section title="2. Who can use it">
        <p>
          You must be at least 18 years old. You confirm this when you create an
          account. Do not use Peakcast where forecasting games are not allowed.
        </p>
      </Section>
      <Section title="3. Your account">
        <p>
          Each new account starts with 5,000 practice credits. Keep your device
          secure: anyone with access to your signed-in app can use your account.
          You can delete your account at any time in Settings or at{" "}
          <a href="/delete-account">/delete-account</a>.
        </p>
      </Section>
      <Section title="4. Playground mode">
        <p>
          All trading happens in Playground mode with practice credits. Peakcast
          has no real-money trading, no purchases and no prizes of any kind.
        </p>
      </Section>
      <Section title="5. Markets and resolution">
        <p>
          Prices reflect what players trade, not facts or advice. Markets settle
          by the stated rules: a proposal, a challenge window, and an operator
          ruling if challenged. Rulings are final within the game.
        </p>
      </Section>
      <Section title="6. Content you post">
        <p>
          Be respectful. Do not post illegal, hateful, harassing or misleading
          content, personal data about others, or spam. We may remove content
          and suspend accounts that break these rules.
        </p>
      </Section>
      <Section title="7. Your data stays on your device">
        <p>
          Peakcast has no server. Your account and activity are saved only on
          the device you use. We cannot see, recover or restore them; clearing
          the app’s storage or uninstalling it erases them.
        </p>
      </Section>
      <Section title="8. No advice, no warranty">
        <p>
          Nothing in Peakcast is financial, legal or betting advice. The service
          is provided as is and may change or stop. To the extent the law
          allows, we are not liable for indirect losses arising from its use.
        </p>
      </Section>
      <Section title="9. Contact">
        <p>
          Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </Section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-meta">Version {TERMS_VERSION}</p>
      <Section title="We collect nothing">
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
      <Section title="What stays on your device">
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
      <Section title="Links">
        <p>
          Market sources and evidence are links to other websites. They open in
          your browser only when you tap them, and those sites’ own privacy
          policies apply.
        </p>
      </Section>
      <Section title="Deleting your data">
        <p>
          Delete your account at any time in Settings or at{" "}
          <a href="/delete-account">/delete-account</a>: your display name,
          drafts, comments, watchlist and notifications are removed and open
          orders are cancelled. Clearing the app’s storage or uninstalling it
          erases everything.
        </p>
      </Section>
      <Section title="Contact">
        <p>
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </Section>
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
      <h1>Help and questions</h1>
      <div className="legal-faq">
        {helpItems.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
      <p>
        Still stuck? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
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
      <h1>Delete your account</h1>
      <p>
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
        <p>
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

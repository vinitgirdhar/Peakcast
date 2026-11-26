import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandMark, errorMessage } from "../ui.js";
import { TERMS_VERSION } from "../../shared/legal.js";
import { WildcatterClient } from "../../shared/client.js";
import "../onboarding.css";

export type LegalPage = "terms" | "privacy" | "help" | "delete-account";
export const legalPaths: Record<string, LegalPage> = {
  "/terms": "terms",
  "/privacy": "privacy",
  "/help": "help",
  "/delete-account": "delete-account",
};

const CONTACT = "support@wildcatter.app";

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
          <BrandMark /> wildcatter.
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
      <Section title="1. What Wildcatter is">
        <p>
          Wildcatter is a forecasting game. You trade on questions about future
          events using <strong>practice credits</strong>. Practice credits have
          no cash value, cannot be bought, sold, transferred or withdrawn, and
          cannot be exchanged for money, goods or prizes.
        </p>
      </Section>
      <Section title="2. Who can use it">
        <p>
          You must be at least 18 years old. You confirm this when you create
          an account. Do not use Wildcatter where forecasting games are not
          allowed.
        </p>
      </Section>
      <Section title="3. Your account">
        <p>
          Each new account starts with 5,000 practice credits. Keep your device
          secure: anyone with access to your signed-in app can use your
          account. You can delete your account at any time in Settings or at{" "}
          <a href="/delete-account">/delete-account</a>.
        </p>
      </Section>
      <Section title="4. Playground mode">
        <p>
          All trading happens in Playground mode with practice credits.
          Real-money trading is not offered. If it is offered in future, it will
          only be available where it is licensed, and only after you accept
          separate terms.
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
      <Section title="7. AI features">
        <p>
          AI tools only suggest wording for draft markets. Check suggestions
          before you publish them; you are responsible for markets you launch.
        </p>
      </Section>
      <Section title="8. No advice, no warranty">
        <p>
          Nothing in Wildcatter is financial, legal or betting advice. The
          service is provided as is and may change or stop. To the extent the
          law allows, we are not liable for indirect losses arising from its
          use.
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
      <Section title="What we collect">
        <ul>
          <li>The display name you choose.</li>
          <li>
            The date you accepted the Terms and confirmed you are 18 or over.
          </li>
          <li>
            Game activity: trades, positions, orders, markets and drafts you
            create, comments and your watchlist.
          </li>
          <li>
            A random sign-in token stored on your device. We store only a hash
            of it.
          </li>
        </ul>
        <p>
          We do not collect your email, phone number, contacts, location,
          photos or advertising ID. Wildcatter shows no ads and has no
          third-party analytics or tracking.
        </p>
      </Section>
      <Section title="How we use it">
        <p>
          To run your account, show your portfolio, rank leaderboards (under an
          alias, never your account ID), send in-app notifications, and keep
          the game fair.
        </p>
      </Section>
      <Section title="AI providers">
        <p>
          When you ask the Draft studio for help, the draft text you wrote is
          sent to the AI provider configured for the service to suggest
          wording. Your name and account are not sent.
        </p>
      </Section>
      <Section title="Sharing">
        <p>
          We do not sell your data. Your display name, comments and public
          trades are visible to other players. Data is encrypted in transit
          (HTTPS).
        </p>
      </Section>
      <Section title="Retention and deletion">
        <p>
          You can delete your account at any time in Settings or at{" "}
          <a href="/delete-account">/delete-account</a>. Deletion immediately
          removes your display name, drafts, comments, watchlist and
          notifications, cancels open orders, removes you from teams and signs
          you out everywhere. Past trades and credit ledger entries are kept
          without your profile, because other players' prices and payouts
          depend on them.
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
    "What is Wildcatter?",
    "A forecasting game. Each market asks a yes-or-no question about the future. The YES price is the crowd's estimate of the chance it happens.",
  ],
  [
    "Is this real money?",
    "No. You play with practice credits that have no cash value. Every new account starts with 5,000.",
  ],
  [
    "What is Playground mode?",
    "The mode where you trade practice credits. It is always on today. Real-money trading is not available.",
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
    "Yes. Write a draft in the Draft studio, optionally with AI help, then launch it by staking 500 credits. You earn 1% of every trade.",
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
      await new WildcatterClient("", token).deleteAccount();
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
        Deleting your Wildcatter account removes your display name, drafts,
        comments, watchlist and notifications, cancels open orders, removes you
        from teams and signs you out. Past trades and ledger entries stay
        without your profile because other players' prices depend on them.
        This cannot be undone.
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
          Open this page in the Wildcatter app or browser you play in, or use
          Settings → Account → Delete account. If you can no longer open the
          app, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will
          delete the account for you.
        </p>
      )}
    </>
  );
}

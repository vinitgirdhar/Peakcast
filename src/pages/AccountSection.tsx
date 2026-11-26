import { useEffect, useState } from "react";
import { PeakcastClient } from "../../shared/client.js";
import type { Account } from "../../shared/types.js";
import { errorMessage, formatCredits } from "../ui.js";
import "../onboarding.css";

interface AccountSectionProps {
  token: string;
  onDeleted: () => void;
}

export function AccountSection({ token, onDeleted }: AccountSectionProps) {
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const client = new PeakcastClient("", token);
  useEffect(() => {
    let active = true;
    client
      .account()
      .then((value) => active && setAccount(value))
      .catch((e) => active && setNotice(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [token]);
  async function togglePlayground() {
    if (!account) return;
    setNotice("");
    try {
      setAccount(await client.setPlayground(!account.playground));
    } catch (e) {
      setNotice(errorMessage(e));
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await client.deleteAccount();
      onDeleted();
    } catch (e) {
      setNotice(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <section className="settings-panel" aria-labelledby="account-heading">
      <h2 id="account-heading">Account</h2>
      <div className="account-row">
        <div>
          Display name
          <span>{account?.displayName ?? "…"}</span>
        </div>
      </div>
      <div className="account-row">
        <div id="playground-label">
          Playground mode
          <span>
            {(account?.playground ?? true)
              ? `Trading practice credits. New accounts start with ${formatCredits(account?.startingMicros ?? 5_000_000_000, 0)} credits.`
              : "Trading real money."}
          </span>
        </div>
        <button
          className="switch"
          role="switch"
          aria-checked={account?.playground ?? true}
          aria-labelledby="playground-label"
          disabled={!account}
          onClick={togglePlayground}
        />
      </div>
      {notice && (
        <p className="form-error" role="status">
          {notice}
        </p>
      )}
      <div className="account-row">
        <div>
          Delete account
          <span>
            Removes your profile and personal data. This can't be undone.
          </span>
        </div>
        {confirming ? (
          <span className="account-confirm">
            <button
              className="secondary-button"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button className="danger-button" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </span>
        ) : (
          <button
            className="secondary-button"
            onClick={() => setConfirming(true)}
          >
            Delete…
          </button>
        )}
      </div>
      <nav className="account-links" aria-label="Legal">
        <a href="/terms">Terms of Use</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/help">Help</a>
      </nav>
    </section>
  );
}

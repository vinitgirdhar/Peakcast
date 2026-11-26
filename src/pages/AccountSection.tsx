import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PeakcastClient } from "../../shared/client.js";
import type { Account } from "../../shared/types.js";
import { errorMessage, formatCredits } from "../ui.js";
import { haptic } from "../haptics.js";
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
    haptic("selection");
    try {
      setAccount(await client.setPlayground(!account.playground));
    } catch (e) {
      haptic("warning");
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
        <AnimatePresence mode="popLayout" initial={false}>
          {confirming ? (
            <motion.span
              key="confirm"
              className="account-confirm"
              initial={{ opacity: 0, scale: 0.92, x: 12 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 460, damping: 30 }}
            >
              <button
                className="secondary-button"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={remove}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </motion.span>
          ) : (
            <motion.button
              key="ask"
              className="secondary-button"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.16 }}
              onClick={() => {
                haptic("impact");
                setConfirming(true);
              }}
            >
              Delete…
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <nav className="account-links" aria-label="Legal">
        <a href="/terms">Terms of Use</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/help">Help</a>
      </nav>
    </section>
  );
}

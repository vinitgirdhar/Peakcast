import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FlaskConical, Trash2, User } from "lucide-react";
import { PeakcastClient } from "../../shared/client.js";
import type { Account } from "../../shared/types.js";
import { errorMessage, formatCredits } from "../ui.js";
import { haptic } from "../haptics.js";
import "../onboarding.css";

interface AccountSectionProps {
  token: string;
  onDeleted: () => void;
  /** Settings groups shown between the account group and the destructive group. */
  children?: ReactNode;
}

export function AccountSection({
  token,
  onDeleted,
  children,
}: AccountSectionProps) {
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
    <>
      <section className="settings-section" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <div className="settings-group">
          <div className="settings-row">
            <span className="settings-icon" data-tone="blue" aria-hidden="true">
              <User size={17} />
            </span>
            <span className="settings-label">Display name</span>
            <span className="settings-value">
              {account?.displayName ?? "…"}
            </span>
          </div>
          <div className="settings-row">
            <span
              className="settings-icon"
              data-tone="green"
              aria-hidden="true"
            >
              <FlaskConical size={17} />
            </span>
            <span className="settings-label" id="playground-label">
              Playground mode
            </span>
            <button
              className="switch"
              role="switch"
              aria-checked={account?.playground ?? true}
              aria-labelledby="playground-label"
              aria-describedby="playground-note"
              disabled={!account}
              onClick={togglePlayground}
            />
          </div>
        </div>
        <p className="settings-footer" id="playground-note">
          {(account?.playground ?? true)
            ? `Trading practice credits. New accounts start with ${formatCredits(account?.startingMicros ?? 5_000_000_000, 0)} credits.`
            : "Trading real money."}
        </p>
        {notice && (
          <p className="settings-footer settings-notice" role="status">
            {notice}
          </p>
        )}
      </section>
      {children}
      <section
        className="settings-section"
        aria-labelledby="delete-account-heading"
      >
        <h2 id="delete-account-heading" className="sr-only">
          Delete account
        </h2>
        <div className="settings-group">
          <div className="settings-row settings-danger">
            <span className="settings-icon" data-tone="red" aria-hidden="true">
              <Trash2 size={17} />
            </span>
            <span className="settings-label">Delete account</span>
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
                    className="settings-pill"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="danger-button settings-pill"
                    disabled={busy}
                    onClick={remove}
                  >
                    {busy ? "Deleting…" : "Delete"}
                  </button>
                </motion.span>
              ) : (
                <motion.button
                  key="ask"
                  className="settings-text-button"
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
        </div>
        <p className="settings-footer">
          Removes your profile and personal data. This can't be undone.{" "}
          <a href="/delete-account">How deletion works</a>
        </p>
      </section>
    </>
  );
}

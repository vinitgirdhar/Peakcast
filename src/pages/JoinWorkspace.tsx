import { useEffect, useState, type FormEvent } from "react";
import { ApiError, WildcatterClient } from "../../shared/client.js";
import type { InvitePreview, Workspace } from "../../shared/types.js";
import { EmptyState, SkeletonRows, date, errorMessage } from "../ui.js";
import { roleLabels } from "./WorkspaceMembers.js";

const TOKEN = /^[a-f0-9]{64}$/;
/** The server's message for unknown, expired, revoked and used-up invites. */
const INVALID = "This invite link is invalid or has expired.";

/**
 * /join#<token>. The token lives in the URL fragment, which browsers never
 * send, so it stays out of server logs; this page sends it only in POST
 * bodies and drops it from the address bar as soon as it has read it.
 */
export function JoinWorkspace({
  client,
  onJoined,
  onTeams,
}: {
  client: WildcatterClient;
  onJoined: (workspace: Workspace) => void;
  onTeams: () => void;
}) {
  // Read once, before the effect below clears it (StrictMode runs this twice; both see it).
  const [token] = useState(() => location.hash.slice(1));
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState(TOKEN.test(token) ? "" : INVALID);
  const [retryable, setRetryable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (location.hash)
      history.replaceState(history.state, "", location.pathname);
    if (!TOKEN.test(token)) return;
    let active = true;
    void client
      .previewInvite(token)
      .then((data) => {
        if (active) setPreview(data);
      })
      .catch((e) => {
        if (!active) return;
        setError(errorMessage(e));
        // A dead invite stays dead; a dropped connection is worth retrying.
        setRetryable(!(e instanceof ApiError && e.status < 500));
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function join(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setJoinError("");
    try {
      onJoined(await client.joinWorkspace(token, displayName.trim()));
    } catch (e) {
      setJoinError(errorMessage(e));
      setBusy(false);
    }
  }

  if (error)
    return (
      <EmptyState
        title="This invite can't be used"
        text={error}
        action={
          <div className="empty-actions">
            {retryable && (
              <button
                className="secondary-button"
                onClick={() => {
                  setError("");
                  setAttempt(attempt + 1);
                }}
              >
                Try again
              </button>
            )}
            <button className="primary-button" onClick={onTeams}>
              Go to Teams
            </button>
          </div>
        }
      />
    );
  if (!preview)
    return (
      <div className="page">
        <SkeletonRows label="Checking your invite…" count={2} />
      </div>
    );
  return (
    <div className="page join-page">
      <div className="page-heading">
        <div>
          <h1>Join {preview.workspaceName}</h1>
          <p>
            You are invited as a {roleLabels[preview.role].toLowerCase()}. The
            invite expires {date(preview.expiresAt)}.
          </p>
        </div>
        <span className="small-pill">Teams preview</span>
      </div>
      <form
        className="settings-panel"
        aria-label={`Join ${preview.workspaceName}`}
        onSubmit={(event) => void join(event)}
      >
        <label className="form-label" htmlFor="join-display-name">
          Your display name
        </label>
        <input
          id="join-display-name"
          className="text-input"
          aria-describedby="join-display-name-hint"
          minLength={2}
          maxLength={40}
          required
          autoComplete="nickname"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <small className="field-hint" id="join-display-name-hint">
          Members see this name on trades, comments and the workspace
          leaderboard. It never appears outside the workspace.
        </small>
        <p>
          You get a separate wallet with 10,000 workspace credits for this
          workspace&rsquo;s private markets. They are play money and cannot be
          moved, bought or redeemed.
        </p>
        {joinError && (
          <p role="alert" className="form-error">
            {joinError}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "Joining…" : "Join workspace"}
        </button>
      </form>
    </div>
  );
}

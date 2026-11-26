import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, Loader2, Users } from "lucide-react";
import { motion } from "motion/react";
import { PeakcastClient } from "../../shared/client.js";
import type { Workspace } from "../../shared/types.js";
import { EmptyState, SkeletonRows, errorMessage } from "../ui.js";
import { roleLabels } from "./WorkspaceMembers.js";
import { itemMotion, listMotion } from "../motion.js";

/** Workspaces you belong to, and a form to create one. */
export function Teams({
  client,
  onOpen,
  onNotice,
}: {
  client: PeakcastClient;
  onOpen: (workspaceId: string) => void;
  onNotice: (text: string) => void;
}) {
  const [items, setItems] = useState<Workspace[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createError, setCreateError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void client
      .workspaces()
      .then((data) => {
        if (active) {
          setItems(data.items);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setCreateError("");
    try {
      const workspace = await client.createWorkspace(
        name.trim(),
        displayName.trim(),
      );
      onNotice(`${workspace.name} created. Invite colleagues from Members.`);
      onOpen(workspace.id);
    } catch (e) {
      setCreateError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="page teams-page">
      <div className="page-heading">
        <div>
          <h1>
            Teams <span className="small-pill">Preview</span>
          </h1>
          <p>Private markets for your group, ranked on workspace credits.</p>
        </div>
      </div>
      <p className="teams-note">
        <strong>Teams is a preview.</strong> Workspaces live on this demo
        server, which can be reset, and your membership belongs to this
        browser&rsquo;s demo session. Workspace credits are play money: they
        cannot be bought, moved or redeemed.
      </p>
      <section aria-labelledby="your-workspaces">
        <h2 id="your-workspaces" className="teams-heading">
          Your workspaces
        </h2>
        {error && !items ? (
          <div role="alert" className="form-error inline-error">
            <p>{error}</p>
            <button
              className="text-button"
              onClick={() => setAttempt(attempt + 1)}
            >
              Try again
            </button>
          </div>
        ) : !items ? (
          <div className="activity-list">
            <SkeletonRows label="Loading workspaces…" count={2} />
          </div>
        ) : items.length ? (
          <motion.div
            className="activity-list"
            variants={listMotion}
            initial="hidden"
            animate="show"
          >
            {items.map((workspace) => (
              <motion.button
                key={workspace.id}
                className="activity-row"
                variants={itemMotion}
                onClick={() => onOpen(workspace.id)}
              >
                <span className="soft-icon" aria-hidden="true">
                  <Users size={17} />
                </span>
                <div>
                  <strong>{workspace.name}</strong>
                  <span>
                    {roleLabels[workspace.role]} · {workspace.memberCount}{" "}
                    {workspace.memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
                <ChevronRight size={17} className="row-chevron" />
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <EmptyState
            title="No workspaces yet"
            text="Create one below, or open an invite link from a workspace owner or admin to join theirs."
          />
        )}
      </section>
      <form
        className="settings-panel teams-create"
        aria-labelledby="create-workspace"
        onSubmit={(event) => void create(event)}
      >
        <h2 id="create-workspace">Create a workspace</h2>
        <p>
          You become its owner and get a separate wallet with 10,000 workspace
          credits. Your own balance is untouched.
        </p>
        <div className="form-two-columns">
          <div>
            <label className="form-label" htmlFor="new-workspace-name">
              Workspace name
            </label>
            <input
              id="new-workspace-name"
              className="text-input"
              placeholder="Product forecasting club"
              minLength={2}
              maxLength={60}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="new-workspace-alias">
              Your display name
            </label>
            <input
              id="new-workspace-alias"
              className="text-input"
              aria-describedby="new-workspace-alias-hint"
              minLength={2}
              maxLength={40}
              required
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <small className="field-hint" id="new-workspace-alias-hint">
              Members see this name; it never appears outside the workspace.
            </small>
          </div>
        </div>
        {createError && (
          <p role="alert" className="form-error">
            {createError}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy && <Loader2 size={16} className="button-spinner" />}
          {busy ? "Creating…" : "Create workspace"}
        </button>
      </form>
    </div>
  );
}

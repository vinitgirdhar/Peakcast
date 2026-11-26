import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link2, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { Select } from "../Select.js";
import { PeakcastClient } from "../../shared/client.js";
import type {
  InviteRole,
  WorkspaceDetail,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from "../../shared/types.js";
import {
  CopyStateIcon,
  EmptyState,
  SkeletonRows,
  date,
  errorMessage,
} from "../ui.js";
import { itemMotion, listMotion } from "../motion.js";
import { haptic } from "../haptics.js";

const COPIED = "Invite link copied to clipboard.";

export const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  resolver: "Resolver",
  member: "Member",
};
const ADJUSTABLE: WorkspaceRole[] = ["member", "resolver"];
const expiryOptions = [
  { value: "24", label: "1 day" },
  { value: "168", label: "7 days" },
  { value: "720", label: "30 days" },
];

// These mirror the server's role matrix only to decide which controls to show;
// the server enforces it and its message is shown when it refuses.
function roleChoices(
  me: WorkspaceRole,
  target: WorkspaceMember,
): WorkspaceRole[] {
  if (target.you) return [];
  if (me === "owner") return ["owner", "admin", "resolver", "member"];
  return me === "admin" && ADJUSTABLE.includes(target.role) ? ADJUSTABLE : [];
}
const canRemove = (me: WorkspaceRole, target: WorkspaceMember) =>
  !target.you &&
  target.role !== "owner" &&
  (me === "owner" || (me === "admin" && ADJUSTABLE.includes(target.role)));

function inviteStatus(invite: WorkspaceInvite): string {
  if (invite.revoked) return "Revoked";
  if (Date.parse(invite.expiresAt) <= Date.now()) return "Expired";
  return invite.uses >= invite.maxUses ? "Used up" : "Active";
}

interface MembersProps {
  client: PeakcastClient;
  workspace: WorkspaceDetail;
  shareOrigin: string | null;
  /** Reloads the workspace after a change. */
  onChanged: () => Promise<void>;
  onNotice: (text: string) => void;
  onLeft: () => void;
}

/** Members and roles for everyone; invites, roles and removal for owners and admins. */
export function WorkspaceMembers({
  client,
  workspace,
  shareOrigin,
  onChanged,
  onNotice,
  onLeft,
}: MembersProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const me = workspace.members.find((member) => member.you);
  const manager = workspace.role === "owner" || workspace.role === "admin";

  async function run(work: () => Promise<unknown>, notice: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      onNotice(notice);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    setError("");
    try {
      await client.removeMember(workspace.id, me!.id);
      onLeft();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="workspace-members">
      <section className="settings-panel" aria-labelledby="members-heading">
        <h2 id="members-heading">
          Members <span className="count-pill">{workspace.members.length}</span>
        </h2>
        <motion.ul
          className="activity-list member-list"
          variants={listMotion}
          initial="hidden"
          animate="show"
        >
          {workspace.members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              me={workspace.role}
              busy={busy}
              onRole={(role) =>
                run(
                  () => client.setMemberRole(workspace.id, member.id, role),
                  role === "owner"
                    ? `${member.displayName} is now the owner. You are an admin.`
                    : `${member.displayName} is now a ${roleLabels[role].toLowerCase()}.`,
                )
              }
              onRemove={() =>
                run(
                  () => client.removeMember(workspace.id, member.id),
                  `${member.displayName} was removed.`,
                )
              }
            />
          ))}
        </motion.ul>
        {workspace.members.length === 1 && (
          <EmptyState
            compact
            title="Only you so far."
            text={
              manager
                ? "Create an invite link below and share it with colleagues."
                : "Ask an owner or admin for an invite link to share."
            }
          />
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
      {manager && (
        <InvitesPanel
          client={client}
          workspaceId={workspace.id}
          shareOrigin={shareOrigin}
          onNotice={onNotice}
        />
      )}
      {workspace.role === "owner" && (
        <RenameForm
          client={client}
          workspace={workspace}
          onChanged={onChanged}
          onNotice={onNotice}
        />
      )}
      <section className="settings-panel" aria-labelledby="leave-heading">
        <h2 id="leave-heading">Leave workspace</h2>
        {workspace.role === "owner" ? (
          <p>Owners cannot leave. Make another member the owner first.</p>
        ) : (
          <>
            <p>
              Your open orders are cancelled. Your positions are still paid at
              resolution, and an invite link brings back the same wallet.
            </p>
            <ConfirmButton
              label="Leave workspace"
              prompt={`Leave ${workspace.name}?`}
              confirmLabel="Leave"
              disabled={busy}
              onConfirm={leave}
            />
          </>
        )}
      </section>
    </div>
  );
}

function MemberRow({
  member,
  me,
  busy,
  onRole,
  onRemove,
}: {
  member: WorkspaceMember;
  me: WorkspaceRole;
  busy: boolean;
  onRole: (role: WorkspaceRole) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const choices = roleChoices(me, member);
  const [role, setRole] = useState(member.role);
  // Follow the server after a change (an ownership transfer changes two rows).
  useEffect(() => setRole(member.role), [member.role]);
  const removable = canRemove(me, member);
  return (
    <motion.li className="activity-row member-row" variants={itemMotion}>
      <span className="soft-icon" aria-hidden="true">
        <UserRound size={17} />
      </span>
      <div>
        <strong>
          {member.displayName}
          {member.you && <span className="small-pill">You</span>}
        </strong>
        <span>
          <motion.span
            key={member.role}
            className="member-role"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {roleLabels[member.role]}
          </motion.span>{" "}
          · joined {date(member.joinedAt)}
        </span>
      </div>
      {(choices.length > 0 || removable) && (
        <div className="member-actions">
          {choices.length > 0 && (
            <Select
              label={`Role for ${member.displayName}`}
              value={role}
              disabled={busy}
              onChange={(value) => setRole(value as WorkspaceRole)}
              options={choices.map((value) => ({
                value,
                label: roleLabels[value],
              }))}
            />
          )}
          {role !== member.role &&
            (role === "owner" ? (
              <ConfirmButton
                label="Make owner"
                prompt={`Make ${member.displayName} the owner? You become an admin.`}
                confirmLabel="Transfer ownership"
                disabled={busy}
                onConfirm={() => onRole(role)}
              />
            ) : (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void onRole(role)}
              >
                Save role
              </button>
            ))}
          {removable && (
            <ConfirmButton
              label="Remove"
              prompt={`Remove ${member.displayName}?`}
              confirmLabel="Remove member"
              disabled={busy}
              onConfirm={onRemove}
            />
          )}
        </div>
      )}
    </motion.li>
  );
}

function InvitesPanel({
  client,
  workspaceId,
  shareOrigin,
  onNotice,
}: {
  client: PeakcastClient;
  workspaceId: string;
  shareOrigin: string | null;
  onNotice: (text: string) => void;
}) {
  const id = useId();
  const [invites, setInvites] = useState<WorkspaceInvite[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [role, setRole] = useState<InviteRole>("member");
  const [hours, setHours] = useState("168");
  const [uses, setUses] = useState("25");
  // The link is shown once and held only in memory; it is never logged or stored.
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const linkField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void client
      .invites(workspaceId)
      .then((data) => {
        if (active) setInvites(data.items);
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
    setError("");
    setCopied("");
    try {
      const invite = await client.createInvite(workspaceId, {
        role,
        expiresInHours: Number(hours),
        maxUses: Number(uses),
      });
      setLink(`${shareOrigin ?? location.origin}/join#${invite.token}`);
      setAttempt(attempt + 1);
      haptic("success");
    } catch (e) {
      haptic("warning");
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(COPIED);
      haptic("success");
    } catch {
      linkField.current?.focus();
      linkField.current?.select();
      setCopied(
        "Clipboard access is unavailable. The link is selected; press Ctrl+C (⌘C on Mac) to copy it.",
      );
    }
  }

  async function revoke(invite: WorkspaceInvite) {
    setError("");
    try {
      await client.revokeInvite(workspaceId, invite.id);
      setInvites((previous) =>
        (previous ?? []).map((item) =>
          item.id === invite.id ? { ...item, revoked: true } : item,
        ),
      );
      onNotice("Invite revoked. Its link no longer works.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="settings-panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Invite links</h2>
      <p>
        Anyone with a link can join until it expires or runs out of uses.
        Invites add members or resolvers; promote admins afterwards.
      </p>
      <form className="invite-form" onSubmit={(event) => void create(event)}>
        <div>
          <span className="form-label">Joins as</span>
          <Select
            label="Joins as"
            value={role}
            onChange={(value) => setRole(value as InviteRole)}
            options={[
              { value: "member", label: "Member" },
              { value: "resolver", label: "Resolver" },
            ]}
          />
        </div>
        <div>
          <span className="form-label">Expires after</span>
          <Select
            label="Expires after"
            value={hours}
            onChange={setHours}
            options={expiryOptions}
          />
        </div>
        <div>
          <label className="form-label" htmlFor={`${id}-uses`}>
            Uses
          </label>
          <input
            id={`${id}-uses`}
            className="text-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            step={1}
            required
            value={uses}
            onChange={(event) => setUses(event.target.value)}
          />
        </div>
        <button className="primary-button" disabled={busy}>
          <Link2 size={15} /> Create invite link
        </button>
      </form>
      {link && (
        <div className="invite-created">
          <label className="form-label" htmlFor={`${id}-link`}>
            New invite link
          </label>
          <div className="copy-row">
            <input
              ref={linkField}
              id={`${id}-link`}
              className="text-input"
              readOnly
              autoFocus
              value={link}
              aria-describedby={`${id}-once`}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => void copy()}
            >
              <CopyStateIcon copied={copied === COPIED} /> Copy link
            </button>
          </div>
          <p id={`${id}-once`} className="panel-hint">
            <strong>Copy it now: you won't see this link again.</strong> Only a
            fingerprint of it is stored, so a lost link cannot be recovered;
            revoke it and create another.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setLink("");
              setCopied("");
            }}
          >
            Done
          </button>
        </div>
      )}
      <p className="share-status" role="status">
        {copied}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <h3 className="invite-list-heading">Recent invites</h3>
      {!invites ? (
        !error && <SkeletonRows label="Loading invites…" count={2} />
      ) : invites.length ? (
        <motion.ul
          className="activity-list"
          variants={listMotion}
          initial="hidden"
          animate="show"
        >
          {invites.map((invite) => {
            const status = inviteStatus(invite);
            return (
              <motion.li
                className="activity-row member-row"
                key={invite.id}
                variants={itemMotion}
              >
                <div>
                  <strong>
                    {roleLabels[invite.role]} invite
                    <motion.span
                      key={status}
                      className="small-pill"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 520,
                        damping: 24,
                      }}
                    >
                      {status}
                    </motion.span>
                  </strong>
                  <span>
                    {invite.uses} of {invite.maxUses} uses ·{" "}
                    {status === "Expired" ? "expired" : "expires"}{" "}
                    {date(invite.expiresAt)}
                  </span>
                </div>
                {status === "Active" && (
                  <div className="member-actions">
                    <ConfirmButton
                      label="Revoke"
                      prompt="Revoke this invite link?"
                      confirmLabel="Revoke link"
                      onConfirm={() => revoke(invite)}
                    />
                  </div>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      ) : (
        <EmptyState
          compact
          title="No invite links yet."
          text="Create one above to bring colleagues in."
        />
      )}
    </section>
  );
}

function RenameForm({
  client,
  workspace,
  onChanged,
  onNotice,
}: {
  client: PeakcastClient;
  workspace: WorkspaceDetail;
  onChanged: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await client.renameWorkspace(workspace.id, name.trim());
      onNotice("Workspace renamed.");
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="settings-panel"
      aria-labelledby="rename-heading"
      onSubmit={(event) => void submit(event)}
    >
      <h2 id="rename-heading">Workspace name</h2>
      <label className="form-label" htmlFor="workspace-name">
        Name
      </label>
      <div className="inline-field">
        <input
          id="workspace-name"
          className="text-input"
          minLength={2}
          maxLength={60}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="secondary-button"
          disabled={busy || name.trim() === workspace.name}
        >
          Rename
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}

/** A destructive action behind an inline "are you sure?" step. */
function ConfirmButton({
  label,
  prompt,
  confirmLabel,
  disabled = false,
  onConfirm,
}: {
  label: string;
  prompt: string;
  confirmLabel: string;
  disabled?: boolean;
  onConfirm: () => Promise<void> | void;
}) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  // Cancelling returns focus to the button that opened the question.
  useEffect(() => {
    if (!asking && cancelled.current) trigger.current?.focus();
    cancelled.current = false;
  }, [asking]);
  if (!asking)
    return (
      <button
        ref={trigger}
        type="button"
        className="text-button danger-text"
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  return (
    <span className="confirm-inline" role="group" aria-label={prompt}>
      <span>{prompt}</span>
      <button
        type="button"
        className="secondary-button"
        autoFocus
        onClick={() => {
          cancelled.current = true;
          setAsking(false);
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        className="primary-button danger-button"
        onClick={() => {
          setAsking(false);
          void onConfirm();
        }}
      >
        {confirmLabel}
      </button>
    </span>
  );
}

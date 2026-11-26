import { DomainError, FORMER_MEMBER, type Store } from "./database.js";
import { TERMS_VERSION } from "../shared/legal.js";
import type { Account } from "../shared/types.js";

// ponytail: real money is a licensing decision, not a code path; see docs/plans/onboarding-playground-playstore.md.
export const realMoneyAvailable = () =>
  globalThis.process?.env.REAL_MONEY_ENABLED === "1";

interface ProfileRow {
  display_name: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
  playground: number;
  starting_micros: number;
}

export function getAccount(store: Store, accountId: string): Account {
  const row = store.db
    .prepare(
      "SELECT display_name,terms_version,terms_accepted_at,playground,starting_micros FROM accounts WHERE id=?",
    )
    .get(accountId) as unknown as ProfileRow;
  return {
    displayName: row.display_name,
    termsVersion: row.terms_version,
    termsAcceptedAt: row.terms_accepted_at,
    playground: row.playground === 1,
    realMoneyAvailable: realMoneyAvailable(),
    startingMicros: row.starting_micros,
  };
}

export function completeOnboarding(
  store: Store,
  accountId: string,
  input: { displayName: string; acceptTerms: boolean; confirmAdult: boolean },
): Account {
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  if (displayName.length < 2)
    throw new DomainError("Choose a display name of at least 2 characters.");
  if (!input.acceptTerms)
    throw new DomainError("Accept the Terms and Privacy Policy to continue.");
  if (!input.confirmAdult)
    throw new DomainError("Peakcast is only for people aged 18 or over.");
  const now = new Date().toISOString();
  store.db
    .prepare(
      "UPDATE accounts SET display_name=?,terms_version=?,terms_accepted_at=?,adult_confirmed_at=? WHERE id=?",
    )
    .run(displayName, TERMS_VERSION, now, now, accountId);
  return getAccount(store, accountId);
}

export function setPlayground(
  store: Store,
  accountId: string,
  playground: boolean,
): Account {
  if (!playground && !realMoneyAvailable())
    throw new DomainError(
      "Real-money trading isn't available yet. You stay in Playground mode with practice credits.",
      409,
    );
  store.db
    .prepare("UPDATE accounts SET playground=? WHERE id=?")
    .run(playground ? 1 : 0, accountId);
  return getAccount(store, accountId);
}

/**
 * Deletes personal data and revokes the token. Trades, positions and ledger rows
 * stay without a profile: other traders' prices and payouts depend on them.
 */
export function deleteAccount(store: Store, accountId: string) {
  const now = new Date().toISOString();
  store.transaction(() => {
    for (const table of ["drafts", "comments", "watchlist", "notifications"])
      store.db
        .prepare(`DELETE FROM ${table} WHERE account_id=?`)
        .run(accountId);
    store.db
      .prepare(
        "UPDATE orders SET status='cancelled',note='Account deleted',closed_at=? WHERE account_id=? AND status='open'",
      )
      .run(now, accountId);
    // A workspace keeps an owner: the longest-standing other member takes over.
    store.db
      .prepare(
        `UPDATE workspace_members SET role='owner' WHERE id IN (
          SELECT (SELECT n.id FROM workspace_members n WHERE n.workspace_id=m.workspace_id AND n.account_id<>? AND n.removed_at IS NULL ORDER BY n.joined_at LIMIT 1)
          FROM workspace_members m WHERE m.account_id=? AND m.role='owner' AND m.removed_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM workspace_members o WHERE o.workspace_id=m.workspace_id AND o.account_id<>? AND o.role='owner' AND o.removed_at IS NULL))`,
      )
      .run(accountId, accountId, accountId);
    // The name goes too; member ids are unique, so the workspace name index holds.
    store.db
      .prepare(
        "UPDATE workspace_members SET removed_at=COALESCE(removed_at,?),display_name=? || id WHERE account_id=?",
      )
      .run(now, FORMER_MEMBER, accountId);
    store.db
      .prepare(
        "UPDATE workspace_invites SET revoked_at=? WHERE created_by=? AND revoked_at IS NULL",
      )
      .run(now, accountId);
    store.db
      .prepare(
        "UPDATE accounts SET display_name=NULL,deleted_at=?,expires_at=?,token_hash=? WHERE id=?",
      )
      .run(now, now, `deleted:${accountId}`, accountId);
  });
  return { deleted: true as const };
}

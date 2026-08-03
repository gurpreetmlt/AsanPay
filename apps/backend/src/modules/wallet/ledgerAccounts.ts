import { and, eq } from "drizzle-orm";
import { accounts, accountBalances, users } from "../../db/postgres/schema";
import { invalidateAccount, type Tx } from "../../core/ledger";
import type { AccountType } from "../../core/ledger";
import { HttpError } from "../../utils/httpError";

// A hierarchy wallet is a LIABILITY account: we owe the agent this money. That class is what
// makes it hard balance-checked on every debit, with no overdraft path.
const ROLE_TO_ACCOUNT: Record<string, { prefix: string; type: AccountType } | undefined> = {
  master_distributor: { prefix: "SD", type: "sd" },
  distributor: { prefix: "DIST", type: "distributor" },
  retailer: { prefix: "RTL", type: "retailer" },
};

/** Stable, human-readable account code for an agent — `RTL_AP001234`. Never reused. */
export function hierarchyAccountCode(role: string, uid: string): string {
  const mapping = ROLE_TO_ACCOUNT[role];
  if (!mapping) {
    throw new HttpError(422, `Role ${role} has no hierarchy wallet`, "ROLE_HAS_NO_WALLET");
  }
  return `${mapping.prefix}_${uid}`;
}

/**
 * Create the ledger account for an agent if it does not exist yet, and return its code.
 * Idempotent — safe to call on every login, onboarding step or transfer.
 *
 * Admin deliberately gets nothing here. Admin is an operator, not a wallet: an admin funds
 * the company wallet and every journal records them in `performed_by`.
 */
export async function ensureHierarchyAccount(
  tx: Tx,
  tenantId: string,
  userId: string,
): Promise<string> {
  const [user] = await tx
    .select({ uid: users.uid, role: users.role, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  const mapping = ROLE_TO_ACCOUNT[user.role];
  if (!mapping) {
    throw new HttpError(
      422,
      `${user.role} does not hold a hierarchy wallet`,
      "ROLE_HAS_NO_WALLET",
    );
  }

  const code = `${mapping.prefix}_${user.uid}`;

  const [existing] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)))
    .limit(1);

  if (existing) return code;

  const inserted = await tx
    .insert(accounts)
    .values({
      tenantId,
      code,
      name: user.name,
      accountType: mapping.type,
      accountClass: "liability",
      scope: "tenant",
      userId,
      isSystem: false,
      isProtected: false,
      isHidden: false,
      requiresBalanceCheck: true,
    })
    .onConflictDoNothing({ target: [accounts.tenantId, accounts.code] })
    .returning({ id: accounts.id });

  const accountId =
    inserted[0]?.id ??
    (
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)))
        .limit(1)
    )[0]?.id;

  if (!accountId) {
    throw new HttpError(500, `Could not create ledger account ${code}`, "ACCOUNT_CREATE_FAILED");
  }

  await tx
    .insert(accountBalances)
    .values({ accountId })
    .onConflictDoNothing({ target: accountBalances.accountId });

  invalidateAccount(tenantId, code);
  return code;
}

/**
 * Register a treasury-side account (bank, transit, float) created by ops, so adding a bank or
 * an aggregator stays an INSERT. These are ASSET accounts and are never balance-checked —
 * a float account legitimately runs negative between a spend and the top-up that covers it.
 */
export async function ensureTreasuryAccount(
  tx: Tx,
  params: {
    tenantId: string;
    code: string;
    name: string;
    type: Extract<AccountType, "bank" | "transit" | "float">;
  },
): Promise<string> {
  const { tenantId, code, name, type } = params;

  const inserted = await tx
    .insert(accounts)
    .values({
      tenantId,
      code,
      name,
      accountType: type,
      accountClass: "asset",
      scope: "tenant",
      isSystem: true,
      isProtected: true,
      isHidden: false,
      requiresBalanceCheck: false,
    })
    .onConflictDoNothing({ target: [accounts.tenantId, accounts.code] })
    .returning({ id: accounts.id });

  const accountId =
    inserted[0]?.id ??
    (
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)))
        .limit(1)
    )[0]?.id;

  if (!accountId) {
    throw new HttpError(500, `Could not create treasury account ${code}`, "ACCOUNT_CREATE_FAILED");
  }

  await tx
    .insert(accountBalances)
    .values({ accountId })
    .onConflictDoNothing({ target: accountBalances.accountId });

  invalidateAccount(tenantId, code);
  return code;
}

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { accounts, accountBalances, tenants } from "../../db/postgres/schema";
import { clearAccountCache } from "../../core/ledger";
import type { AccountType } from "../../core/ledger";

interface SystemAccountSpec {
  code: string;
  name: string;
  type: AccountType;
  cls: "asset" | "liability" | "internal" | "income" | "expense";
  hidden: boolean;
}

// Created per tenant at boot, idempotently. Bank / transit / float accounts are NOT here —
// those are created when a bank account or a provider is registered, so adding an aggregator
// stays an INSERT rather than a code change.
export const SYSTEM_ACCOUNTS: readonly SystemAccountSpec[] = [
  { code: "TREASURY_001", name: "Treasury", type: "treasury", cls: "internal", hidden: true },
  {
    code: "TREASURY_FLOAT_CONTROL",
    name: "Float Control",
    type: "control",
    cls: "internal",
    hidden: true,
  },
  {
    code: "TREASURY_SUSPENSE_UNIDENTIFIED",
    name: "Suspense — Unidentified Credit",
    type: "suspense",
    cls: "liability",
    hidden: true,
  },
  {
    code: "TREASURY_SUSPENSE_MISMATCH",
    name: "Suspense — Mismatch",
    type: "suspense",
    cls: "liability",
    hidden: true,
  },
  {
    code: "TREASURY_SETTLE_RECEIVABLE",
    name: "Settlement Receivable",
    type: "settlement",
    cls: "asset",
    hidden: true,
  },
  {
    code: "TREASURY_SETTLE_PAYABLE",
    name: "Settlement Payable",
    type: "settlement",
    cls: "liability",
    hidden: true,
  },
  { code: "COMPANY_001", name: "Company Wallet", type: "company", cls: "internal", hidden: true },
  {
    code: "COMMISSION_INCOME",
    name: "Commission Income",
    type: "income",
    cls: "income",
    hidden: false,
  },
  { code: "BANK_CHARGES", name: "Bank Charges", type: "expense", cls: "expense", hidden: false },
];

const ADVISORY_LOCK_NAMESPACE = 900000;

/**
 * Idempotent, multi-pod safe. The advisory lock means one instance seeds while the others
 * wait and then find the rows already present — no duplicate-key storm on a rolling deploy.
 */
export async function seedSystemAccounts(tenantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // A tenant uuid does not fit in the int an advisory lock takes, so hash it. A collision
    // only costs a brief wait, never correctness — the ON CONFLICT below is the real guard.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE} + ('x' || substr(md5(${tenantId}), 1, 7))::bit(28)::int)`,
    );

    await tx
      .insert(accounts)
      .values(
        SYSTEM_ACCOUNTS.map((a) => ({
          tenantId,
          code: a.code,
          name: a.name,
          accountType: a.type,
          accountClass: a.cls,
          scope: "tenant" as const,
          isSystem: true,
          isProtected: true,
          isHidden: a.hidden,
          // System accounts are never balance-checked. Only agent wallets are, and they can
          // never go negative — see the trg_no_overdraft trigger.
          requiresBalanceCheck: false,
        })),
      )
      .onConflictDoNothing({ target: [accounts.tenantId, accounts.code] });

    const seeded = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, tenantId),
          inArray(
            accounts.code,
            SYSTEM_ACCOUNTS.map((a) => a.code),
          ),
        ),
      );

    if (seeded.length > 0) {
      await tx
        .insert(accountBalances)
        .values(seeded.map((row) => ({ accountId: row.id })))
        .onConflictDoNothing({ target: accountBalances.accountId });
    }
  });

  clearAccountCache();
  await verifySystemAccounts(tenantId);
}

/**
 * Throws if any system account is missing or has the wrong flags. Callers must let this
 * propagate: a half-initialised financial system is worse than a stopped one.
 */
export async function verifySystemAccounts(tenantId: string): Promise<void> {
  const rows = await db
    .select({
      code: accounts.code,
      accountType: accounts.accountType,
      accountClass: accounts.accountClass,
      isSystem: accounts.isSystem,
      isProtected: accounts.isProtected,
      userId: accounts.userId,
      status: accounts.status,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.tenantId, tenantId),
        inArray(
          accounts.code,
          SYSTEM_ACCOUNTS.map((a) => a.code),
        ),
      ),
    );

  const byCode = new Map(rows.map((r) => [r.code, r]));
  const problems: string[] = [];

  for (const spec of SYSTEM_ACCOUNTS) {
    const row = byCode.get(spec.code);
    if (!row) {
      problems.push(`${spec.code}: missing`);
      continue;
    }
    if (row.accountType !== spec.type) {
      problems.push(`${spec.code}: account_type is ${row.accountType}, expected ${spec.type}`);
    }
    if (row.accountClass !== spec.cls) {
      problems.push(`${spec.code}: account_class is ${row.accountClass}, expected ${spec.cls}`);
    }
    if (!row.isSystem) problems.push(`${spec.code}: is_system is false`);
    if (!row.isProtected) problems.push(`${spec.code}: is_protected is false`);
    if (row.userId) problems.push(`${spec.code}: is owned by a user`);
    if (row.status !== "active") problems.push(`${spec.code}: status is ${row.status}`);
  }

  // A system account without a balance row would fault on its first journal, at the worst
  // possible moment. Catch it at boot instead.
  const missingBalances = await db
    .select({ code: accounts.code })
    .from(accounts)
    .leftJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(
      and(
        eq(accounts.tenantId, tenantId),
        eq(accounts.isSystem, true),
        isNull(accountBalances.accountId),
      ),
    );

  for (const row of missingBalances) {
    problems.push(`${row.code}: has no account_balances row`);
  }

  if (problems.length > 0) {
    throw new Error(
      `System accounts are not usable for tenant ${tenantId}:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

/** Seed and verify every active tenant. Call before app.listen(), never from a route. */
export async function bootstrapLedger(): Promise<void> {
  const active = await db
    .select({ id: tenants.id, code: tenants.code })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  if (active.length === 0) {
    throw new Error(
      "No active tenant found. Migration 0023 seeds tenant 'ASANPAY' — run `npm run db:migrate`.",
    );
  }

  for (const tenant of active) {
    await seedSystemAccounts(tenant.id);
  }
}

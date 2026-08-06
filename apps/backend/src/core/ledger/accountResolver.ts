import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/postgres";
import { accounts } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import type { AccountType } from "./flowMatrix";
import type { Tx } from "./types";

export interface ResolvedAccount {
  id: bigint;
  code: string;
  accountType: AccountType;
  accountClass: "asset" | "liability" | "internal" | "income" | "expense";
  requiresBalanceCheck: boolean;
  blockServices: boolean;
  blockTopup: boolean;
  blockSettlement: boolean;
  status: "active" | "inactive" | "closed";
}

// Accounts are created rarely and never renamed (the protect_system_accounts trigger blocks a
// code change on protected rows), so a process-level Map is enough. No Redis, no invalidation
// protocol — a newly created account simply misses the cache once and is then resolved from
// the row it was just inserted with.
const cache = new Map<string, ResolvedAccount>();

const key = (tenantId: string, code: string) => `${tenantId}:${code}`;

function toResolved(row: typeof accounts.$inferSelect): ResolvedAccount {
  return {
    id: row.id,
    code: row.code,
    accountType: row.accountType,
    accountClass: row.accountClass,
    requiresBalanceCheck: row.requiresBalanceCheck,
    blockServices: row.blockServices,
    blockTopup: row.blockTopup,
    blockSettlement: row.blockSettlement,
    status: row.status,
  };
}

/**
 * Resolve account codes to rows for one tenant. Unknown codes throw — the engine never
 * guesses, and never creates an account as a side effect of posting money.
 */
export async function resolveAccounts(
  tenantId: string,
  codes: readonly string[],
  tx?: Tx,
): Promise<Map<string, ResolvedAccount>> {
  const wanted = [...new Set(codes)];
  const out = new Map<string, ResolvedAccount>();
  const missing: string[] = [];

  for (const code of wanted) {
    const hit = cache.get(key(tenantId, code));
    if (hit) out.set(code, hit);
    else missing.push(code);
  }

  if (missing.length > 0) {
    const runner = tx ?? db;
    const rows = await runner
      .select()
      .from(accounts)
      .where(and(eq(accounts.tenantId, tenantId), inArray(accounts.code, missing)));

    for (const row of rows) {
      const resolved = toResolved(row);
      cache.set(key(tenantId, row.code), resolved);
      out.set(row.code, resolved);
    }
  }

  const unresolved = wanted.filter((c) => !out.has(c));
  if (unresolved.length > 0) {
    throw new HttpError(
      500,
      `Unknown ledger account code(s): ${unresolved.join(", ")}`,
      "ACCOUNT_NOT_FOUND",
    );
  }

  return out;
}

export async function resolveAccount(
  tenantId: string,
  code: string,
  tx?: Tx,
): Promise<ResolvedAccount> {
  const map = await resolveAccounts(tenantId, [code], tx);
  return map.get(code) as ResolvedAccount;
}

/** Call after creating or mutating an account row so the next resolve reads fresh state. */
export function invalidateAccount(tenantId: string, code: string): void {
  cache.delete(key(tenantId, code));
}

/** Used by the bootstrap verifier and by tests that rebuild the chart of accounts. */
export function clearAccountCache(): void {
  cache.clear();
}

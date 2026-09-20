import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { UserRole } from "@asanpay/shared-types";
import { db } from "../db/postgres";
import { uidCounters } from "../db/postgres/schema";
import { HttpError } from "./httpError";

/** Brand short + role for new public agent IDs (legacy RT/DS/MD/AD untouched). */
export const UID_BRAND = "ASP";

export const UID_PREFIX: Record<UserRole, string> = {
  admin: `${UID_BRAND}AD`,
  super_distributor: `${UID_BRAND}SD`,
  distributor: `${UID_BRAND}D`,
  retailer: `${UID_BRAND}RT`,
};

type DbExecutor = typeof db | PgTransaction<any, any, any>;

/**
 * Allocate next public UID for a role: e.g. ASPRT100001, ASPD100001, ASPSD100001.
 * Prefer calling inside the same DB transaction as the user insert.
 */
export async function allocateUid(role: UserRole, executor: DbExecutor): Promise<string> {
  const prefix = UID_PREFIX[role];
  const [row] = await executor
    .update(uidCounters)
    .set({ nextValue: sql`${uidCounters.nextValue} + 1` })
    .where(eq(uidCounters.role, role))
    .returning({ nextValue: uidCounters.nextValue });

  if (!row?.nextValue) {
    throw new HttpError(
      500,
      `UID counter missing for role ${role}. Run DB migrate (0046_uid_counters).`,
      "UID_COUNTER_MISSING",
    );
  }

  // UPDATE … SET next = next + 1 RETURNING next → new value; allocated = new - 1.
  const n = Number(row.nextValue) - 1;
  if (!Number.isFinite(n) || n < 1) {
    throw new HttpError(500, "UID counter returned an invalid value", "UID_COUNTER_INVALID");
  }

  return `${prefix}${n}`;
}

/**
 * Last 6 chars used in txn refs so support can spot which agent did the txn.
 * Prefers trailing digits (ASPRT100001 → 100001); falls back to alnum tail for legacy RT… hex.
 */
export function agentTailFromUid(uid: string): string {
  const digits = String(uid ?? "").replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(-6);
  if (digits.length > 0) return digits.padStart(6, "0");
  const clean = String(uid ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (clean.length >= 6) return clean.slice(-6);
  return (clean || "000000").padStart(6, "0").slice(-6);
}

/**
 * New txn refs: ASP + YYMMDD + agentTail(6) + 6 hex random.
 * Example: ASP260920100001A1B2C3 (legacy LKP… refs unchanged in DB).
 */
export function generateTxnRef(agentUid: string): string {
  const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const tail = agentTailFromUid(agentUid);
  const random = randomBytes(3).toString("hex").toUpperCase();
  return `${UID_BRAND}${yymmdd}${tail}${random}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

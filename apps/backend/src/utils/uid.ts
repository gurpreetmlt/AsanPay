import { createHash, randomBytes } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { UserRole } from "@asanpay/shared-types";
import { db } from "../db/postgres";
import { uidCounters, users } from "../db/postgres/schema";
import { HttpError } from "./httpError";

/** Brand short + role for new public agent IDs (legacy RT/DS/MD/AD untouched until remapped). */
export const UID_BRAND = "ASP";

export const UID_PREFIX: Record<UserRole, string> = {
  admin: `${UID_BRAND}AD`,
  super_distributor: `${UID_BRAND}SD`,
  distributor: `${UID_BRAND}D`,
  retailer: `${UID_BRAND}RT`,
};

export const UID_SEQUENCE_START = 100_001;

type DbExecutor = typeof db | PgTransaction<any, any, any>;

/** Parse sequence number from an ASP* uid for a role, or null if not in new format. */
export function parseAspSequence(uid: string, role: UserRole): number | null {
  const prefix = UID_PREFIX[role];
  if (!uid.startsWith(prefix)) return null;
  const rest = uid.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  const n = Number(rest);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Set next_value to max(existing ASP* seq for role) + 1, or UID_SEQUENCE_START if none.
 * Call after user delete (dev) so the next onboard reuses a tight sequence.
 */
export async function resyncUidCounter(role: UserRole, executor: DbExecutor): Promise<number> {
  const rows = await executor
    .select({ uid: users.uid })
    .from(users)
    .where(eq(users.role, role));

  let max = UID_SEQUENCE_START - 1;
  for (const row of rows) {
    const n = parseAspSequence(row.uid, role);
    if (n != null && n > max) max = n;
  }
  const next = max + 1;

  const [updated] = await executor
    .update(uidCounters)
    .set({ nextValue: next })
    .where(eq(uidCounters.role, role))
    .returning({ nextValue: uidCounters.nextValue });

  if (!updated) {
    throw new HttpError(
      500,
      `UID counter missing for role ${role}. Run DB migrate (0046_uid_counters).`,
      "UID_COUNTER_MISSING",
    );
  }

  return Number(updated.nextValue);
}

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
 * One-shot: remap every user of each role to ASP*+sequential (by createdAt), then resync counters.
 * Intended for development when public UIDs may still change.
 */
export async function remapAllAgentUids(executor: DbExecutor = db): Promise<{
  remapped: number;
  byRole: Record<string, number>;
}> {
  const roles: UserRole[] = ["admin", "super_distributor", "distributor", "retailer"];
  const byRole: Record<string, number> = {};
  let remapped = 0;

  for (const role of roles) {
    const prefix = UID_PREFIX[role];
    const rows = await executor
      .select({ id: users.id, uid: users.uid })
      .from(users)
      .where(eq(users.role, role))
      .orderBy(asc(users.createdAt), asc(users.id));

    let seq = UID_SEQUENCE_START;
    for (const row of rows) {
      const nextUid = `${prefix}${seq}`;
      seq += 1;
      if (row.uid === nextUid) continue;
      // Two-step update avoids unique collisions when swapping within the same role.
      const temp = `T${row.id.replace(/-/g, "").slice(0, 18)}`;
      await executor.update(users).set({ uid: temp }).where(eq(users.id, row.id));
      await executor.update(users).set({ uid: nextUid }).where(eq(users.id, row.id));
      remapped += 1;
    }
    byRole[role] = rows.length;
    await resyncUidCounter(role, executor);
  }

  return { remapped, byRole };
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

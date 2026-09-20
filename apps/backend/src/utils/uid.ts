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

export function generateTxnRef(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = randomBytes(4).toString("hex").toUpperCase();
  return `LKP${date}${random}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

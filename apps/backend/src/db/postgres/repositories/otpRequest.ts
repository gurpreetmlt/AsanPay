import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "../index";
import { otpRequests, type OtpMeta } from "../schema";

export const MAX_OTP_ATTEMPTS = 5;

export type OtpPurpose =
  | "login"
  | "signup"
  | "wallet_pull"
  | "email_verify"
  | "settlement_bank"
  | "device_register";

export interface InsertOtpRequestInput {
  mobile: string;
  otpHash: string;
  purpose: OtpPurpose;
  expiresAt: Date;
  meta?: OtpMeta | null;
}

export async function insertOtpRequest(input: InsertOtpRequestInput): Promise<void> {
  // Invalidate any prior live codes for this mobile+purpose (single active OTP).
  await db
    .update(otpRequests)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(otpRequests.mobile, input.mobile),
        eq(otpRequests.purpose, input.purpose),
        isNull(otpRequests.consumedAt),
      ),
    );

  await db.insert(otpRequests).values({
    mobile: input.mobile,
    otpHash: input.otpHash,
    purpose: input.purpose,
    expiresAt: input.expiresAt,
    meta: input.meta ?? null,
  });
}

export interface ActiveOtpRecord {
  id: string;
  otpHash: string;
  attempts: number;
  meta: OtpMeta | null;
}

export async function findLatestActiveOtp(filter: {
  mobile: string;
  purpose: OtpPurpose;
}): Promise<ActiveOtpRecord | null> {
  const [row] = await db
    .select({
      id: otpRequests.id,
      otpHash: otpRequests.otpHash,
      attempts: otpRequests.attempts,
      meta: otpRequests.meta,
    })
    .from(otpRequests)
    .where(
      and(
        eq(otpRequests.mobile, filter.mobile),
        eq(otpRequests.purpose, filter.purpose),
        isNull(otpRequests.consumedAt),
        gt(otpRequests.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpRequests.createdAt))
    .limit(1);
  return row ?? null;
}

/** Latest OTP row for clearer verify errors (expired / already used / never sent). */
export async function findLatestOtpAny(filter: {
  mobile: string;
  purpose: OtpPurpose;
}): Promise<{
  id: string;
  consumedAt: Date | null;
  expiresAt: Date;
} | null> {
  const [row] = await db
    .select({
      id: otpRequests.id,
      consumedAt: otpRequests.consumedAt,
      expiresAt: otpRequests.expiresAt,
    })
    .from(otpRequests)
    .where(and(eq(otpRequests.mobile, filter.mobile), eq(otpRequests.purpose, filter.purpose)))
    .orderBy(desc(otpRequests.createdAt))
    .limit(1);
  return row ?? null;
}

export async function incrementOtpAttempts(id: string): Promise<void> {
  await db
    .update(otpRequests)
    .set({ attempts: sql`${otpRequests.attempts} + 1` })
    .where(eq(otpRequests.id, id));
}

export async function markOtpConsumed(id: string): Promise<void> {
  await db.update(otpRequests).set({ consumedAt: new Date() }).where(eq(otpRequests.id, id));
}

/** Sweeps expired OTP rows — Postgres has no native TTL index like Mongo did. */
export async function deleteExpiredOtpRequests(): Promise<void> {
  await db.delete(otpRequests).where(lt(otpRequests.expiresAt, sql`now()`));
}

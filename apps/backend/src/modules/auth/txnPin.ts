import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { hashPassword, comparePassword } from "../../utils/password";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { assertStrongPin } from "../../utils/weakPin";
import { signTxnAuth, verifyTxnAuth } from "../../utils/jwt";
import { env } from "../../config/env";

const PIN_PATTERN = /^\d{4}$/;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

/**
 * First-time PIN: authenticated session is enough (OTP signup may have no known password).
 * Change PIN: caller must prove login password (`passwordOk`).
 */
export async function setTxnPin(
  userId: string,
  pin: string,
  opts: { passwordOk?: boolean } = {},
): Promise<{ hasTxnPin: true }> {
  assertStrongPin(pin, "Transaction PIN");
  if (!PIN_PATTERN.test(pin)) {
    throw new HttpError(422, "Transaction PIN must be 4 digits", "INVALID_PIN_FORMAT");
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) {
    throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  }

  const isFirstSet = !user.txnPinHash;
  if (!opts.passwordOk) {
    throw new HttpError(
      401,
      isFirstSet ? "Not authorized to set PIN" : "Password verification failed",
      "INVALID_CREDENTIALS",
    );
  }

  // One PIN, two uses: the same 4-digit code doubles as the Welcome-back Login MPIN (skip-OTP
  // quick unlock) so a retailer never has to remember or set up a second PIN. There is no
  // separate "set Login MPIN" screen anywhere in the app — this is the only place either gets set.
  const txnPinHash = await hashPassword(pin);
  await db
    .update(users)
    .set({
      txnPinHash,
      loginMpinHash: txnPinHash,
      txnPinFailedAttempts: 0,
      txnPinLockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await insertAuditLog({
    userId,
    action: "auth.txn_pin_set",
    entityType: "user",
    entityId: userId,
    ipAddress: null,
    userAgent: null,
    metadata: { firstSet: isFirstSet },
  });
  return { hasTxnPin: true };
}

export async function verifyTxnPinOrThrow(userId: string, pin: string | undefined): Promise<void> {
  if (!pin) {
    throw new HttpError(422, "Transaction PIN is required", "TXN_PIN_REQUIRED");
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) {
    throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  }
  if (user.txnPinLockedUntil && user.txnPinLockedUntil.getTime() > Date.now()) {
    throw new HttpError(429, "Transaction PIN temporarily locked — try again later", "TXN_PIN_LOCKED");
  }
  if (!user.txnPinHash) {
    throw new HttpError(
      409,
      "Transaction PIN is not set. Set a 4-digit PIN in Settings → Transaction PIN, then try again.",
      "TXN_PIN_NOT_SET",
    );
  }
  const ok = await comparePassword(pin, user.txnPinHash);
  if (!ok) {
    const attempts = (user.txnPinFailedAttempts ?? 0) + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null;
    await db
      .update(users)
      .set({
        txnPinFailedAttempts: lockedUntil ? 0 : attempts,
        txnPinLockedUntil: lockedUntil,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await insertAuditLog({
      userId,
      action: "auth.txn_pin_failed",
      entityType: "user",
      entityId: userId,
      ipAddress: null,
      userAgent: null,
      metadata: { attempts, locked: Boolean(lockedUntil) },
    });
    if (lockedUntil) {
      throw new HttpError(429, "Too many incorrect PIN attempts — locked for 15 minutes", "TXN_PIN_LOCKED");
    }
    throw new HttpError(401, "Incorrect transaction PIN", "TXN_PIN_INCORRECT");
  }

  if (user.txnPinFailedAttempts > 0 || user.txnPinLockedUntil) {
    await db
      .update(users)
      .set({ txnPinFailedAttempts: 0, txnPinLockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}

/** After PIN verify, issue a short-lived txnAuth so clients never re-send the PIN. */
export async function verifyTxnPinAndIssueAuth(
  userId: string,
  pin: string | undefined,
): Promise<{ txnAuth: string }> {
  await verifyTxnPinOrThrow(userId, pin);
  return { txnAuth: signTxnAuth(userId) };
}

/**
 * Accept either raw txnPin (legacy) or txnAuth from /txn-pin/verify.
 * Prefer txnAuth so the PIN is not echoed across money APIs.
 */
export async function assertTxnAuthorization(
  userId: string,
  input: { txnPin?: string; txnAuth?: string },
  opts: { always?: boolean } = {},
): Promise<void> {
  if (!env.REQUIRE_TXN_PIN && !opts.always) return;
  if (input.txnAuth) {
    try {
      const auth = verifyTxnAuth(input.txnAuth);
      if (auth.sub !== userId) {
        throw new HttpError(401, "Invalid transaction authorization", "TXN_AUTH_INVALID");
      }
      return;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(401, "Transaction authorization expired — enter PIN again", "TXN_AUTH_EXPIRED");
    }
  }
  await verifyTxnPinOrThrow(userId, input.txnPin);
}

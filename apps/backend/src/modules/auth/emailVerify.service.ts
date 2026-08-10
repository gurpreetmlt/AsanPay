import { randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { hashToken } from "../../utils/uid";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import {
  agentRoleLabel,
  emailVerificationTemplate,
  isMailerConfigured,
  notifyUserEmail,
  sendMail,
  welcomeEmailTemplate,
} from "../../utils/mailer";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import {
  MAX_OTP_ATTEMPTS,
  findLatestActiveOtp,
  incrementOtpAttempts,
  insertOtpRequest,
  markOtpConsumed,
} from "../../db/postgres/repositories/otpRequest";

/**
 * Free email for reuse: inactive rows + abandoned claims (email set but never verified).
 * Case-insensitive. Does not steal a verified email from another active account.
 */
export async function releaseEmailIfUnused(email: string, exceptUserId: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await db
    .update(users)
    .set({ email: null, emailVerifiedAt: null })
    .where(
      and(
        sql`lower(${users.email}) = ${normalized}`,
        ne(users.id, exceptUserId),
        or(eq(users.isActive, false), isNull(users.emailVerifiedAt)),
      ),
    );
}

/** Active account that still owns this verified email (blocks signup reuse). */
export async function findActiveVerifiedEmailHolder(
  email: string,
  exceptUserId: string,
): Promise<{ id: string; uid: string; mobile: string } | null> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select({ id: users.id, uid: users.uid, mobile: users.mobile })
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = ${normalized}`,
        eq(users.isActive, true),
        ne(users.id, exceptUserId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Shorter than the login/signup window — the user is already on the dashboard. */
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;

function otpHashesEqual(storedHash: string, candidateOtp: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(candidateOtp), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Sends a 6-digit code to `email` for the signed-in user. The OTP row is keyed by
 * the user's mobile (same as login/signup) with the target address in meta, so the
 * address is only written to users after it has actually been confirmed.
 */
export async function requestEmailVerifyOtp(input: {
  userId: string;
  email: string;
}): Promise<{ message: string; expiresInSeconds: number }> {
  if (!isMailerConfigured()) {
    throw new HttpError(503, "Email is not configured on this server", "EMAIL_NOT_CONFIGURED");
  }

  const email = input.email.trim().toLowerCase();

  const [row] = await db
    .select({
      id: users.id,
      mobile: users.mobile,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, input.userId));

  if (!row) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  if (row.email === email && row.emailVerifiedAt) {
    throw new HttpError(409, "This email is already verified", "EMAIL_ALREADY_VERIFIED");
  }

  await releaseEmailIfUnused(email, input.userId);
  const taken = await findActiveVerifiedEmailHolder(email, input.userId);
  if (taken) {
    throw new HttpError(409, "This email is already in use", "EMAIL_TAKEN");
  }

  const otp = randomInt(100000, 1000000).toString();

  await insertOtpRequest({
    mobile: row.mobile,
    otpHash: hashToken(otp),
    purpose: "email_verify",
    expiresAt: new Date(Date.now() + EMAIL_OTP_TTL_MS),
    meta: { email },
  });

  await insertAuditLog({
    userId: row.id,
    action: "auth.email_verify_requested",
    entityType: "user",
    entityId: row.id,
    // The address is not a secret; the OTP never leaves this function.
    metadata: { email },
  });

  // Don't block the API on Gmail SMTP (TLS + send often takes 2–8s). OTP is already
  // stored — client can show the modal immediately; Resend covers rare send failures.
  const template = emailVerificationTemplate(otp, EMAIL_OTP_TTL_MS / 60000);
  void sendMail({ ...template, to: email }).then((sent) => {
    if (sent) {
      logger.info({ userId: row.id }, "Email verification OTP sent");
    } else {
      logger.error({ userId: row.id, email }, "Email verification OTP send failed after accept");
    }
  });

  return {
    message: "Verification code sent",
    expiresInSeconds: EMAIL_OTP_TTL_MS / 1000,
  };
}

/** Confirms the code and writes the address + verified timestamp onto the user. */
export async function verifyEmailOtp(input: {
  userId: string;
  otp: string;
}): Promise<{ email: string; emailVerifiedAt: string }> {
  const [row] = await db
    .select({
      id: users.id,
      mobile: users.mobile,
      name: users.name,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, input.userId));

  if (!row) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  const firstEmailVerify = !row.emailVerifiedAt;

  const record = await findLatestActiveOtp({ mobile: row.mobile, purpose: "email_verify" });

  if (!record) {
    throw new HttpError(
      401,
      "Code has expired or was not requested. Please request a new one.",
      "OTP_EXPIRED",
    );
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(401, "Too many incorrect attempts — request a new code", "OTP_LOCKED");
  }

  if (!otpHashesEqual(record.otpHash, input.otp)) {
    await incrementOtpAttempts(record.id);
    throw new HttpError(401, "Incorrect code", "OTP_INCORRECT");
  }

  const email = record.meta?.email;
  if (!email) {
    // Should not happen — a code issued without a target address cannot be applied.
    throw new HttpError(500, "Verification record is incomplete", "OTP_META_MISSING");
  }

  await markOtpConsumed(record.id);

  const verifiedAt = new Date();
  await releaseEmailIfUnused(email, row.id);
  const taken = await findActiveVerifiedEmailHolder(email, row.id);
  if (taken) {
    throw new HttpError(409, "This email is already in use", "EMAIL_TAKEN");
  }

  await db
    .update(users)
    .set({ email, emailVerifiedAt: verifiedAt })
    .where(eq(users.id, row.id));

  await insertAuditLog({
    userId: row.id,
    action: "auth.email_verified",
    entityType: "user",
    entityId: row.id,
    metadata: { email },
  });

  // Signup has no email yet — welcome goes out once the inbox is confirmed.
  if (firstEmailVerify) {
    notifyUserEmail(email, () =>
      welcomeEmailTemplate({ name: row.name, roleLabel: agentRoleLabel(row.role) }),
    );
  }

  return { email, emailVerifiedAt: verifiedAt.toISOString() };
}

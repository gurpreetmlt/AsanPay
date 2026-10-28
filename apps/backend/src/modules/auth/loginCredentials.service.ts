import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { hashPassword } from "../../utils/password";
import { HttpError } from "../../utils/httpError";
import { isMailerConfigured, loginCredentialsEmailTemplate, sendMail } from "../../utils/mailer";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";

export const TEMP_PASSWORD_VALID_HOURS = 48;

// No 0/O, 1/l/I — the agent types this from an email.
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

/** 10 characters, always at least 2 digits and 2 letters so it passes the password rules. */
export function generateTempPassword(): string {
  const all = LETTERS + DIGITS;
  const chars = [pick(LETTERS), pick(LETTERS), pick(DIGITS), pick(DIGITS)];
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export type LoginEmailResult = { status: "sent" | "failed"; message: string };

/**
 * Emails a fresh temporary password. The old password (and any earlier temporary one) stops
 * working only when the email actually goes out, so a failed send never locks the agent out.
 */
export async function sendLoginCredentials(
  userId: string,
  actor: { actorId: string | null; source: "kyc_approval" | "admin_resend" },
): Promise<LoginEmailResult> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (row.role === "admin") {
    throw new HttpError(400, "Login email is only for agent accounts", "INVALID_TARGET");
  }

  const fail = async (message: string): Promise<LoginEmailResult> => {
    await db
      .update(users)
      .set({ loginEmailStatus: "failed", loginEmailMessage: message, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await insertAuditLog({
      userId: actor.actorId,
      action: "auth.login_email_failed",
      entityType: "user",
      entityId: userId,
      metadata: { source: actor.source, message },
    });
    return { status: "failed", message };
  };

  if (!row.email || !row.emailVerifiedAt) {
    return fail("No verified email on file. Ask the agent to verify an email, then resend.");
  }
  if (!isMailerConfigured()) {
    return fail("Email is not set up on the server (SMTP). Set SMTP_HOST, SMTP_USER and SMTP_PASS, then resend.");
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const mail = loginCredentialsEmailTemplate({
    name: row.name,
    mobile: row.mobile,
    tempPassword,
    validHours: TEMP_PASSWORD_VALID_HOURS,
  });
  const ok = await sendMail({ ...mail, to: row.email });
  if (!ok) {
    return fail(`Email to ${row.email} could not be delivered. Check the address, then resend.`);
  }

  const now = new Date();
  const message = `Sent to ${row.email}`;
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(now.getTime() + TEMP_PASSWORD_VALID_HOURS * 60 * 60 * 1000),
      loginEmailPending: false,
      loginEmailStatus: "sent",
      loginEmailMessage: message,
      loginEmailSentAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await insertAuditLog({
    userId: actor.actorId,
    action: "auth.login_email_sent",
    entityType: "user",
    entityId: userId,
    metadata: { source: actor.source },
  });

  return { status: "sent", message };
}

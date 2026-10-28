import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env";
import { db } from "../../db/postgres";
import { signupInvites, users } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { isMailerConfigured, sendMail, signupInviteEmailTemplate } from "../../utils/mailer";

const INVITE_TTL_DAYS = 7;

type InviteRole = "super_distributor" | "distributor" | "retailer";

/** Who may invite whom. Signup is invite-only; admin invites Super Distributors and Direct Retailers. */
const CHILD_ROLES: Record<string, InviteRole[]> = {
  admin: ["super_distributor", "retailer"],
  super_distributor: ["distributor"],
  distributor: ["retailer"],
};

const ROLE_LABEL: Record<string, string> = {
  super_distributor: "Super Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
};

/** Role the signup page and /signup/complete use — a retailer invited by admin has no Distributor. */
export type InviteSignupRole = "super_distributor" | "distributor" | "retailer" | "direct_retailer";
function signupRoleOf(inviteRole: string, inviterRole: string): InviteSignupRole {
  if (inviteRole === "retailer" && inviterRole === "admin") return "direct_retailer";
  return inviteRole as InviteSignupRole;
}

export const createInviteSchema = z.object({
  /** Admin only — upline roles always invite their single child role. */
  role: z.enum(["super_distributor", "retailer"]).optional(),
  name: z.string({ error: "Enter the full name" }).trim().min(2, "Enter the full name").max(120),
  mobile: z
    .string({ error: "Enter a valid 10-digit mobile" })
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile"),
  email: z
    .string({ error: "Enter a valid email address" })
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(160),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

type InviteRow = typeof signupInvites.$inferSelect;
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256(raw) };
}

function inviteLink(raw: string): string {
  return `${env.AGENT_PORTAL_URL.replace(/\/$/, "")}/signup?invite=${raw}`;
}

function expiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function statusOf(row: InviteRow): InviteStatus {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt.getTime() < Date.now()) return "expired";
  return "pending";
}

function toDto(row: InviteRow) {
  return {
    id: String(row.id),
    role: row.role,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    status: statusOf(row),
    expiresAt: row.expiresAt.toISOString(),
    emailSentAt: row.emailSentAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadInviter(inviterId: string) {
  const [inviter] = await db
    .select({ id: users.id, uid: users.uid, name: users.name, mobile: users.mobile, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, inviterId))
    .limit(1);
  if (!inviter || !inviter.isActive) {
    throw new HttpError(403, "Your account is inactive. Contact support.", "INVITER_INACTIVE");
  }
  const childRoles = CHILD_ROLES[inviter.role];
  if (!childRoles) {
    throw new HttpError(
      403,
      "Only Admin, Super Distributors and Distributors can send signup invites",
      "INVITE_NOT_ALLOWED",
    );
  }
  return { ...inviter, childRoles };
}

function pickChildRole(inviter: { role: string; childRoles: InviteRole[] }, requested?: InviteRole): InviteRole {
  if (inviter.childRoles.length === 1) return inviter.childRoles[0]!;
  if (!requested || !inviter.childRoles.includes(requested)) {
    throw new HttpError(422, "Choose who you are inviting: Super Distributor or Direct Retailer", "INVITE_ROLE_REQUIRED");
  }
  return requested;
}

async function emailInvite(row: InviteRow, rawToken: string, inviterName: string): Promise<boolean> {
  if (!isMailerConfigured()) {
    logger.warn({ inviteId: row.id }, "Invite email skipped: SMTP_HOST / SMTP_USER / SMTP_PASS not set");
    return false;
  }
  const ok = await sendMail({
    ...signupInviteEmailTemplate({
      name: row.name,
      roleLabel: ROLE_LABEL[row.role] ?? "Agent",
      inviterName,
      link: inviteLink(rawToken),
      expiresDays: INVITE_TTL_DAYS,
    }),
    to: row.email,
  });
  if (ok) {
    await db.update(signupInvites).set({ emailSentAt: new Date() }).where(eq(signupInvites.id, row.id));
  }
  return ok;
}

async function ownInvite(inviterId: string, id: string): Promise<InviteRow> {
  if (!/^\d+$/.test(id)) throw new HttpError(404, "Invite not found", "INVITE_NOT_FOUND");
  const [row] = await db
    .select()
    .from(signupInvites)
    .where(and(eq(signupInvites.id, BigInt(id)), eq(signupInvites.inviterId, inviterId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Invite not found", "INVITE_NOT_FOUND");
  return row;
}

export async function createInvite(inviterId: string, input: CreateInviteInput) {
  const inviter = await loadInviter(inviterId);
  const childRole = pickChildRole(inviter, input.role);

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.mobile, input.mobile), eq(users.isActive, true)))
    .limit(1);
  if (taken) {
    throw new HttpError(422, "This mobile number is already registered on AsanPay.", "MOBILE_TAKEN");
  }

  // One live invite per mobile from this upline: re-inviting replaces the old link.
  await db
    .update(signupInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(signupInvites.inviterId, inviterId),
        eq(signupInvites.mobile, input.mobile),
        isNull(signupInvites.acceptedAt),
        isNull(signupInvites.revokedAt),
      ),
    );

  const token = newToken();
  const [row] = await db
    .insert(signupInvites)
    .values({
      tokenHash: token.hash,
      inviterId,
      role: childRole,
      name: input.name,
      mobile: input.mobile,
      email: input.email,
      expiresAt: expiry(),
    })
    .returning();
  if (!row) throw new HttpError(500, "Could not create the invite");

  const emailSent = await emailInvite(row, token.raw, inviter.name);
  await insertAuditLog({
    userId: inviterId,
    action: "invite.created",
    entityType: "signup_invite",
    entityId: String(row.id),
    metadata: { role: row.role, mobile: row.mobile, emailSent },
  });

  return { invite: toDto({ ...row, emailSentAt: emailSent ? new Date() : null }), link: inviteLink(token.raw), emailSent };
}

export async function listInvites(inviterId: string) {
  const rows = await db
    .select()
    .from(signupInvites)
    .where(eq(signupInvites.inviterId, inviterId))
    .orderBy(desc(signupInvites.createdAt))
    .limit(100);
  return rows.map(toDto);
}

/** New link + fresh expiry; the previous link stops working. */
export async function resendInvite(inviterId: string, id: string) {
  const inviter = await loadInviter(inviterId);
  const row = await ownInvite(inviterId, id);
  if (row.acceptedAt) {
    throw new HttpError(422, "This invite was already used to create an account.", "INVITE_ALREADY_USED");
  }
  const token = newToken();
  const [updated] = await db
    .update(signupInvites)
    .set({ tokenHash: token.hash, expiresAt: expiry(), revokedAt: null, emailSentAt: null })
    .where(eq(signupInvites.id, row.id))
    .returning();
  if (!updated) throw new HttpError(500, "Could not resend the invite");
  const emailSent = await emailInvite(updated, token.raw, inviter.name);
  return { invite: toDto({ ...updated, emailSentAt: emailSent ? new Date() : null }), link: inviteLink(token.raw), emailSent };
}

export async function revokeInvite(inviterId: string, id: string) {
  const row = await ownInvite(inviterId, id);
  if (row.acceptedAt) {
    throw new HttpError(422, "This invite was already used to create an account.", "INVITE_ALREADY_USED");
  }
  const [updated] = await db
    .update(signupInvites)
    .set({ revokedAt: new Date() })
    .where(eq(signupInvites.id, row.id))
    .returning();
  return toDto(updated ?? row);
}

async function findUsable(rawToken: string) {
  const [row] = await db
    .select()
    .from(signupInvites)
    .where(eq(signupInvites.tokenHash, sha256(rawToken.trim())))
    .limit(1);
  if (!row) {
    throw new HttpError(404, "This invite link is not valid. Ask your upline to send a new one.", "INVITE_NOT_FOUND");
  }
  const status = statusOf(row);
  if (status === "accepted") {
    throw new HttpError(410, "This invite was already used. Log in with your mobile number.", "INVITE_ALREADY_USED");
  }
  if (status === "revoked") {
    throw new HttpError(410, "This invite was cancelled by your upline. Ask them to send a new one.", "INVITE_REVOKED");
  }
  if (status === "expired") {
    throw new HttpError(410, "This invite has expired. Ask your upline to resend it.", "INVITE_EXPIRED");
  }

  const [inviter] = await db
    .select({ id: users.id, uid: users.uid, name: users.name, mobile: users.mobile, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, row.inviterId))
    .limit(1);
  if (!inviter || !inviter.isActive || !(CHILD_ROLES[inviter.role] ?? []).includes(row.role as InviteRole)) {
    throw new HttpError(410, "Your upline account is no longer active. Contact support.", "INVITER_INACTIVE");
  }
  return { row, inviter };
}

/** Public: what the signup page shows before the person verifies their mobile. */
export async function lookupInvite(rawToken: string) {
  const { row, inviter } = await findUsable(rawToken);
  return {
    role: signupRoleOf(row.role, inviter.role),
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    expiresAt: row.expiresAt.toISOString(),
    sponsor: { uid: inviter.uid, name: inviter.name, mobile: inviter.mobile, role: inviter.role },
  };
}

/** Signup check: the invite must be live and issued for this exact mobile. */
export async function assertInviteForSignup(rawToken: string, mobile: string) {
  const { row, inviter } = await findUsable(rawToken);
  if (row.mobile !== mobile) {
    throw new HttpError(
      422,
      `This invite is for mobile ending ${row.mobile.slice(-4)}. Sign up with that number.`,
      "INVITE_MOBILE_MISMATCH",
    );
  }
  return { inviteId: row.id, role: signupRoleOf(row.role, inviter.role), sponsorUid: inviter.uid };
}

export async function markInviteAccepted(inviteId: bigint, userId: string): Promise<void> {
  await db
    .update(signupInvites)
    .set({ acceptedAt: new Date(), acceptedUserId: userId })
    .where(and(eq(signupInvites.id, inviteId), isNull(signupInvites.acceptedAt), gt(signupInvites.expiresAt, new Date())));
}

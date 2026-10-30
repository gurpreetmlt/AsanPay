import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { linkedAccounts, refreshTokens, users } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import {
  MAX_OTP_ATTEMPTS,
  findLatestActiveOtp,
  findLatestOtpAny,
  incrementOtpAttempts,
  insertOtpRequest,
  markOtpConsumed,
  type ActiveOtpRecord,
} from "../../db/postgres/repositories/otpRequest";
import { trustDevice } from "../../db/postgres/repositories/device";
import { getTestOtpOverride, shouldExposeOtpInResponse } from "../../config/env";
import { comparePassword } from "../../utils/password";
import { decryptPII } from "../../utils/aes";
import { hashToken } from "../../utils/uid";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { deliverAuthOtp } from "../telegram/link.service";
import { notifyAccountLinkChange } from "../notifications/userEmail.service";
import { ensurePolicyAccepted, issueSession } from "../auth/auth.service";
import {
  MAX_LINKED_ACCOUNTS,
  ROLE_LABELS,
  isAgentPortalRole,
  type AuthUser,
  type LinkCheckResult,
  type LinkIdentityChecks,
  type LinkedAccountSummary,
  type LinkedAccountsResponse,
  type UnlinkScope,
} from "@asanpay/shared-types";
import type { LinkStartInput, LinkVerifyInput, SwitchInput, SwitchOtpInput } from "./linkedAccounts.validators";

type AuthContext = { ipAddress: string | null; userAgent: string | null };
type UserRow = typeof users.$inferSelect;
type LinkRow = typeof linkedAccounts.$inferSelect;

const OTP_TTL_MS = 15 * 60 * 1000;
const SWITCH_OTP_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SWITCH_MPIN_ATTEMPTS = 5;
const SWITCH_LOCK_MS = 30 * 60 * 1000;

const MSG = {
  kycRequired: "Complete KYC on both accounts before linking.",
  identityMismatch: "This account belongs to a different PAN / Aadhaar and cannot be linked.",
  nameMismatch:
    "PAN and Aadhaar match, but the name on the other account is different. Contact support to correct the name, then try again.",
  limit: `You can link up to ${MAX_LINKED_ACCOUNTS} accounts — one Super Distributor, one Distributor and one Retailer.`,
  otpEvery24h: "For your security, verify with OTP once every 24 hours.",
  notLinked: "This account is not linked to you.",
} as const;

function otpHashesEqual(storedHash: string, candidateOtp: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(candidateOtp), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function maskMobile(mobile: string): string {
  return `XXXXXX${mobile.replace(/\D/g, "").slice(-4)}`;
}

function accountLabel(row: Pick<UserRow, "role" | "uid">): string {
  return `${ROLE_LABELS[row.role] ?? row.role} account ${row.uid}`;
}

function hasVerifiedKyc(row: UserRow): boolean {
  return row.kycStatus === "verified" && Boolean(row.panNumberEncrypted && row.aadhaarNumberEncrypted);
}

function safeDecrypt(encoded: string | null): string | null {
  if (!encoded) return null;
  try {
    return decryptPII(encoded);
  } catch {
    return null;
  }
}

/** Both verified PAN and Aadhaar must match — a single conflict means a different person. */
function isSamePerson(a: UserRow, b: UserRow): boolean {
  const panA = safeDecrypt(a.panNumberEncrypted)?.trim().toUpperCase();
  const panB = safeDecrypt(b.panNumberEncrypted)?.trim().toUpperCase();
  const aadhaarA = safeDecrypt(a.aadhaarNumberEncrypted)?.replace(/\D/g, "");
  const aadhaarB = safeDecrypt(b.aadhaarNumberEncrypted)?.replace(/\D/g, "");
  if (!panA || !panB || !aadhaarA || !aadhaarB) return false;
  return panA === panB && aadhaarA === aadhaarB;
}

/** Case / punctuation / word-order insensitive ("Singh, Gurpreet" = "Gurpreet Singh"). */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Name is compared only once PAN + Aadhaar match, so a stranger's name is never tested. */
function identityChecks(a: UserRow, b: UserRow): LinkIdentityChecks {
  const panA = safeDecrypt(a.panNumberEncrypted)?.trim().toUpperCase();
  const panB = safeDecrypt(b.panNumberEncrypted)?.trim().toUpperCase();
  const aadhaarA = safeDecrypt(a.aadhaarNumberEncrypted)?.replace(/\D/g, "");
  const aadhaarB = safeDecrypt(b.aadhaarNumberEncrypted)?.replace(/\D/g, "");
  const pan = Boolean(panA && panB && panA === panB);
  const aadhaar = Boolean(aadhaarA && aadhaarB && aadhaarA === aadhaarB);
  const name = pan && aadhaar && normalizeName(a.name) === normalizeName(b.name);
  return { pan, aadhaar, name };
}

type LinkBlock = { status: number; message: string; code: string; reason: string };

/** Accounts already in the caller's group (the caller alone when not linked yet). */
async function groupMembers(caller: UserRow): Promise<UserRow[]> {
  const link = await findLink(caller.id);
  if (!link) return [caller];
  const ids = (await loadGroup(link.groupId)).map((g) => g.userId);
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  return rows.length ? rows : [caller];
}

/**
 * First rule that stops `caller` adding `target` to their group, in the order the user should fix
 * them. Identity is checked against every account already in the group, not only the caller.
 */
async function linkBlocker(caller: UserRow, target: UserRow): Promise<LinkBlock | null> {
  if (!target.isActive) {
    return { status: 403, message: "The other account is inactive. Contact support.", code: "ACCOUNT_INACTIVE", reason: "inactive" };
  }
  const members = await groupMembers(caller);
  if (!members.every(hasVerifiedKyc) || !hasVerifiedKyc(target)) {
    return { status: 409, message: MSG.kycRequired, code: "KYC_REQUIRED", reason: "kyc_not_verified" };
  }
  for (const m of members) {
    const checks = identityChecks(m, target);
    if (!checks.pan || !checks.aadhaar) {
      return { status: 403, message: MSG.identityMismatch, code: "IDENTITY_MISMATCH", reason: "identity_mismatch" };
    }
    if (!checks.name) {
      return { status: 403, message: MSG.nameMismatch, code: "NAME_MISMATCH", reason: "name_mismatch" };
    }
  }
  if (members.some((m) => m.id === target.id)) {
    return { status: 409, message: "This account is already linked to you.", code: "ALREADY_LINKED", reason: "already_linked" };
  }
  const sameRole = members.find((m) => m.role === target.role);
  if (sameRole) {
    const label = ROLE_LABELS[target.role] ?? target.role;
    return {
      status: 422,
      message:
        sameRole.id === caller.id
          ? `Both accounts are ${label} accounts. You can link only one account per role (one Super Distributor, one Distributor and one Retailer).`
          : `Your linked accounts already include a ${label} account (${sameRole.uid}). You can link only one account per role.`,
      code: "SAME_ROLE",
      reason: "same_role",
    };
  }
  if (await findLink(target.id)) {
    return {
      status: 409,
      message: "This account is already linked to another account. Unlink it there first.",
      code: "TARGET_ALREADY_LINKED",
      reason: "target_linked",
    };
  }
  if (members.length >= MAX_LINKED_ACCOUNTS) {
    return { status: 409, message: MSG.limit, code: "LINK_LIMIT", reason: "limit" };
  }
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function loadUser(userId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ?? null;
}

async function loadActiveAgent(userId: string): Promise<UserRow> {
  const row = await loadUser(userId);
  if (!row || !row.isActive) {
    throw new HttpError(403, "This account is inactive. Contact support.", "ACCOUNT_INACTIVE");
  }
  if (!isAgentPortalRole(row.role)) {
    throw new HttpError(403, "Linked accounts are available only for agent accounts.", "FORBIDDEN");
  }
  return row;
}

async function findLink(userId: string): Promise<LinkRow | null> {
  const [row] = await db.select().from(linkedAccounts).where(eq(linkedAccounts.userId, userId));
  return row ?? null;
}

async function loadGroup(groupId: string): Promise<LinkRow[]> {
  return db.select().from(linkedAccounts).where(eq(linkedAccounts.groupId, groupId));
}

function needsSwitchOtp(link: LinkRow, now = Date.now()): boolean {
  return !link.otpVerifiedAt || now - link.otpVerifiedAt.getTime() >= SWITCH_OTP_WINDOW_MS;
}

function switchLockedUntil(link: LinkRow, now = Date.now()): Date | null {
  return link.switchLockedUntil && link.switchLockedUntil.getTime() > now ? link.switchLockedUntil : null;
}

function lockMessage(until: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return `Too many wrong MPIN attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function toSummary(row: UserRow, link: LinkRow | null, current: UserRow): LinkedAccountSummary {
  const isCurrent = row.id === current.id;
  const healthy =
    row.isActive && hasVerifiedKyc(row) && (isCurrent || isSamePerson(row, current));
  const locked = link ? switchLockedUntil(link) : null;
  return {
    userId: row.id,
    uid: row.uid,
    name: row.name,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] ?? row.role,
    mobileMasked: maskMobile(row.mobile),
    isCurrent,
    linkedAt: link ? link.createdAt.toISOString() : null,
    linkMethod: link ? "otp" : null,
    otpRequiredForSwitch: !isCurrent && link ? needsSwitchOtp(link) : false,
    switchLockedUntil: locked ? locked.toISOString() : null,
    status: healthy ? "active" : "needs_review",
  };
}

export async function listLinkedAccounts(userId: string): Promise<LinkedAccountsResponse> {
  const me = await loadActiveAgent(userId);
  const myLink = await findLink(userId);
  if (!myLink) {
    return { accounts: [toSummary(me, null, me)], maxLinked: MAX_LINKED_ACCOUNTS };
  }

  const group = await loadGroup(myLink.groupId);
  const memberRows = await db
    .select()
    .from(users)
    .where(inArray(users.id, group.map((g) => g.userId)));
  const byId = new Map(memberRows.map((r) => [r.id, r]));

  const accounts = group
    .map((link) => {
      const row = byId.get(link.userId);
      return row ? toSummary(row, link, me) : null;
    })
    .filter((a): a is LinkedAccountSummary => a !== null)
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));

  return { accounts, maxLinked: MAX_LINKED_ACCOUNTS };
}

async function sendLinkOtp(
  caller: UserRow,
  target: UserRow,
  action: "link" | "switch",
  context: AuthContext,
): Promise<{ message: string; expiresInSeconds: number; mobileMasked: string; otp?: string }> {
  const otp = getTestOtpOverride(target.mobile) ?? randomInt(100000, 1000000).toString();
  await insertOtpRequest({
    mobile: target.mobile,
    otpHash: hashToken(otp),
    purpose: "account_link",
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    meta: { linkRequestedByUserId: caller.id, linkAction: action },
  });

  await insertAuditLog({
    userId: caller.id,
    action: action === "link" ? "linked_accounts.link_otp_requested" : "linked_accounts.switch_otp_requested",
    entityType: "user",
    entityId: target.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { targetUid: target.uid },
  });

  const delivery = await deliverAuthOtp({
    mobile: target.mobile,
    otp,
    purpose: "account_link",
    telegramChatId: target.telegramChatId ?? null,
  });

  const exposeOtp = shouldExposeOtpInResponse();
  if (exposeOtp) {
    logger.info({ targetUid: target.uid, action }, "[OTP] account_link generated (value not logged)");
  }

  const mobileMasked = maskMobile(target.mobile);
  return {
    message:
      delivery.via === "whatsapp"
        ? `OTP has been sent on WhatsApp to ${mobileMasked}`
        : delivery.via === "telegram"
          ? "OTP sent to the other account's linked Telegram"
          : `OTP sent to ${mobileMasked}`,
    expiresInSeconds: OTP_TTL_MS / 1000,
    mobileMasked,
    ...(exposeOtp ? { otp } : {}),
  };
}

/** Validates the OTP without consuming it — callers consume only after every other check passes. */
async function checkLinkOtp(
  mobile: string,
  callerId: string,
  action: "link" | "switch",
  otp: string,
): Promise<ActiveOtpRecord> {
  const record = await findLatestActiveOtp({ mobile, purpose: "account_link" });
  const belongsToCaller =
    record?.meta?.linkRequestedByUserId === callerId && record?.meta?.linkAction === action;

  if (!record || !belongsToCaller) {
    const latest = record ? null : await findLatestOtpAny({ mobile, purpose: "account_link" });
    if (latest?.consumedAt) {
      throw new HttpError(422, "This OTP was already used. Tap Send OTP to request a new OTP.", "OTP_ALREADY_USED");
    }
    if (latest) {
      throw new HttpError(422, "OTP has expired. Tap Send OTP to request a new OTP.", "OTP_EXPIRED");
    }
    throw new HttpError(
      422,
      "No OTP was requested for this number. Tap Send OTP to get a new OTP.",
      "OTP_NOT_REQUESTED",
    );
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(422, "Too many incorrect attempts. Tap Send OTP to request a new OTP.", "OTP_LOCKED");
  }
  if (!otpHashesEqual(record.otpHash, otp)) {
    await incrementOtpAttempts(record.id);
    throw new HttpError(422, "Incorrect OTP. Check the code and try again.", "OTP_INCORRECT");
  }
  return record;
}

/** Caller-side gates + target lookup shared by /link/check and /link/start. */
async function loadLinkTarget(callerId: string, mobile: string): Promise<{ caller: UserRow; target: UserRow }> {
  const caller = await loadActiveAgent(callerId);
  if (!hasVerifiedKyc(caller)) {
    throw new HttpError(409, MSG.kycRequired, "KYC_REQUIRED");
  }
  if ((await groupMembers(caller)).length >= MAX_LINKED_ACCOUNTS) {
    throw new HttpError(409, MSG.limit, "LINK_LIMIT");
  }
  if (mobile === caller.mobile) {
    throw new HttpError(
      422,
      "Enter the mobile number of your other AsanPay account, not this one.",
      "SAME_ACCOUNT",
    );
  }

  const [target] = await db.select().from(users).where(eq(users.mobile, mobile));
  if (!target) {
    throw new HttpError(404, "This mobile number is not registered on AsanPay.", "MOBILE_NOT_REGISTERED");
  }
  if (!isAgentPortalRole(target.role)) {
    throw new HttpError(422, "This mobile number cannot be linked.", "LINK_NOT_ALLOWED");
  }
  return { caller, target };
}

/**
 * Verify popup data (before any OTP). Details of the other account are returned only when PAN and
 * Aadhaar match the caller's own verified KYC, so a stranger's name / UID is never exposed.
 */
export async function checkLink(
  callerId: string,
  input: LinkStartInput,
  context: AuthContext,
): Promise<LinkCheckResult> {
  const { caller, target } = await loadLinkTarget(callerId, input.mobile);
  const block = await linkBlocker(caller, target);
  const identityOnly = block?.code === "IDENTITY_MISMATCH" || block?.code === "NAME_MISMATCH";
  if (block && !identityOnly) {
    throw new HttpError(block.status, block.message, block.code);
  }

  const checks = identityChecks(caller, target);
  const samePerson = checks.pan && checks.aadhaar;
  await insertAuditLog({
    userId: caller.id,
    action: "linked_accounts.link_checked",
    entityType: "user",
    entityId: samePerson ? target.id : null,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { pan: checks.pan, aadhaar: checks.aadhaar, name: checks.name },
  });

  return {
    eligible: !block,
    message: block?.message ?? null,
    checks,
    account: samePerson
      ? {
          name: target.name,
          uid: target.uid,
          role: target.role,
          roleLabel: ROLE_LABELS[target.role] ?? target.role,
          mobileMasked: maskMobile(target.mobile),
          kycStatus: "verified",
        }
      : null,
  };
}

/** OTP goes out only after the full identity match (no OTP to a stranger's mobile). */
export async function startLink(
  callerId: string,
  input: LinkStartInput,
  context: AuthContext,
): Promise<{ message: string; expiresInSeconds: number; mobileMasked: string; otp?: string }> {
  const { caller, target } = await loadLinkTarget(callerId, input.mobile);
  const block = await linkBlocker(caller, target);
  if (block) throw new HttpError(block.status, block.message, block.code);
  return sendLinkOtp(caller, target, "link", context);
}

export async function verifyLink(
  callerId: string,
  input: LinkVerifyInput,
  context: AuthContext,
): Promise<LinkedAccountsResponse> {
  const caller = await loadActiveAgent(callerId);
  const record = await checkLinkOtp(input.mobile, callerId, "link", input.otp);

  const [target] = await db.select().from(users).where(eq(users.mobile, input.mobile));
  if (!target || !isAgentPortalRole(target.role)) {
    throw new HttpError(404, "This mobile number is not registered on AsanPay.", "MOBILE_NOT_REGISTERED");
  }
  if (!target.loginMpinHash) {
    throw new HttpError(
      409,
      "MPIN is not set on the other account. Log in to it once, set an MPIN, then try again.",
      "MPIN_NOT_SET",
    );
  }
  if (!(await comparePassword(input.mpin, target.loginMpinHash))) {
    await incrementOtpAttempts(record.id);
    await insertAuditLog({
      userId: caller.id,
      action: "linked_accounts.link_failed",
      entityType: "user",
      entityId: target.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { reason: "mpin_incorrect" },
    });
    throw new HttpError(422, "Incorrect MPIN for the other account. Check it and try again.", "MPIN_INCORRECT");
  }

  await markOtpConsumed(record.id);

  // Re-run every rule — KYC / identity can change between the Verify popup and this call.
  const block = await linkBlocker(caller, target);
  if (block) {
    await insertAuditLog({
      userId: caller.id,
      action: "linked_accounts.link_failed",
      entityType: "user",
      entityId: target.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { reason: block.reason },
    });
    throw new HttpError(block.status, block.message, block.code);
  }

  const now = new Date();
  const existing = await findLink(caller.id);
  const groupId = existing?.groupId ?? randomUUID();
  try {
    await db.transaction(async (tx) => {
      // Two links into the same group at once must not push it past the cap or duplicate a role.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`link_group:${groupId}`}))`);
      const current = await tx.select({ userId: linkedAccounts.userId }).from(linkedAccounts).where(eq(linkedAccounts.groupId, groupId));
      if (existing && current.length === 0) throw new HttpError(409, MSG.notLinked, "NOT_LINKED");
      if (current.length >= MAX_LINKED_ACCOUNTS) throw new HttpError(409, MSG.limit, "LINK_LIMIT");
      if (current.length > 0) {
        const roles = await tx
          .select({ role: users.role })
          .from(users)
          .where(inArray(users.id, current.map((c) => c.userId)));
        if (roles.some((r) => r.role === target.role)) {
          throw new HttpError(422, "Your linked accounts already include an account with this role.", "SAME_ROLE");
        }
      }
      await tx.insert(linkedAccounts).values([
        ...(existing ? [] : [{ groupId, userId: caller.id, linkedByUserId: caller.id, linkMethod: "otp", otpVerifiedAt: now }]),
        { groupId, userId: target.id, linkedByUserId: caller.id, linkMethod: "otp", otpVerifiedAt: now },
      ]);
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, MSG.limit, "LINK_LIMIT");
    }
    throw err;
  }

  // The new account is linked to everyone already in the group.
  const others = (await groupMembers(caller)).filter((m) => m.id !== target.id);
  for (const other of others) {
    for (const [self, peer] of [
      [other, target],
      [target, other],
    ] as const) {
      await insertAuditLog({
        userId: self.id,
        action: "linked_accounts.linked",
        entityType: "user",
        entityId: peer.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { groupId, otherUid: peer.uid, linkedBy: caller.uid, method: "otp" },
      });
      notifyAccountLinkChange({ userId: self.id, event: "linked", otherAccountLabel: accountLabel(peer) });
    }
  }

  return listLinkedAccounts(caller.id);
}

async function loadSwitchPair(
  callerId: string,
  targetUserId: string,
): Promise<{ caller: UserRow; target: UserRow; targetLink: LinkRow }> {
  if (targetUserId === callerId) {
    throw new HttpError(422, "You are already using this account.", "ALREADY_CURRENT");
  }
  const caller = await loadActiveAgent(callerId);
  const [callerLink, targetLink] = await Promise.all([findLink(callerId), findLink(targetUserId)]);
  if (!callerLink || !targetLink || callerLink.groupId !== targetLink.groupId) {
    throw new HttpError(404, MSG.notLinked, "NOT_LINKED");
  }
  const target = await loadUser(targetUserId);
  if (!target) throw new HttpError(404, MSG.notLinked, "NOT_LINKED");

  // Switch is a login into the target — same gates, re-checked every time.
  if (!target.isActive) {
    throw new HttpError(403, "The linked account is inactive. Contact support.", "ACCOUNT_INACTIVE");
  }
  if (!isAgentPortalRole(target.role)) throw new HttpError(404, MSG.notLinked, "NOT_LINKED");
  if (!hasVerifiedKyc(target) || !hasVerifiedKyc(caller)) {
    throw new HttpError(
      409,
      "KYC on one of the linked accounts is no longer verified. Complete KYC before switching.",
      "LINK_NEEDS_REVIEW",
    );
  }
  if (!isSamePerson(caller, target)) {
    throw new HttpError(
      409,
      "The PAN / Aadhaar on the linked accounts no longer match. Contact support.",
      "LINK_NEEDS_REVIEW",
    );
  }
  return { caller, target, targetLink };
}

export async function requestSwitchOtp(
  callerId: string,
  input: SwitchOtpInput,
  context: AuthContext,
): Promise<{ message: string; expiresInSeconds: number; mobileMasked: string; otp?: string }> {
  const { caller, target, targetLink } = await loadSwitchPair(callerId, input.targetUserId);
  const locked = switchLockedUntil(targetLink);
  if (locked) throw new HttpError(429, lockMessage(locked), "SWITCH_LOCKED");
  return sendLinkOtp(caller, target, "switch", context);
}

export async function switchAccount(
  callerId: string,
  input: SwitchInput,
  context: AuthContext,
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string; otpVerified: boolean }> {
  const { caller, target, targetLink } = await loadSwitchPair(callerId, input.targetUserId);

  const locked = switchLockedUntil(targetLink);
  if (locked) throw new HttpError(429, lockMessage(locked), "SWITCH_LOCKED");

  let otpRecord: ActiveOtpRecord | null = null;
  if (needsSwitchOtp(targetLink)) {
    if (!input.otp) throw new HttpError(422, MSG.otpEvery24h, "SWITCH_OTP_REQUIRED");
    otpRecord = await checkLinkOtp(target.mobile, caller.id, "switch", input.otp);
  }

  if (!target.loginMpinHash) {
    throw new HttpError(
      409,
      "MPIN is not set on the linked account. Log in to it once and set an MPIN.",
      "MPIN_NOT_SET",
    );
  }

  if (!(await comparePassword(input.mpin, target.loginMpinHash))) {
    const [updated] = await db
      .update(linkedAccounts)
      .set({ switchFailedAttempts: sql`${linkedAccounts.switchFailedAttempts} + 1` })
      .where(eq(linkedAccounts.id, targetLink.id))
      .returning({ attempts: linkedAccounts.switchFailedAttempts });
    const attempts = updated?.attempts ?? MAX_SWITCH_MPIN_ATTEMPTS;
    const lockNow = attempts >= MAX_SWITCH_MPIN_ATTEMPTS;
    const lockUntil = new Date(Date.now() + SWITCH_LOCK_MS);
    if (lockNow) {
      await db
        .update(linkedAccounts)
        .set({ switchFailedAttempts: 0, switchLockedUntil: lockUntil })
        .where(eq(linkedAccounts.id, targetLink.id));
    }
    await insertAuditLog({
      userId: caller.id,
      action: "linked_accounts.switch_failed",
      entityType: "user",
      entityId: target.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { reason: "mpin_incorrect", attempts, locked: lockNow },
    });
    if (lockNow) throw new HttpError(429, lockMessage(lockUntil), "SWITCH_LOCKED");
    const left = MAX_SWITCH_MPIN_ATTEMPTS - attempts;
    throw new HttpError(
      422,
      `Incorrect MPIN. ${left} attempt${left === 1 ? "" : "s"} left before switching is locked for 30 minutes.`,
      "MPIN_INCORRECT",
    );
  }

  await ensurePolicyAccepted(target, input, context, "switch");

  if (otpRecord) await markOtpConsumed(otpRecord.id);
  await db
    .update(linkedAccounts)
    .set({
      switchFailedAttempts: 0,
      switchLockedUntil: null,
      ...(otpRecord ? { otpVerifiedAt: new Date() } : {}),
    })
    .where(eq(linkedAccounts.id, targetLink.id));

  if (input.refreshToken) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, caller.id),
          eq(refreshTokens.tokenHash, hashToken(input.refreshToken)),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }

  if (input.deviceId) {
    await trustDevice({ userId: target.id, deviceId: input.deviceId, label: input.deviceLabel });
  }

  const session = await issueSession(target, context, "switch");

  await insertAuditLog({
    userId: caller.id,
    action: "linked_accounts.switch",
    entityType: "user",
    entityId: target.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { fromUid: caller.uid, toUid: target.uid, otpVerified: Boolean(otpRecord) },
  });

  return { ...session, otpVerified: Boolean(otpRecord) };
}

/** Admin agent page: every account in this agent's linked group (read-only, no PAN / Aadhaar). */
export async function listLinkedAccountsForAdmin(userId: string) {
  const link = await findLink(userId);
  if (!link) return { linked: false, accounts: [] as const, maxLinked: MAX_LINKED_ACCOUNTS };
  const group = await loadGroup(link.groupId);
  const rows = await db
    .select({ id: users.id, uid: users.uid, name: users.name, role: users.role, isActive: users.isActive, kycStatus: users.kycStatus })
    .from(users)
    .where(inArray(users.id, group.map((g) => g.userId)));
  const order = ["super_distributor", "distributor", "retailer"];
  return {
    linked: true,
    maxLinked: MAX_LINKED_ACCOUNTS,
    accounts: rows
      .map((r) => ({
        userId: r.id,
        uid: r.uid,
        name: r.name,
        role: r.role,
        roleLabel: ROLE_LABELS[r.role] ?? r.role,
        isActive: r.isActive,
        kycVerified: r.kycStatus === "verified",
        isThis: r.id === userId,
        linkedAt: group.find((g) => g.userId === r.id)?.createdAt.toISOString() ?? null,
      }))
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)),
  };
}

/**
 * `one`: takes `userId` out of the group (the caller itself = leave the group); the rest stay linked.
 * A group left with a single account is removed. `all`: breaks the whole group.
 */
export async function unlinkAccount(
  callerId: string,
  userId: string,
  context: AuthContext,
  scope: UnlinkScope = "one",
): Promise<LinkedAccountsResponse> {
  await loadActiveAgent(callerId);
  const [callerLink, targetLink] = await Promise.all([findLink(callerId), findLink(userId)]);
  if (!callerLink || !targetLink || callerLink.groupId !== targetLink.groupId) {
    throw new HttpError(404, MSG.notLinked, "NOT_LINKED");
  }

  const groupId = callerLink.groupId;
  const group = await loadGroup(groupId);
  const members = await db
    .select()
    .from(users)
    .where(inArray(users.id, group.map((g) => g.userId)));

  const leaving = scope === "all" || group.length <= 2 ? members : members.filter((m) => m.id === userId);
  if (leaving.length === members.length) {
    await db.delete(linkedAccounts).where(eq(linkedAccounts.groupId, groupId));
  } else {
    await db.delete(linkedAccounts).where(and(eq(linkedAccounts.groupId, groupId), eq(linkedAccounts.userId, userId)));
  }

  // Every pair that is no longer linked gets an audit row and an email on both sides.
  const leavingIds = new Set(leaving.map((m) => m.id));
  for (const self of members) {
    const lost = members.filter((m) => m.id !== self.id && (leavingIds.has(self.id) || leavingIds.has(m.id)));
    if (lost.length === 0) continue;
    await insertAuditLog({
      userId: self.id,
      action: "linked_accounts.unlinked",
      entityType: "user",
      entityId: lost[0]?.id ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { groupId, unlinkedBy: callerId, scope, otherUids: lost.map((o) => o.uid) },
    });
    for (const other of lost) {
      notifyAccountLinkChange({ userId: self.id, event: "unlinked", otherAccountLabel: accountLabel(other) });
    }
  }

  return listLinkedAccounts(callerId);
}

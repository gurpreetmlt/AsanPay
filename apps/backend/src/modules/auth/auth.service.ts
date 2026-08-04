import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { eq, and, isNull, like, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { users, userHierarchy, refreshTokens } from "../../db/postgres/schema";
import { provisionWalletsForUser } from "../wallet/wallet.service";
import { hashPassword, comparePassword } from "../../utils/password";
import { encryptPII } from "../../utils/aes";
import { generateUid, hashToken } from "../../utils/uid";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import { HttpError } from "../../utils/httpError";
import { env, shouldExposeOtpInResponse, getTestOtpOverride, getTestSignupOtpOverride } from "../../config/env";
import { logger } from "../../utils/logger";
import { assertStrongPin } from "../../utils/weakPin";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import {
  MAX_OTP_ATTEMPTS,
  findLatestActiveOtp,
  incrementOtpAttempts,
  insertOtpRequest,
  markOtpConsumed,
} from "../../db/postgres/repositories/otpRequest";
import {
  MAX_DEVICE_MPIN_ATTEMPTS,
  findDevice,
  incrementDeviceFailedAttempts,
  listDevicesForUser,
  revokeAllDevicesForUser,
  revokeDevice,
  touchDeviceAuth,
  trustDevice,
  type DeviceRow,
} from "../../db/postgres/repositories/device";
import {
  notifyMpinChanged,
  notifyNewDeviceLogin,
} from "../notifications/userEmail.service";
import type { AuthPortal, AuthUser, UserRole } from "@asanpay/shared-types";
import { isAdminRole, isAgentPortalRole } from "@asanpay/shared-types";
import type {
  RegisterInput,
  LoginInput,
  OtpRequestInput,
  OtpVerifyInput,
  MpinLoginInput,
  SetLoginMpinInput,
  SignupRequestInput,
  SignupVerifyInput,
  SignupCompleteInput,
  SignupChildRole,
  SponsorSearchRole,
} from "./auth.validators";

/** Public signup: child role → required sponsor (parent) role. */
const SIGNUP_SPONSOR_ROLE: Record<"super_distributor" | "distributor" | "retailer", SponsorSearchRole> = {
  super_distributor: "admin",
  distributor: "super_distributor",
  retailer: "distributor",
};

// Who is allowed to onboard whom — one level down the hierarchy at a time.
const ALLOWED_CHILD_ROLES: Record<UserRole, UserRole[]> = {
  admin: ["super_distributor", "retailer"],
  super_distributor: ["distributor"],
  distributor: ["retailer"],
  retailer: [],
};

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // keep in sync with JWT_REFRESH_EXPIRES_IN

// Rolling trust window: MPIN-only login is allowed as long as this device authenticated
// (via OTP or MPIN) within the last N hours. Deliberately NOT a calendar-day/midnight cutoff —
// a login at 11:58pm followed by one at 12:02am is 4 minutes apart, not "a new day" — so this
// rolls forward from the device's own last activity instead of the clock. 12h covers a
// retailer's working shift; money movement is separately gated by the txn PIN / biometric on
// every transaction, so this only controls convenience of app access, not funds.
const DEVICE_TRUST_WINDOW_MS = 12 * 60 * 60 * 1000;

function otpHashesEqual(storedHash: string, candidateOtp: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(candidateOtp), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    uid: row.uid,
    role: row.role,
    name: row.name,
    mobile: row.mobile,
    email: row.email ?? null,
    emailVerifiedAt: row.emailVerifiedAt ? row.emailVerifiedAt.toISOString() : null,
    emailMarketingOptIn: Boolean(row.emailMarketingOptIn),
    parentId: row.parentId,
    kycStatus: row.kycStatus,
    isActive: row.isActive,
    hasKycDocs: Boolean(row.panNumberEncrypted && row.aadhaarNumberEncrypted),
    hasInstantpayOutlet: Boolean(row.instantpayOutletId),
    hasTxnPin: Boolean(row.txnPinHash),
    hasLoginMpin: Boolean(row.loginMpinHash),
  };
}

export async function getAuthMe(userId: string): Promise<AuthUser> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row || !row.isActive) throw new HttpError(401, "Account is inactive", "ACCOUNT_INACTIVE");
  return toAuthUser(row);
}

export async function registerUser(
  actor: { id: string; role: UserRole },
  input: RegisterInput,
  opts?: { isActive?: boolean },
): Promise<AuthUser> {
  const allowed = ALLOWED_CHILD_ROLES[actor.role] ?? [];
  if (!allowed.includes(input.role)) {
    throw new HttpError(
      403,
      `A ${actor.role.replace(/_/g, " ")} cannot onboard a ${input.role.replace(/_/g, " ")}`,
      "INVALID_HIERARCHY",
    );
  }

  const [existingMobile] = await db.select({ id: users.id }).from(users).where(eq(users.mobile, input.mobile));
  if (existingMobile) throw new HttpError(409, "Mobile number is already registered", "MOBILE_TAKEN");

  if (input.email) {
    const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existingEmail) throw new HttpError(409, "Email is already registered", "EMAIL_TAKEN");
  }

  const passwordHash = await hashPassword(input.password);
  const uid = generateUid(input.role);

  const newUser = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        uid,
        parentId: actor.id,
        role: input.role,
        name: input.name,
        mobile: input.mobile,
        email: input.email,
        passwordHash,
        isActive: opts?.isActive ?? true,
        panNumberEncrypted: input.panNumber ? encryptPII(input.panNumber) : null,
        aadhaarNumberEncrypted: input.aadhaarNumber ? encryptPII(input.aadhaarNumber) : null,
      })
      .returning();

    if (!created) throw new HttpError(500, "Failed to create user");

    // Self row + one row per ancestor of the actor, depth incremented by one.
    await tx.insert(userHierarchy).values({ ancestorId: created.id, descendantId: created.id, depth: 0 });

    const actorAncestors = await tx
      .select({ ancestorId: userHierarchy.ancestorId, depth: userHierarchy.depth })
      .from(userHierarchy)
      .where(eq(userHierarchy.descendantId, actor.id));

    if (actorAncestors.length > 0) {
      await tx.insert(userHierarchy).values(
        actorAncestors.map((row) => ({
          ancestorId: row.ancestorId,
          descendantId: created.id,
          depth: row.depth + 1,
        })),
      );
    }

    await provisionWalletsForUser(tx, created.id, created.role);

    return created;
  });

  await insertAuditLog({
    userId: actor.id,
    action: "auth.register",
    entityType: "user",
    entityId: newUser.id,
    metadata: { role: newUser.role, uid: newUser.uid },
  });

  return toAuthUser(newUser);
}

type AuthContext = { ipAddress: string | null; userAgent: string | null };

function assertPortalAccess(role: UserRole, portal: AuthPortal): void {
  if (portal === "admin") {
    if (!isAdminRole(role)) {
      throw new HttpError(
        403,
        "This account cannot access the admin portal. Use the AsanPay agent app or web.",
        "WRONG_PORTAL",
      );
    }
    return;
  }

  if (!isAgentPortalRole(role)) {
    throw new HttpError(
      403,
      "Admin accounts must use the admin portal.",
      "WRONG_PORTAL",
    );
  }
}

// Shared by password login and OTP login — both end with the same result: a fresh
// access/refresh token pair and an audit trail entry, just reached via a different factor.
async function issueSession(
  row: typeof users.$inferSelect,
  context: AuthContext,
  method: "password" | "otp" | "mpin",
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ id: row.id, uid: row.uid, role: row.role });
  const { token: refreshToken } = signRefreshToken(row.id);

  await db.insert(refreshTokens).values({
    userId: row.id,
    tokenHash: hashToken(refreshToken),
    deviceInfo: context.userAgent,
    ipAddress: context.ipAddress,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  await insertAuditLog({
    userId: row.id,
    action: "auth.login",
    entityType: "user",
    entityId: row.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { method },
  });

  return { user: toAuthUser(row), accessToken, refreshToken };
}

async function findRootAdmin() {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.parentId)))
    .limit(1);
  return row ?? null;
}

/** Dev-only: unlock admin when SEED_ADMIN_PASSWORD is set in env (no hardcoded fallback). */
async function ensureDevAdminCredentials(
  candidatePassword: string,
): Promise<typeof users.$inferSelect | null> {
  if (env.NODE_ENV === "production") return null;
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  const seedMobile = process.env.SEED_ADMIN_MOBILE ?? "9999999999";
  if (!seedPassword || seedPassword.length < 12) return null;
  if (candidatePassword !== seedPassword) return null;

  const passwordHash = await hashPassword(seedPassword);
  const row = await findRootAdmin();

  if (row) {
    await db
      .update(users)
      .set({
        passwordHash,
        name: "AsanPay Admin",
        isActive: true,
        kycStatus: "verified",
      })
      .where(eq(users.id, row.id));
    logger.info({ userId: row.id }, "[DEV] Admin password synced from SEED_ADMIN_PASSWORD");
    return { ...row, passwordHash, name: "AsanPay Admin", isActive: true, kycStatus: "verified" };
  }

  const uid = generateUid("admin");
  const created = await db.transaction(async (tx) => {
    const [admin] = await tx
      .insert(users)
      .values({
        uid,
        parentId: null,
        role: "admin",
        name: "AsanPay Admin",
        mobile: seedMobile,
        passwordHash,
        kycStatus: "verified",
      })
      .returning();
    if (!admin) throw new Error("Failed to create admin");
    await tx.insert(userHierarchy).values({ ancestorId: admin.id, descendantId: admin.id, depth: 0 });
    await provisionWalletsForUser(tx, admin.id, admin.role, { isRootAdmin: true });
    return admin;
  });

  logger.info({ uid: created.uid }, "[DEV] Root admin created from SEED_ADMIN_PASSWORD");
  return created;
}

export async function loginUser(
  input: LoginInput,
  context: AuthContext,
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  if (input.portal === "admin") {
    // Fixed username only — never accept mobile/OTP for admin portal.
    const id = (input.username ?? input.mobile ?? "").trim().toLowerCase();
    if (id !== "admin") {
      throw new HttpError(401, "Invalid username or password", "INVALID_CREDENTIALS");
    }
    let row = await findRootAdmin();

    let passwordMatches = row ? await comparePassword(input.password, row.passwordHash) : false;
    if (!passwordMatches) {
      const synced = await ensureDevAdminCredentials(input.password);
      if (synced) {
        row = synced;
        passwordMatches = true;
      }
    }

    if (!row || !passwordMatches || !row.isActive) {
      await insertAuditLog({
        userId: row?.id ?? null,
        action: "auth.login_failed",
        entityType: "user",
        entityId: row?.id ?? null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { method: "password", portal: input.portal },
      });
      throw new HttpError(401, "Invalid username or password", "INVALID_CREDENTIALS");
    }

    assertPortalAccess(row.role, input.portal);
    return issueSession(row, context, "password");
  }

  const [found] = await db.select().from(users).where(eq(users.mobile, input.mobile!));
  const row = found ?? null;

  const passwordMatches = row ? await comparePassword(input.password, row.passwordHash) : false;

  if (!row || !passwordMatches || !row.isActive) {
    await insertAuditLog({
      userId: row?.id ?? null,
      action: "auth.login_failed",
      entityType: "user",
      entityId: row?.id ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { method: "password", portal: input.portal },
    });
    throw new HttpError(401, "Invalid mobile number or password", "INVALID_CREDENTIALS");
  }

  assertPortalAccess(row.role, input.portal);

  // Password login on a known browser should establish the same device trust as OTP,
  // otherwise Welcome-back MPIN always fails until the user does OTP once.
  if (input.deviceId && isAgentPortalRole(row.role)) {
    const prior = await findDevice(row.id, input.deviceId);
    const isNewDevice = !prior || Boolean(prior.revokedAt);
    await trustDevice({
      userId: row.id,
      deviceId: input.deviceId,
      label: input.deviceLabel,
    });
    if (isNewDevice) {
      notifyNewDeviceLogin({
        userId: row.id,
        deviceLabel: input.deviceLabel ?? "Web / app",
        ipAddress: context.ipAddress,
      });
    }
  }

  return issueSession(row, context, "password");
}

/** Signup can span KYC steps on mobile — keep OTP valid long enough. Login OTP uses the same window. */
const OTP_TTL_MS = 15 * 60 * 1000;

// No SMS provider is wired yet (that's a provider-wrapper integration, same shape as the
// Eko/Paysprint slots already modeled in the service catalog) — in dev we log + echo the OTP
// back in the response so the flow is fully testable end-to-end, for ANY mobile number (same as
// typical fintech dev OTP — no real SMS goes out).
// In production the `otp` field is omitted and generation is gated to registered numbers only,
// so the endpoint can't be used to enumerate which numbers have accounts.
function assertExpectedLoginRole(accountRole: UserRole, expected?: UserRole) {
  if (!expected) return;
  if (accountRole === expected) return;
  // Generic message — do not name the real role (enumeration oracle).
  throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
}

const GENERIC_OTP_SENT = {
  message: "If this number is registered, an OTP has been sent",
  expiresInSeconds: (5 * 60 * 1000) / 1000,
};

export async function requestLoginOtp(
  input: OtpRequestInput,
  context: AuthContext,
): Promise<{ message: string; otp?: string; expiresInSeconds: number }> {
  if (input.portal === "admin") {
    // Same shape as success — no admin-OTP oracle.
    return { ...GENERIC_OTP_SENT };
  }

  const [row] = await db
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.mobile, input.mobile));

  // Admin / inactive / role mismatch: silent generic response (no OTP, no leak).
  if (!row || !row.isActive || isAdminRole(row.role)) {
    return { ...GENERIC_OTP_SENT };
  }
  if (input.role && row.role !== input.role) {
    return { ...GENERIC_OTP_SENT };
  }

  const exposeOtp = shouldExposeOtpInResponse();
  // Whitelisted test numbers get a fixed OTP (no SMS provider yet); everyone else random.
  const otp = getTestOtpOverride(input.mobile) ?? randomInt(100000, 1000000).toString();

  await insertOtpRequest({
    mobile: input.mobile,
    otpHash: hashToken(otp),
    purpose: "login",
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  await insertAuditLog({
    userId: row.id,
    action: "auth.otp_requested",
    entityType: "user",
    entityId: row.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: input.role ? { expectedRole: input.role } : undefined,
  });

  if (exposeOtp) {
    logger.info({ mobile: input.mobile, registered: true, role: input.role }, "[OTP] generated (value not logged)");
  }

  return {
    ...GENERIC_OTP_SENT,
    ...(exposeOtp ? { otp } : {}),
  };
}

export async function verifyLoginOtp(
  input: OtpVerifyInput,
  context: AuthContext,
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  if (input.portal === "admin") {
    throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const record = await findLatestActiveOtp({ mobile: input.mobile, purpose: "login" });

  if (!record) {
    throw new HttpError(
      401,
      "OTP has expired or was not requested. Please request a new OTP.",
      "OTP_EXPIRED",
    );
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(401, "Too many incorrect attempts — request a new OTP", "OTP_LOCKED");
  }

  if (!otpHashesEqual(record.otpHash, input.otp)) {
    await incrementOtpAttempts(record.id);
    throw new HttpError(401, "Incorrect OTP", "OTP_INCORRECT");
  }

  const [row] = await db.select().from(users).where(eq(users.mobile, input.mobile));
  if (!row || !row.isActive || isAdminRole(row.role)) {
    throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  assertPortalAccess(row.role, input.portal);
  if (input.role) {
    assertExpectedLoginRole(row.role, input.role);
  }

  await markOtpConsumed(record.id);

  // deviceId is optional here (older/unwired clients still get a normal OTP login) — trust is
  // simply not established for those, so they'll be asked for OTP again next time too.
  if (input.deviceId) {
    const prior = await findDevice(row.id, input.deviceId);
    const isNewDevice = !prior || Boolean(prior.revokedAt);
    const device = await trustDevice({ userId: row.id, deviceId: input.deviceId, label: input.deviceLabel });
    await insertAuditLog({
      userId: row.id,
      action: "auth.device_trusted",
      entityType: "device",
      entityId: device.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { deviceId: input.deviceId, label: input.deviceLabel ?? null, isNewDevice },
    });
    if (isNewDevice) {
      notifyNewDeviceLogin({
        userId: row.id,
        deviceLabel: input.deviceLabel ?? "Web / app",
        ipAddress: context.ipAddress,
      });
    }
    logger.info(
      { userId: row.id, deviceId: input.deviceId, label: input.deviceLabel, isNewDevice },
      "[DEVICE TRUSTED]",
    );
  }

  return issueSession(row, context, "otp");
}

export async function loginWithMpin(
  input: MpinLoginInput,
  context: AuthContext,
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  if (input.portal === "admin") {
    throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const [row] = await db.select().from(users).where(eq(users.mobile, input.mobile));
  if (!row || !row.isActive || isAdminRole(row.role)) {
    throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  assertPortalAccess(row.role, input.portal);
  if (input.role) {
    assertExpectedLoginRole(row.role, input.role);
  }

  if (!row.loginMpinHash) {
    throw new HttpError(
      409,
      "MPIN is not set yet. Login with OTP or password once, then set your MPIN from Account.",
      "MPIN_NOT_SET",
    );
  }

  // Device trust gate: MPIN-only login is only allowed within the rolling trust window.
  // Stale / missing / revoked device → client must force OTP or password (not "wrong MPIN").
  // Always evaluate trust BEFORE comparing MPIN so expiry never surfaces as MPIN_INCORRECT.
  const device = await findDevice(row.id, input.deviceId);
  const lastAuthMs = device ? new Date(device.lastAuthAt).getTime() : NaN;
  const isFresh =
    Boolean(device) &&
    !device!.revokedAt &&
    Number.isFinite(lastAuthMs) &&
    Date.now() - lastAuthMs < DEVICE_TRUST_WINDOW_MS;
  if (!device || !isFresh) {
    // Logged unconditionally (even "no device row at all") so a client sending an unexpected
    // deviceId — e.g. a mobile storage race regenerating it after a genuinely-trusted login —
    // is visible in the audit trail instead of showing up as an unexplained gap between logins.
    await insertAuditLog({
      userId: row.id,
      action: "auth.device_not_trusted",
      entityType: "user",
      entityId: row.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        deviceId: input.deviceId,
        knownDevice: Boolean(device),
        revoked: device ? Boolean(device.revokedAt) : null,
        msSinceLastAuth: device ? Date.now() - lastAuthMs : null,
      },
    });
    throw new HttpError(
      401,
      "Session expired. Login again with OTP or password, then MPIN will work on this device.",
      "DEVICE_NOT_TRUSTED",
    );
  }

  const ok = await comparePassword(input.mpin, row.loginMpinHash);
  if (!ok) {
    const attempts = await incrementDeviceFailedAttempts(device.id);
    if (attempts >= MAX_DEVICE_MPIN_ATTEMPTS) {
      await revokeDevice(device.id);
    }
    await insertAuditLog({
      userId: row.id,
      action: "auth.mpin_failed",
      entityType: "user",
      entityId: row.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { deviceId: input.deviceId, attempts, revoked: attempts >= MAX_DEVICE_MPIN_ATTEMPTS },
    });
    throw new HttpError(401, "Incorrect MPIN", "MPIN_INCORRECT");
  }

  await touchDeviceAuth(device.id);
  return issueSession(row, context, "mpin");
}

export interface DeviceSummary {
  id: string;
  label: string | null;
  trustedAt: Date;
  lastAuthAt: Date;
}

export async function listUserDevices(userId: string): Promise<DeviceSummary[]> {
  const rows = await listDevicesForUser(userId);
  return rows.map((row: DeviceRow) => ({
    id: row.id,
    label: row.label,
    trustedAt: row.trustedAt,
    lastAuthAt: row.lastAuthAt,
  }));
}

export async function revokeUserDevice(userId: string, id: string): Promise<void> {
  const rows = await listDevicesForUser(userId);
  const owned = rows.find((row: DeviceRow) => row.id === id);
  if (!owned) throw new HttpError(404, "Device not found", "DEVICE_NOT_FOUND");
  await revokeDevice(id);
  await insertAuditLog({
    userId,
    action: "auth.device_revoked",
    entityType: "device",
    entityId: id,
    ipAddress: null,
    userAgent: null,
    metadata: { manual: true },
  });
}

export async function setLoginMpin(
  userId: string,
  input: SetLoginMpinInput,
): Promise<AuthUser> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row || !row.isActive) {
    throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  }

  if (row.loginMpinHash) {
    if (!input.currentMpin) {
      throw new HttpError(422, "Current MPIN is required to change it", "CURRENT_MPIN_REQUIRED");
    }
    const ok = await comparePassword(input.currentMpin, row.loginMpinHash);
    if (!ok) {
      throw new HttpError(401, "Current MPIN is incorrect", "MPIN_INCORRECT");
    }
  }

  assertStrongPin(input.mpin, "MPIN");

  const isChange = Boolean(row.loginMpinHash);
  const loginMpinHash = await hashPassword(input.mpin);
  // Kept in sync with txnPinHash — same single PIN serves both purposes (see txnPin.ts setTxnPin).
  await db
    .update(users)
    .set({ loginMpinHash, txnPinHash: loginMpinHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Step-up: changing an existing MPIN revokes every trusted device, this one included — the
  // next login anywhere requires OTP again. (First-time set is exempt: it normally happens
  // right after an OTP login in the same session, so there's nothing suspicious to step up for.)
  if (isChange) {
    await revokeAllDevicesForUser(userId);
  }

  await insertAuditLog({
    userId,
    action: "auth.mpin_set",
    entityType: "user",
    entityId: userId,
    ipAddress: null,
    userAgent: null,
    metadata: { firstSet: !isChange },
  });

  if (isChange) {
    notifyMpinChanged(userId);
  }

  return getAuthMe(userId);
}

export async function setEmailMarketingOptIn(
  userId: string,
  emailMarketingOptIn: boolean,
): Promise<AuthUser> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row || !row.isActive) {
    throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  }
  await db
    .update(users)
    .set({ emailMarketingOptIn, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return getAuthMe(userId);
}

export async function refreshSession(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
  }

  const tokenHash = hashToken(refreshToken);

  // Two browser requests can each read the SAME (still-valid-at-dispatch) refresh cookie and
  // both hit this endpoint moments apart — e.g. a dashboard firing several API calls in
  // parallel, or a backgrounded/throttled tab finally sending a long-queued request against an
  // already-rotated cookie. Auth0/Supabase-style "reuse detected → revoke every device" is far
  // too destructive here: it turns one stale request into a full account-wide logout. Instead:
  // a short grace window after rotation silently re-issues an access token (no error at all —
  // covers the millisecond race); past that window, we DENY just this one request (its own
  // token stays revoked) without touching any other session. A genuinely stolen token still
  // can't get anywhere — it just doesn't get to nuke every trusted device along the way.
  const REUSE_GRACE_MS = 10_000;

  return await db.transaction(async (tx) => {
      const [stored] = await tx
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.userId, payload.sub), eq(refreshTokens.tokenHash, tokenHash)))
        .for("update");

      if (!stored) {
        throw new HttpError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
      }

      if (stored.revokedAt) {
        const msSinceRevoked = Date.now() - stored.revokedAt.getTime();
        if (msSinceRevoked < REUSE_GRACE_MS) {
          const [user] = await tx.select().from(users).where(eq(users.id, payload.sub));
          if (!user || !user.isActive) {
            throw new HttpError(401, "Account is inactive", "ACCOUNT_INACTIVE");
          }
          await insertAuditLog({
            userId: payload.sub,
            action: "auth.refresh_grace_period_replay",
            entityType: "user",
            entityId: payload.sub,
            ipAddress: null,
            userAgent: null,
            metadata: { tokenHash, msSinceRevoked, deviceInfo: stored.deviceInfo },
          });
          // Don't rotate again — the token stays revoked exactly as it already was. Just hand
          // this request a fresh access token so it doesn't fail outright.
          const newAccessToken = signAccessToken({ id: user.id, uid: user.uid, role: user.role });
          return { accessToken: newAccessToken, refreshToken };
        }

        // Past the grace window — deny only this request. Do NOT revoke other devices/sessions;
        // this token is already revoked and stays that way, so replaying it again later hits
        // the same denial. See comment above for why we stopped nuking every device here.
        await insertAuditLog({
          userId: payload.sub,
          action: "auth.stale_refresh_token_denied",
          entityType: "user",
          entityId: payload.sub,
          ipAddress: null,
          userAgent: null,
          metadata: {
            tokenHash,
            msSinceRevoked,
            storedCreatedAt: stored.createdAt,
            storedRevokedAt: stored.revokedAt,
            deviceInfo: stored.deviceInfo,
          },
        });
        throw new HttpError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
      }

      if (stored.expiresAt.getTime() <= Date.now()) {
        // Naturally expired (30d TTL) — not suspicious, just stale. No device-wide revoke.
        throw new HttpError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
      }

      const [user] = await tx.select().from(users).where(eq(users.id, payload.sub));
      if (!user || !user.isActive) {
        throw new HttpError(401, "Account is inactive", "ACCOUNT_INACTIVE");
      }

      const newAccessToken = signAccessToken({ id: user.id, uid: user.uid, role: user.role });
      const { token: newRefreshToken } = signRefreshToken(user.id);

      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));
      await tx.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(newRefreshToken),
        deviceInfo: stored.deviceInfo,
        ipAddress: stored.ipAddress,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      });

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  });
}

/** Revoke every refresh token for the user (logout).
 * Device trust is intentionally kept — Welcome-back MPIN should still work within the
 * rolling trust window (DEVICE_TRUST_WINDOW_MS) after logout. Devices are revoked only via Account → Trusted devices,
 * MPIN change, failed-MPIN lockout, or refresh-token reuse. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function logoutUser(opts: {
  userId?: string | null;
  refreshToken?: string | null;
}): Promise<void> {
  let userId = opts.userId ?? null;

  if (!userId && opts.refreshToken) {
    const tokenHash = hashToken(opts.refreshToken);
    const [stored] = await db
      .select({ userId: refreshTokens.userId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (stored) {
      userId = stored.userId;
    } else {
      try {
        const payload = verifyRefreshToken(opts.refreshToken);
        userId = payload.sub;
      } catch {
        /* ignore — always succeed logout */
      }
    }
  }

  if (userId) {
    await revokeAllSessionsForUser(userId);
  }
}

/** Public lookup: active upline by UID — name only (for signup confirmation). */
export async function lookupSponsorByUid(uidRaw: string): Promise<{
  uid: string;
  name: string;
  mobile: string;
  role: SponsorSearchRole;
}> {
  const uid = uidRaw.trim().toUpperCase();
  const [sponsor] = await db
    .select({
      uid: users.uid,
      name: users.name,
      mobile: users.mobile,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.uid, uid))
    .limit(1);

  const allowed: ReadonlySet<string> = new Set(["admin", "super_distributor", "distributor"]);
  if (!sponsor || !sponsor.isActive || !allowed.has(sponsor.role)) {
    throw new HttpError(404, "Upline not found", "SPONSOR_NOT_FOUND");
  }

  return {
    uid: sponsor.uid,
    name: sponsor.name,
    mobile: sponsor.mobile,
    role: sponsor.role as SponsorSearchRole,
  };
}

/** Public search: active upline by mobile prefix + expected parent role. */
export async function searchSponsorsByMobile(
  mobileRaw: string,
  sponsorRole: SponsorSearchRole,
): Promise<Array<{ uid: string; name: string; mobile: string; role: SponsorSearchRole }>> {
  const mobile = mobileRaw.replace(/\D/g, "").slice(0, 10);
  if (mobile.length < 3) {
    throw new HttpError(422, "Enter at least 3 digits", "INVALID_MOBILE");
  }

  const rows = await db
    .select({
      uid: users.uid,
      name: users.name,
      mobile: users.mobile,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        // Match last-10 digits even if stored with country code / spaces.
        sql`regexp_replace(${users.mobile}, '[^0-9]', '', 'g') like ${"%" + mobile}`,
        eq(users.role, sponsorRole),
        eq(users.isActive, true),
      ),
    )
    .limit(15);

  return rows.map((r) => ({
    uid: r.uid,
    name: r.name,
    mobile: r.mobile.replace(/\D/g, "").slice(-10),
    role: r.role as SponsorSearchRole,
  }));
}

/** Live check while typing — is this mobile free for signup? */
export async function checkSignupMobileAvailable(
  mobile: string,
): Promise<{ available: true } | { available: false; message: string; code: "MOBILE_TAKEN" }> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.mobile, mobile));
  if (existing) {
    return {
      available: false,
      message: "This mobile number is already registered. Please log in instead.",
      code: "MOBILE_TAKEN",
    };
  }
  return { available: true };
}

/** Live check — email free, or already owned by the current user. */
export async function checkSignupEmailAvailable(
  email: string,
  currentUserId: string,
): Promise<{ available: true } | { available: false; message: string; code: "EMAIL_TAKEN" }> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing && existing.id !== currentUserId) {
    return {
      available: false,
      message: "This email is already registered. Use a different email.",
      code: "EMAIL_TAKEN",
    };
  }
  return { available: true };
}

/** Self-signup step 1: OTP on mobile only (before role / name / upline). */
export async function requestSignupOtp(
  input: SignupRequestInput,
  context: AuthContext,
): Promise<{ message: string; otp?: string; expiresInSeconds: number }> {
  if (input.portal !== "agent") {
    throw new HttpError(400, "Signup is only available on the agent portal", "WRONG_PORTAL");
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.mobile, input.mobile));
  if (existing) {
    throw new HttpError(
      422,
      "This mobile number is already registered. Please log in instead.",
      "MOBILE_TAKEN",
    );
  }

  const otp = getTestSignupOtpOverride(input.mobile) ?? randomInt(100000, 1000000).toString();
  await insertOtpRequest({
    mobile: input.mobile,
    otpHash: hashToken(otp),
    purpose: "signup",
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    meta: {
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });

  await insertAuditLog({
    userId: null,
    action: "auth.signup_otp_requested",
    entityType: "user",
    entityId: null,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      mobile: input.mobile,
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });

  const exposeOtp = shouldExposeOtpInResponse();
  if (exposeOtp) {
    logger.info({ mobile: input.mobile, purpose: "signup" }, "[OTP] generated (value not logged)");
  }

  return {
    message: "OTP sent for signup",
    expiresInSeconds: OTP_TTL_MS / 1000,
    ...(exposeOtp ? { otp } : {}),
  };
}

const SIGNUP_PROOF_TTL_MS = 30 * 60 * 1000;

/** Confirm mobile OTP — returns short-lived signupToken for /signup/complete. */
export async function verifySignupOtp(
  input: SignupVerifyInput,
  context: AuthContext,
): Promise<{ signupToken: string; expiresInSeconds: number; message: string }> {
  if (input.portal !== "agent") {
    throw new HttpError(400, "Signup is only available on the agent portal", "WRONG_PORTAL");
  }

  const record = await findLatestActiveOtp({ mobile: input.mobile, purpose: "signup" });

  if (!record) {
    throw new HttpError(
      401,
      "OTP has expired or was not requested. Please request a new OTP.",
      "OTP_EXPIRED",
    );
  }
  if (record.meta?.signupVerified) {
    throw new HttpError(401, "OTP already verified — continue with role details", "OTP_ALREADY_USED");
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(401, "Too many incorrect attempts — request a new OTP", "OTP_LOCKED");
  }
  if (!otpHashesEqual(record.otpHash, input.otp)) {
    await incrementOtpAttempts(record.id);
    throw new HttpError(401, "Incorrect OTP", "OTP_INCORRECT");
  }

  await markOtpConsumed(record.id);

  const signupToken = randomBytes(32).toString("base64url");
  await insertOtpRequest({
    mobile: input.mobile,
    otpHash: hashToken(signupToken),
    purpose: "signup",
    expiresAt: new Date(Date.now() + SIGNUP_PROOF_TTL_MS),
    meta: {
      signupVerified: true,
      latitude: record.meta?.latitude,
      longitude: record.meta?.longitude,
    },
  });

  await insertAuditLog({
    userId: null,
    action: "auth.signup_otp_verified",
    entityType: "user",
    entityId: null,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { mobile: input.mobile },
  });

  return {
    signupToken,
    expiresInSeconds: SIGNUP_PROOF_TTL_MS / 1000,
    message: "Mobile verified — continue signup",
  };
}

/** After OTP: create account with role / name / password / upline. */
export async function completeSignup(
  input: SignupCompleteInput,
  context: AuthContext,
): Promise<
  | { user: AuthUser; accessToken: string; refreshToken: string; pendingApproval?: false }
  | { pendingApproval: true; user: AuthUser; message: string }
> {
  if (input.portal !== "agent") {
    throw new HttpError(400, "Signup is only available on the agent portal", "WRONG_PORTAL");
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.mobile, input.mobile));
  if (existing) {
    throw new HttpError(
      422,
      "This mobile number is already registered. Please log in instead.",
      "MOBILE_TAKEN",
    );
  }

  const record = await findLatestActiveOtp({ mobile: input.mobile, purpose: "signup" });
  if (!record || !record.meta?.signupVerified) {
    throw new HttpError(
      401,
      "Mobile OTP not verified or expired. Please verify OTP again.",
      "SIGNUP_TOKEN_EXPIRED",
    );
  }
  if (!otpHashesEqual(record.otpHash, input.signupToken)) {
    await incrementOtpAttempts(record.id);
    throw new HttpError(401, "Signup session invalid — verify mobile OTP again", "SIGNUP_TOKEN_INVALID");
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(401, "Too many attempts — verify mobile OTP again", "OTP_LOCKED");
  }

  const isDirectRetailer = input.role === "direct_retailer";
  const isSuperDirect = input.role === "super_distributor";
  const childRole: "super_distributor" | "distributor" | "retailer" = isDirectRetailer
    ? "retailer"
    : (input.role as "super_distributor" | "distributor" | "retailer");
  let sponsorUid: string;

  if (isSuperDirect || isDirectRetailer) {
    const admin = await findRootAdmin();
    if (!admin || !admin.isActive) {
      throw new HttpError(503, "Signup temporarily unavailable", "ADMIN_UNAVAILABLE");
    }
    sponsorUid = admin.uid;
  } else {
    const expectedSponsorRole = SIGNUP_SPONSOR_ROLE[childRole];
    const uid = (input.sponsorUid ?? "").trim().toUpperCase();
    const [sponsorRow] = await db.select().from(users).where(eq(users.uid, uid));
    if (!sponsorRow || !sponsorRow.isActive || sponsorRow.role !== expectedSponsorRole) {
      const uplineLabel =
        expectedSponsorRole === "super_distributor" ? "Super Distributor" : "Distributor";
      throw new HttpError(
        422,
        `${uplineLabel} not found or inactive. Check the upline mobile and try again.`,
        "INVALID_SPONSOR",
      );
    }
    sponsorUid = sponsorRow.uid;
  }

  await markOtpConsumed(record.id);

  const expectedSponsorRole: UserRole =
    isSuperDirect || isDirectRetailer ? "admin" : SIGNUP_SPONSOR_ROLE[childRole];
  const [sponsor] = await db.select().from(users).where(eq(users.uid, sponsorUid));
  if (!sponsor || !sponsor.isActive || sponsor.role !== expectedSponsorRole) {
    throw new HttpError(422, "Invalid sponsor UID", "INVALID_SPONSOR");
  }

  const password =
    input.password ??
    `Lp${randomBytes(9).toString("base64url")}9a`;

  const latitude = input.latitude || String(record.meta?.latitude ?? "");
  const longitude = input.longitude || String(record.meta?.longitude ?? "");
  if (!latitude || !longitude) {
    throw new HttpError(422, "Location is required for signup", "LOCATION_REQUIRED");
  }

  const user = await registerUser(
    { id: sponsor.id, role: sponsor.role },
    {
      name: input.name.trim(),
      mobile: input.mobile,
      password,
      role: childRole,
    },
    isSuperDirect ? { isActive: false } : undefined,
  );

  const [row] = await db
    .update(users)
    .set({
      outletLatitude: latitude,
      outletLongitude: longitude,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();
  if (!row) throw new HttpError(500, "User created but not found");

  await insertAuditLog({
    userId: row.id,
    action: "auth.signup",
    entityType: "user",
    entityId: row.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      sponsorUid,
      method: "otp",
      childRole,
      pendingApproval: isSuperDirect,
      latitude,
      longitude,
    },
  });

  if (isSuperDirect) {
    return {
      pendingApproval: true,
      user: toAuthUser(row),
      message: "Registration submitted. An admin will activate your Super Distributor account.",
    };
  }

  return issueSession(row, context, "otp");
}

import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  otpRequestSchema,
  otpVerifySchema,
  signupRequestSchema,
  signupVerifySchema,
  signupCompleteSchema,
  signupMobileCheckSchema,
  signupEmailCheckSchema,
  sponsorUidParamSchema,
  sponsorMobileQuerySchema,
  mpinLoginSchema,
  setLoginMpinSchema,
  changePasswordSchema,
  setInitialPasswordSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
  preKycProfileSchema,
  preKycMobileOtpSchema,
  preKycMobileConfirmSchema,
  emailVerifyRequestSchema,
  emailVerifyConfirmSchema,
  emailPreferencesSchema,
  aepsFavouriteBanksSchema,
  adminTotpVerifySchema,
  adminTotpEnableSchema,
  adminTotpDisableSchema,
  adminTotpBackupRegenerateSchema,
  loginApprovalIdParamSchema,
  loginApprovalPollSchema,
  loginApprovalDecideSchema,
  qrLoginStartSchema,
  qrLoginScanSchema,
} from "./auth.validators";
import {
  registerUser,
  loginUser,
  refreshSession,
  logoutUser,
  requestLoginOtp,
  verifyLoginOtp,
  loginWithMpin,
  setLoginMpin,
  changePassword,
  setInitialPassword,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  updatePreKycProfile,
  requestPreKycMobileChangeOtp,
  confirmPreKycMobileChange,
  setEmailMarketingOptIn,
  getAepsFavouriteBanks,
  setAepsFavouriteBanks,
  requestSignupOtp,
  verifySignupOtp,
  completeSignup,
  checkSignupMobileAvailable,
  checkSignupEmailAvailable,
  lookupSponsorByUid,
  searchSponsorsByMobile,
  getAuthMe,
  getMyUpline,
  listUserDevices,
  revokeUserDevice,
  verifyAdminTotpLogin,
  getAdminTotpStatus,
  setupAdminTotp,
  enableAdminTotp,
  disableAdminTotp,
  regenerateAdminBackupCodes,
  pollWebLoginApproval,
} from "./auth.service";
import {
  decideLoginApproval,
  listPendingLoginApprovals,
  scanQrLogin,
  startQrLogin,
} from "./loginApproval.service";
import { isAgentPortalRole } from "@asanpay/shared-types";
import { clientIp } from "../../middleware/rateLimiter";
import {
  requestEmailVerifyOtp,
  verifyEmailOtp,
} from "./emailVerify.service";
import { setTxnPin, verifyTxnPinAndIssueAuth } from "./txnPin";
import { getAgentAuthStatus, verifyAndRecordAgentAuth } from "./agentAuth";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { comparePassword } from "../../utils/password";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";

export async function register(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = registerSchema.parse(req.body);
  const user = await registerUser({ id: req.auth.sub, role: req.auth.role }, input);
  sendSuccess(res, user, "User onboarded successfully", 201);
}

/** Browser IP when the request came through the portal proxy (web login approval shows it). */
function browserContext(req: Request): { ipAddress: string | null; userAgent: string | null } {
  const ip = clientIp(req);
  return { ipAddress: ip === "unknown" ? null : ip, userAgent: req.headers["user-agent"] ?? null };
}

const APPROVAL_REQUIRED_MESSAGE = "Approve this login on your AsanPay app";

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const result = await loginUser(input, browserContext(req));
  if ("totpRequired" in result) {
    sendSuccess(res, result, "Enter the 6-digit code from your authenticator app");
    return;
  }
  if ("approvalRequired" in result) {
    sendSuccess(res, result, APPROVAL_REQUIRED_MESSAGE);
    return;
  }
  sendSuccess(res, result, "Logged in successfully");
}

export async function loginApprovalPoll(req: Request, res: Response): Promise<void> {
  const { id } = loginApprovalIdParamSchema.parse(req.params);
  const { pollToken } = loginApprovalPollSchema.parse(req.body ?? {});
  const result = await pollWebLoginApproval(id, pollToken, browserContext(req));
  const message =
    result.status === "approved"
      ? "Logged in successfully"
      : result.status === "pending"
        ? "Waiting for approval on your AsanPay app"
        : result.status === "denied"
          ? "This login was denied on your AsanPay app. If it wasn't you, change your password."
          : "This login request expired after 2 minutes. Sign in again to get a new request.";
  sendSuccess(res, result, message);
}

export async function loginApprovalDecide(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { id } = loginApprovalIdParamSchema.parse(req.params);
  const input = loginApprovalDecideSchema.parse(req.body ?? {});
  const result = await decideLoginApproval(req.auth.sub, id, input, browserContext(req));
  sendSuccess(
    res,
    result,
    result.status === "approved" ? "Web login approved" : "Web login denied. The browser was not signed in.",
  );
}

export async function loginApprovalsPending(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  sendSuccess(res, { approvals: await listPendingLoginApprovals(req.auth.sub) }, "OK");
}

export async function adminTotpVerify(req: Request, res: Response): Promise<void> {
  const input = adminTotpVerifySchema.parse(req.body);
  const result = await verifyAdminTotpLogin(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, "Logged in successfully");
}

export async function adminTotpStatus(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  sendSuccess(res, await getAdminTotpStatus(req.auth.sub), "OK");
}

export async function adminTotpSetup(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const result = await setupAdminTotp(req.auth.sub, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, "Add this key to your authenticator app, then enter the 6-digit code");
}

export async function adminTotpEnable(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = adminTotpEnableSchema.parse(req.body);
  const backupCodes = await enableAdminTotp(req.auth.sub, input.code, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, { ...(await getAdminTotpStatus(req.auth.sub)), backupCodes }, "Two-factor login is on");
}

export async function adminTotpBackupRegenerate(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = adminTotpBackupRegenerateSchema.parse(req.body);
  const backupCodes = await regenerateAdminBackupCodes(req.auth.sub, input.code, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(
    res,
    { ...(await getAdminTotpStatus(req.auth.sub)), backupCodes },
    "New recovery codes created. Old codes no longer work.",
  );
}

export async function adminTotpDisable(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = adminTotpDisableSchema.parse(req.body);
  await disableAdminTotp(req.auth.sub, input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, await getAdminTotpStatus(req.auth.sub), "Two-factor login is off");
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const input = refreshSchema.parse(req.body);
  const result = await refreshSession(input.refreshToken);
  sendSuccess(res, result, "Session refreshed");
}

export async function logout(req: Request, res: Response): Promise<void> {
  const input = z.object({ refreshToken: z.string().min(1).optional() }).parse(req.body ?? {});

  let userId: string | null = null;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const { verifyAccessToken } = await import("../../utils/jwt");
      userId = verifyAccessToken(header.slice("Bearer ".length)).sub;
    } catch {
      /* expired access is fine — refreshToken still kills sessions */
    }
  }

  await logoutUser({
    userId,
    refreshToken: input.refreshToken ?? null,
  });
  sendSuccess(res, null, "Logged out successfully");
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const user = await getAuthMe(req.auth.sub);
  sendSuccess(res, { user }, "OK");
}

export async function myUpline(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const upline = await getMyUpline(req.auth.sub);
  sendSuccess(res, { upline }, "OK");
}

export async function requestOtp(req: Request, res: Response): Promise<void> {
  const input = otpRequestSchema.parse(req.body);
  const result = await requestLoginOtp(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, result.message);
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const input = otpVerifySchema.parse(req.body);
  const result = await verifyLoginOtp(input, browserContext(req));
  sendSuccess(res, result, "approvalRequired" in result ? APPROVAL_REQUIRED_MESSAGE : "Logged in successfully");
}

export async function qrLoginStart(req: Request, res: Response): Promise<void> {
  const input = qrLoginStartSchema.parse(req.body ?? {});
  sendSuccess(res, await startQrLogin(input, browserContext(req)), "Scan this QR with the AsanPay app");
}

export async function qrLoginScan(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  if (!isAgentPortalRole(req.auth.role)) {
    throw new HttpError(403, "Only agent accounts can log in to the agent web with QR.", "WRONG_PORTAL");
  }
  const input = qrLoginScanSchema.parse(req.body ?? {});
  const result = await scanQrLogin(req.auth.sub, input, browserContext(req));
  sendSuccess(res, result, "Check the details, then approve the web login");
}

export async function mpinLogin(req: Request, res: Response): Promise<void> {
  const input = mpinLoginSchema.parse(req.body);
  const result = await loginWithMpin(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, "Logged in successfully");
}

export async function setMpin(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = setLoginMpinSchema.parse(req.body);
  const user = await setLoginMpin(req.auth.sub, input);
  sendSuccess(res, { user }, "Login MPIN set successfully");
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = changePasswordSchema.parse(req.body);
  const user = await changePassword(req.auth.sub, input);
  sendSuccess(res, { user }, "Password changed successfully");
}

export async function setInitialPasswordHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = setInitialPasswordSchema.parse(req.body);
  const user = await setInitialPassword(req.auth.sub, input.newPassword);
  sendSuccess(res, { user }, "Password set. Use it next time you log in.");
}

export async function requestPasswordResetOtpHandler(req: Request, res: Response): Promise<void> {
  const input = forgotPasswordRequestSchema.parse(req.body);
  const result = await requestPasswordResetOtp(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, result.message);
}

export async function resetPasswordWithOtpHandler(req: Request, res: Response): Promise<void> {
  const input = forgotPasswordResetSchema.parse(req.body);
  const result = await resetPasswordWithOtp(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, result.message);
}

export async function updatePreKycProfileHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = preKycProfileSchema.parse(req.body);
  const user = await updatePreKycProfile(req.auth.sub, input);
  sendSuccess(res, { user }, "Name updated");
}

export async function requestPreKycMobileOtpHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = preKycMobileOtpSchema.parse(req.body);
  const result = await requestPreKycMobileChangeOtp(req.auth.sub, input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, result.message);
}

export async function confirmPreKycMobileHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = preKycMobileConfirmSchema.parse(req.body);
  const user = await confirmPreKycMobileChange(req.auth.sub, input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, { user }, "Mobile number updated");
}

export async function requestEmailOtp(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = emailVerifyRequestSchema.parse(req.body);
  const result = await requestEmailVerifyOtp({ userId: req.auth.sub, email: input.email });
  sendSuccess(res, result, result.message);
}

export async function verifyEmailOtpHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = emailVerifyConfirmSchema.parse(req.body);
  const result = await verifyEmailOtp({ userId: req.auth.sub, otp: input.otp });
  sendSuccess(res, result, "Email verified successfully");
}

export async function updateEmailPreferences(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = emailPreferencesSchema.parse(req.body);
  const user = await setEmailMarketingOptIn(req.auth.sub, input.emailMarketingOptIn);
  sendSuccess(res, { user }, "Email preferences updated");
}

export async function getAepsFavouriteBanksHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const result = await getAepsFavouriteBanks(req.auth.sub);
  sendSuccess(res, result, "OK");
}

export async function putAepsFavouriteBanksHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = aepsFavouriteBanksSchema.parse(req.body);
  const result = await setAepsFavouriteBanks(req.auth.sub, input.bankIds);
  sendSuccess(res, result, "Favourite banks updated");
}

export async function listDevices(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const devices = await listUserDevices(req.auth.sub);
  sendSuccess(res, { devices }, "OK");
}

const revokeDeviceParamsSchema = z.object({ id: z.string().uuid() });

export async function revokeDevice(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { id } = revokeDeviceParamsSchema.parse(req.params);
  await revokeUserDevice(req.auth.sub, id);
  sendSuccess(res, null, "Device signed out");
}

export async function lookupSponsor(req: Request, res: Response): Promise<void> {
  const { uid } = sponsorUidParamSchema.parse(req.params);
  const sponsor = await lookupSponsorByUid(uid);
  sendSuccess(res, sponsor);
}

export async function searchSponsors(req: Request, res: Response): Promise<void> {
  const { mobile, role } = sponsorMobileQuerySchema.parse(req.query);
  const items = await searchSponsorsByMobile(mobile, role);
  sendSuccess(res, { items });
}

export async function signupMobileCheck(req: Request, res: Response): Promise<void> {
  const { mobile } = signupMobileCheckSchema.parse(req.query);
  const result = await checkSignupMobileAvailable(mobile);
  sendSuccess(res, result);
}

export async function signupEmailCheck(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { email } = signupEmailCheckSchema.parse(req.query);
  const result = await checkSignupEmailAvailable(email, req.auth.sub);
  sendSuccess(res, result);
}

export async function signupRequest(req: Request, res: Response): Promise<void> {
  const input = signupRequestSchema.parse(req.body);
  const result = await requestSignupOtp(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, result.message);
}

export async function signupVerify(req: Request, res: Response): Promise<void> {
  const input = signupVerifySchema.parse(req.body);
  const result = await verifySignupOtp(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, result.message);
}

export async function signupComplete(req: Request, res: Response): Promise<void> {
  const input = signupCompleteSchema.parse(req.body);
  const result = await completeSignup(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  if ("pendingApproval" in result && result.pendingApproval) {
    sendSuccess(res, result, result.message, 201);
    return;
  }
  sendSuccess(res, result, "Account created successfully", 201);
}

const setTxnPinSchema = z.object({
  /** Required when changing PIN; optional on first set (OTP users may have no known password). */
  password: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.string().min(1).optional(),
  ),
  pin: z.preprocess(
    (v) => String(v ?? "").replace(/\D/g, "").slice(0, 4),
    z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
  ),
});

export async function setTransactionPin(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = setTxnPinSchema.parse(req.body);

  const [user] = await db.select().from(users).where(eq(users.id, req.auth.sub));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  const isFirstSet = !user.txnPinHash;
  if (!isFirstSet && !input.password) {
    throw new HttpError(422, "Password is required to change PIN", "PASSWORD_REQUIRED");
  }
  // OTP/session signup users often have no known login password — first PIN uses auth session.
  const passwordOk = isFirstSet
    ? true
    : await comparePassword(input.password!, user.passwordHash);

  await setTxnPin(req.auth.sub, input.pin, { passwordOk });
  const meUser = await getAuthMe(req.auth.sub);
  sendSuccess(res, { user: meUser }, "Transaction PIN set successfully");
}

const verifyTxnPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export async function verifyTransactionPin(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = verifyTxnPinSchema.parse(req.body);
  const result = await verifyTxnPinAndIssueAuth(req.auth.sub, input.pin);
  sendSuccess(res, result, "Transaction PIN verified");
}

const agentAuthSchema = z.object({
  /** Optional — when omitted, backend uses the retailer's signup KYC Aadhaar. */
  aadhaarNumber: z
    .string()
    .regex(/^\d{12}$/, "Aadhaar number must be 12 digits")
    .optional(),
  biometricPayload: z.string().min(1),
  /** FACE = PID from UIDAI FaceRD (mobile); default fingerprint. */
  captureType: z.enum(["FINGER", "FACE"]).optional(),
  latitude: z.string().min(1).max(32).optional(),
  longitude: z.string().min(1).max(32).optional(),
});

export async function agentAuth(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const input = agentAuthSchema.parse(req.body);
  const result = await verifyAndRecordAgentAuth(
    { id: req.auth.sub },
    {
      aadhaarNumber: input.aadhaarNumber,
      biometricPayload: input.biometricPayload,
      captureType: input.captureType,
      latitude: input.latitude,
      longitude: input.longitude,
      endpointIp: req.ip ?? null,
    },
    { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null },
  );
  sendSuccess(
    res,
    result,
    input.captureType === "FACE" ? "Face verified — session unlocked" : "Fingerprint verified — session unlocked",
  );
}

export async function agentAuthStatus(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  // Screens open with the provider's view of today's 2FA (load_agent daily2faRequired).
  sendSuccess(res, await getAgentAuthStatus(req.auth.sub, { checkProvider: true }));
}

export async function createTelegramLinkHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { createTelegramLinkDeepLink } = await import("../telegram/link.service");
  const result = await createTelegramLinkDeepLink(req.auth.sub);
  sendSuccess(res, result, "Open this link in Telegram to finish linking");
}

export async function unlinkTelegramHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { unlinkTelegram } = await import("../telegram/link.service");
  await unlinkTelegram(req.auth.sub);
  const user = await getAuthMe(req.auth.sub);
  sendSuccess(res, { user }, "Telegram unlinked");
}

export async function telegramStatusHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const { getTelegramLinkStatus } = await import("../telegram/link.service");
  sendSuccess(res, await getTelegramLinkStatus(req.auth.sub));
}

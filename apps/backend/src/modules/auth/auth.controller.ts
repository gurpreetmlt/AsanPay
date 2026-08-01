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
  sponsorUidParamSchema,
  sponsorMobileQuerySchema,
  mpinLoginSchema,
  setLoginMpinSchema,
  emailVerifyRequestSchema,
  emailVerifyConfirmSchema,
  emailPreferencesSchema,
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
  setEmailMarketingOptIn,
  requestSignupOtp,
  verifySignupOtp,
  completeSignup,
  lookupSponsorByUid,
  searchSponsorsByMobile,
  getAuthMe,
  listUserDevices,
  revokeUserDevice,
} from "./auth.service";
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

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const result = await loginUser(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, "Logged in successfully");
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
  const result = await verifyLoginOtp(input, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, "Logged in successfully");
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
  let passwordOk = false;
  if (isFirstSet) {
    // OTP/session signup users often have no known login password — first PIN uses auth session.
    passwordOk = true;
  } else {
    if (!input.password) {
      throw new HttpError(422, "Password is required to change PIN", "PASSWORD_REQUIRED");
    }
    passwordOk = await comparePassword(input.password, user.passwordHash);
  }

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
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Aadhaar number must be 12 digits"),
  biometricPayload: z.string().min(1),
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
      latitude: input.latitude,
      longitude: input.longitude,
      endpointIp: req.ip ?? null,
    },
    { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null },
  );
  sendSuccess(res, result, "Fingerprint verified — session unlocked");
}

export async function agentAuthStatus(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  // InstantPay mode: hit outletLoginStatus so UI knows LOGGEDIN vs LOGINREQUIRED before scanning.
  sendSuccess(res, await getAgentAuthStatus(req.auth.sub, { checkProvider: true, endpointIp: req.ip ?? null }));
}

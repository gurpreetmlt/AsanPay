import { Router } from "express";
import {
  register,
  login,
  refresh,
  logout,
  me,
  myUpline,
  requestOtp,
  verifyOtp,
  mpinLogin,
  setMpin,
  changePasswordHandler,
  setInitialPasswordHandler,
  requestPasswordResetOtpHandler,
  resetPasswordWithOtpHandler,
  updatePreKycProfileHandler,
  requestPreKycMobileOtpHandler,
  confirmPreKycMobileHandler,
  requestEmailOtp,
  verifyEmailOtpHandler,
  updateEmailPreferences,
  getAepsFavouriteBanksHandler,
  putAepsFavouriteBanksHandler,
  listDevices,
  revokeDevice,
  signupRequest,
  signupVerify,
  signupComplete,
  signupMobileCheck,
  signupEmailCheck,
  lookupSponsor,
  searchSponsors,
  setTransactionPin,
  verifyTransactionPin,
  agentAuth,
  agentAuthStatus,
  createTelegramLinkHandler,
  unlinkTelegramHandler,
  telegramStatusHandler,
  adminTotpVerify,
  adminTotpStatus,
  adminTotpSetup,
  adminTotpEnable,
  adminTotpDisable,
  adminTotpBackupRegenerate,
} from "./auth.controller";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { authLimiter, otpRequestLimiter, walletTxnLimiter, signupMobileCheckLimiter } from "../../middleware/rateLimiter";
export const authRouter = Router();

authRouter.post("/register", requireAuth, register);
authRouter.post("/login", authLimiter, login);
authRouter.post("/refresh", authLimiter, refresh);

authRouter.post("/admin/totp/verify", authLimiter, adminTotpVerify);
authRouter.get("/admin/totp/status", requireAuth, requireRole("admin"), adminTotpStatus);
authRouter.post("/admin/totp/setup", requireAuth, requireRole("admin"), authLimiter, adminTotpSetup);
authRouter.post("/admin/totp/enable", requireAuth, requireRole("admin"), authLimiter, adminTotpEnable);
authRouter.post("/admin/totp/disable", requireAuth, requireRole("admin"), authLimiter, adminTotpDisable);
authRouter.post(
  "/admin/totp/backup-codes",
  requireAuth,
  requireRole("admin"),
  authLimiter,
  adminTotpBackupRegenerate,
);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
authRouter.get("/upline", requireAuth, myUpline);

authRouter.post("/otp/request", otpRequestLimiter, requestOtp);
authRouter.post("/otp/verify", authLimiter, verifyOtp);

authRouter.post("/mpin/login", authLimiter, mpinLogin);
authRouter.post("/mpin/set", requireAuth, setMpin);

authRouter.post("/password", requireAuth, authLimiter, changePasswordHandler);
authRouter.post("/password/initial", requireAuth, authLimiter, setInitialPasswordHandler);
authRouter.post("/password/forgot/request", otpRequestLimiter, requestPasswordResetOtpHandler);
authRouter.post("/password/forgot/reset", authLimiter, resetPasswordWithOtpHandler);
authRouter.patch("/profile/pre-kyc", requireAuth, authLimiter, updatePreKycProfileHandler);
authRouter.post("/profile/pre-kyc/mobile/otp", requireAuth, otpRequestLimiter, requestPreKycMobileOtpHandler);
authRouter.post("/profile/pre-kyc/mobile/confirm", requireAuth, authLimiter, confirmPreKycMobileHandler);

authRouter.post("/email/otp/request", requireAuth, otpRequestLimiter, requestEmailOtp);
authRouter.post("/email/otp/verify", requireAuth, authLimiter, verifyEmailOtpHandler);
authRouter.get("/email/check", requireAuth, signupMobileCheckLimiter, signupEmailCheck);
authRouter.patch("/email/preferences", requireAuth, updateEmailPreferences);
authRouter.get("/aeps-favourite-banks", requireAuth, getAepsFavouriteBanksHandler);
authRouter.put("/aeps-favourite-banks", requireAuth, putAepsFavouriteBanksHandler);

authRouter.post("/telegram/link", requireAuth, createTelegramLinkHandler);
authRouter.delete("/telegram/link", requireAuth, unlinkTelegramHandler);
authRouter.get("/telegram/status", requireAuth, telegramStatusHandler);

authRouter.get("/devices", requireAuth, listDevices);
authRouter.post("/devices/:id/revoke", requireAuth, revokeDevice);

authRouter.get("/sponsor/search", otpRequestLimiter, searchSponsors);
authRouter.get("/sponsor/:uid", otpRequestLimiter, lookupSponsor);
authRouter.get("/signup/mobile-check", signupMobileCheckLimiter, signupMobileCheck);
authRouter.post("/signup/request", otpRequestLimiter, signupRequest);
authRouter.post("/signup/verify", authLimiter, signupVerify);
authRouter.post("/signup/complete", authLimiter, signupComplete);
authRouter.post("/txn-pin", requireAuth, setTransactionPin);
authRouter.post("/txn-pin/verify", requireAuth, authLimiter, verifyTransactionPin);

authRouter.get("/agent-auth/status", requireAuth, requireRole("retailer"), agentAuthStatus);
authRouter.post("/agent-auth", requireAuth, requireRole("retailer"), walletTxnLimiter, agentAuth);

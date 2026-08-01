import { Router } from "express";
import {
  register,
  login,
  refresh,
  logout,
  me,
  requestOtp,
  verifyOtp,
  mpinLogin,
  setMpin,
  requestEmailOtp,
  verifyEmailOtpHandler,
  updateEmailPreferences,
  listDevices,
  revokeDevice,
  signupRequest,
  signupVerify,
  signupComplete,
  lookupSponsor,
  searchSponsors,
  setTransactionPin,
  verifyTransactionPin,
  agentAuth,
  agentAuthStatus,
} from "./auth.controller";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { authLimiter, otpRequestLimiter, walletTxnLimiter } from "../../middleware/rateLimiter";

export const authRouter = Router();

authRouter.post("/register", requireAuth, register);
authRouter.post("/login", authLimiter, login);
authRouter.post("/refresh", authLimiter, refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);

authRouter.post("/otp/request", otpRequestLimiter, requestOtp);
authRouter.post("/otp/verify", authLimiter, verifyOtp);

authRouter.post("/mpin/login", authLimiter, mpinLogin);
authRouter.post("/mpin/set", requireAuth, setMpin);

authRouter.post("/email/otp/request", requireAuth, otpRequestLimiter, requestEmailOtp);
authRouter.post("/email/otp/verify", requireAuth, authLimiter, verifyEmailOtpHandler);
authRouter.patch("/email/preferences", requireAuth, updateEmailPreferences);

authRouter.get("/devices", requireAuth, listDevices);
authRouter.post("/devices/:id/revoke", requireAuth, revokeDevice);

authRouter.get("/sponsor/search", otpRequestLimiter, searchSponsors);
authRouter.get("/sponsor/:uid", otpRequestLimiter, lookupSponsor);
authRouter.post("/signup/request", otpRequestLimiter, signupRequest);
authRouter.post("/signup/verify", authLimiter, signupVerify);
authRouter.post("/signup/complete", authLimiter, signupComplete);

authRouter.post("/txn-pin", requireAuth, setTransactionPin);
authRouter.post("/txn-pin/verify", requireAuth, authLimiter, verifyTransactionPin);

authRouter.get("/agent-auth/status", requireAuth, requireRole("retailer"), agentAuthStatus);
authRouter.post("/agent-auth", requireAuth, requireRole("retailer"), walletTxnLimiter, agentAuth);

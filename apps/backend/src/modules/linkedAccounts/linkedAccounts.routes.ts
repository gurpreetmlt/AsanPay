import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { authLimiter, otpRequestLimiter } from "../../middleware/rateLimiter";
import { linkCheck, linkStart, linkVerify, list, switchOtp, switchTo, unlink } from "./linkedAccounts.controller";

export const linkedAccountsRouter = Router();

linkedAccountsRouter.use(requireAuth, requireRole("super_distributor", "distributor", "retailer"));

linkedAccountsRouter.get("/", list);
linkedAccountsRouter.post("/link/check", otpRequestLimiter, linkCheck);
linkedAccountsRouter.post("/link/start", otpRequestLimiter, linkStart);
linkedAccountsRouter.post("/link/verify", authLimiter, linkVerify);
linkedAccountsRouter.post("/switch/otp", otpRequestLimiter, switchOtp);
linkedAccountsRouter.post("/switch", authLimiter, switchTo);
linkedAccountsRouter.delete("/:userId", unlink);

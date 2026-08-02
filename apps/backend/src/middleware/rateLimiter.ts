import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env";

const isDev = env.NODE_ENV !== "production";

/**
 * Coolify/LB sets a single trusted hop. Do not trust client-supplied XFF freely —
 * express-rate-limit should use req.ip after Express trust proxy is configured.
 * We still key OTP by mobile when present so rotating XFF cannot spray one number.
 */
const sharedValidate = {
  trustProxy: true,
  xForwardedForHeader: false,
} as const;

function clientIp(req: Request): string {
  return req.ip || "unknown";
}

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 5000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  validate: sharedValidate,
});

function requestMobile(req: Request): string {
  const fromBody = typeof req.body?.mobile === "string" ? req.body.mobile.trim() : "";
  const fromQuery = typeof req.query?.mobile === "string" ? req.query.mobile.trim() : "";
  return fromBody || fromQuery;
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const mobile = requestMobile(req);
    return mobile ? `auth:${mobile}` : `auth-ip:${clientIp(req)}`;
  },
  validate: sharedValidate,
});

export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 50 : 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const mobile = requestMobile(req);
    // Prefer mobile so XFF rotation cannot flood one number; fall back to IP.
    return mobile ? `otp:${mobile}` : `otp-ip:${clientIp(req)}`;
  },
  validate: sharedValidate,
});

/** Live signup mobile availability — lighter than OTP send. */
export const signupMobileCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 120 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const mobile = requestMobile(req);
    return mobile ? `signup-check:${mobile}` : `signup-check-ip:${clientIp(req)}`;
  },
  validate: sharedValidate,
});

export const walletTxnLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as Request & { auth?: { sub?: string } }).auth?.sub ?? clientIp(req),
  validate: sharedValidate,
});

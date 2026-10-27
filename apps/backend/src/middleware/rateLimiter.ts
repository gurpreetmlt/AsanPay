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
  // Prod portals proxy via Next.js — many users can share one container IP until
  // X-Forwarded-For is forwarded. Dashboard alone fires many parallel calls.
  // 300/15min was exhausting the shared bucket and returning 429 site-wide.
  limit: isDev ? 5000 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path === "/health" ||
    req.path === "/api/health" ||
    req.path.startsWith("/api/whatsapp/webhook") ||
    req.path.startsWith("/api/webhooks/"),
  message: { success: false, message: "Too many requests — wait a moment and retry" },
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

/** KYC photo checks run OCR on our CPU — cap per signed-in user. */
export const kycDocCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 200 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `kyc-doc-check:${(req as Request & { auth?: { sub?: string } }).auth?.sub ?? clientIp(req)}`,
  validate: sharedValidate,
});

/** Public signup location page (no login) — the token is the only credential, so cap per IP. */
export const geoLinkPublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 300 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many location attempts from this network. Wait 15 minutes and try again." },
  keyGenerator: (req) => `geo-public:${clientIp(req)}`,
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

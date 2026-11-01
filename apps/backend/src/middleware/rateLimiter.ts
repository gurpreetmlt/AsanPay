import { isIP } from "node:net";
import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env";
import { safeEqual } from "../utils/safeEqual";

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

/**
 * Web portals call the API through their own server-side proxy, so req.ip is the portal container.
 * Only a request carrying the proxy shared secret may name the browser IP.
 */
export function clientIp(req: Request): string {
  const expectedKey = env.PROXY_SHARED_SECRET?.trim();
  if (expectedKey && safeEqual(req.header("x-asanpay-proxy-key")?.trim(), expectedKey)) {
    const forwarded = req.header("x-asanpay-client-ip")?.trim() ?? "";
    if (isIP(forwarded)) return forwarded;
  }
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
    req.path === "/ready" ||
    req.path === "/api/health" ||
    req.path.startsWith("/api/whatsapp/webhook") ||
    req.path.startsWith("/api/webhooks/"),
  message: { success: false, message: "Too many requests — wait a moment and retry" },
  keyGenerator: (req) => clientIp(req),
  validate: sharedValidate,
});

/** Only a well-formed mobile picks the bucket — random junk would give an attacker a fresh bucket per request. */
function requestMobile(req: Request): string {
  const fromBody = typeof req.body?.mobile === "string" ? req.body.mobile.trim() : "";
  const fromQuery = typeof req.query?.mobile === "string" ? req.query.mobile.trim() : "";
  const mobile = fromBody || fromQuery;
  return /^[6-9]\d{9}$/.test(mobile) ? mobile : "";
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    // One shared bucket for the single admin account, whatever mobile/username the body carries.
    if (req.body?.portal === "admin") return "auth:admin";
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

/** Provider callbacks skip apiLimiter (webhook prefix), so cap the unauthenticated endpoint per IP. */
export const nobleCallbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 1000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 0, message: "Too many callbacks from this IP. Retry after one minute." },
  keyGenerator: (req) => `noble-callback:${clientIp(req)}`,
  validate: sharedValidate,
});

/** Agent web polls one login approval every few seconds for 2 minutes; the poll secret is the credential. */
export const loginApprovalPollLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 600 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Checking too often. Wait a few seconds and try again." },
  keyGenerator: (req) => `login-approval:${String(req.params?.id ?? "")}:${clientIp(req)}`,
  validate: sharedValidate,
});

/** Web login page asks for a fresh QR every 2 minutes while it stays open. */
export const qrLoginStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 300 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many QR codes requested from this network. Wait 15 minutes or log in with OTP." },
  keyGenerator: (req) => `qr-login:${clientIp(req)}`,
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

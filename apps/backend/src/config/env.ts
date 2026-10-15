import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Optional — cache only (sessions/hot reads). Never queues, jobs, or primary data. */
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  AES_ENCRYPTION_KEY: z.string().min(1, "AES_ENCRYPTION_KEY is required"),
  /** Comma-separated list of allowed origins (one per web portal) — e.g. "https://a.com,https://b.com" */
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /**
   * Dev-only: echo OTP in API response for local testing without SMS.
   * SECURITY: Ignored when NODE_ENV=production (always false). Opt-in even in development.
   */
  EXPOSE_OTP_IN_RESPONSE: z.coerce.boolean().default(false),
  /**
   * OTP delivery channels (comma-separated), first match wins:
   * - whatsapp — send to the user's signin/signup mobile via WhatsApp Cloud API
   * - telegram — send via TELEGRAM_BOT_TOKEN when user has linked chat id
   * - sms — reserved for future SMS gateway (not implemented yet)
   * - log — only log / optionally EXPOSE_OTP (dev)
   * Default whatsapp for login/signup while SMS is not live.
   */
  OTP_DELIVERY: z.string().default("whatsapp"),
  TELEGRAM_BOT_TOKEN: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  ),
  /** Bot username without @ — e.g. AsanPayAuthBot */
  TELEGRAM_BOT_USERNAME: z.string().default("AsanPayAuthBot"),
  /**
   * Shared secret for Telegram → AsanPay webhook (`?token=`).
   * Required when TELEGRAM_BOT_TOKEN is set in production.
   */
  TELEGRAM_WEBHOOK_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(16).optional(),
  ),
  /**
   * Public HTTPS base for setWebhook, e.g. https://api.asanpay.in
   * Optional — ops can set webhook manually via Bot API.
   */
  TELEGRAM_WEBHOOK_PUBLIC_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional(),
  ),
  /**
   * Comma-separated "mobile:otp" pairs that receive a FIXED login OTP instead of a random one
   * (e.g. "9333333333:222222,9444444444:333333"). Interim until an SMS provider is integrated,
   * and useful for Play Store review accounts. Works in production but ONLY for listed numbers —
   * everyone else still gets a random OTP they can never see, so keep this list to test accounts.
   */
  TEST_OTP_OVERRIDES: z.string().default(""),
  /**
   * Same format as TEST_OTP_OVERRIDES, but only for public signup OTPs.
   * Example: "*:242424" → every mobile gets signup OTP 242424 (pre-launch).
   * Login OTPs still use TEST_OTP_OVERRIDES only.
   */
  TEST_SIGNUP_OTP_OVERRIDES: z.string().default(""),
  /**
   * Pre-launch switch. Keep false only while transaction PIN onboarding is intentionally disabled.
   * Set true before any real-money provider is enabled.
   */
  REQUIRE_TXN_PIN: z.coerce.boolean().default(false),
  /**
   * Testing-only: allow the SAME biometric PID to be submitted more than once (skips the
   * replay-guard uniqueness check). Needed while testing with real fingers before an SMS/UIDAI
   * provider is wired, since a live PID XML can only be captured once per scan. Turn OFF before
   * launch — reusing a PID is exactly the replay attack this guard exists to stop.
   */
  ALLOW_BIOMETRIC_REPLAY: z.coerce.boolean().default(false),
  /**
   * Allow stub/mock provider adapters to serve traffic in production. Default false: with real
   * providers not yet integrated, a mock returns "success" for any AEPS/DMT/BBPS call, which
   * would let a retailer mint float without a real bank payout. Only turn this on in dev/staging.
   */
  ALLOW_STUB_PROVIDERS: z.coerce.boolean().default(false),
  /**
   * Hard ceiling (in rupees) on a single admin manual wallet top-up. Manual funding mints float
   * from outside the system, so an unbounded call is the biggest single-action money risk. Raise
   * deliberately if a genuine large reconciliation needs it; a real dual-approval workflow should
   * replace this ceiling before scale.
   */
  MAX_MANUAL_FUND_RUPEES: z.coerce.number().positive().default(500000),
  /**
   * Fund-request credit at/above this amount (rupees) needs two different admins:
   * first sets under_review (maker), second completes the credit (checker).
   */
  FUND_APPROVE_DUAL_RUPEES: z.coerce.number().positive().default(200000),
  /** Hard ceiling (rupees) on flat commission overrides per transaction. */
  MAX_FLAT_COMMISSION_RUPEES: z.coerce.number().positive().default(500),
  /**
   * How often to auto-recheck pending / crash-stale initiated txns (ms).
   * Set 0 to disable the worker. Default 5 minutes.
   */
  TXN_RECONCILE_INTERVAL_MS: z.coerce.number().int().min(0).default(5 * 60 * 1000),
  /**
   * How often to run ledger reconciliation checks per active tenant (ms).
   * Writes reconciliation_exceptions only — never auto-fixes balances.
   * Set 0 to disable. Default 15 minutes.
   */
  LEDGER_RECON_INTERVAL_MS: z.coerce.number().int().min(0).default(15 * 60 * 1000),
  /**
   * SMTP for outbound mail (email-verify OTPs, later invoices/statements).
   * Currently Google Workspace: smtp.gmail.com:587 with an App Password for
   * no-reply@asanpay.in. All four must be set for mail to send — if any is
   * missing the mailer stays disabled and email verification is unavailable.
   */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** From header, e.g. "AsanPay <no-reply@asanpay.in>". Falls back to SMTP_USER. */
  SMTP_FROM: z.string().optional(),
  /** Inbox for Distributor / Super Distributor enquiries. Falls back to SMTP_USER. */
  PARTNER_ENQUIRY_EMAIL: z.string().email().optional(),
  /** Email alert when a downline wallet transfer is at/above this amount (₹). */
  WALLET_LARGE_DEBIT_ALERT_RS: z.coerce.number().positive().default(25_000),
  /** Optional Slack/Teams-compatible incoming webhook URL for ops alerts (recon failures, stuck txns). */
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  /** Retailer alert system — critical channel (txn failure, wallet mismatch, fraud, KYC block). */
  SLACK_WEBHOOK_CRITICAL: z.string().url().optional(),
  /** Retailer alert system — general/informational channel (daily limit, retry-recovered, minor KYC). */
  SLACK_WEBHOOK_GENERAL: z.string().url().optional(),
  /** Suppress duplicate alerts for the same (alertType, retailerId) within this window (ms). */
  ALERT_DEBOUNCE_MS: z.coerce.number().int().min(0).default(60 * 1000),
  /** Fraud heuristic: N+ transactions by the same retailer within the rapid-fire window trigger an alert. */
  FRAUD_RAPID_TXN_COUNT: z.coerce.number().int().min(1).default(5),
  FRAUD_RAPID_TXN_WINDOW_MS: z.coerce.number().int().min(1000).default(2 * 60 * 1000),
  /** Fraud heuristic: amount this many times the retailer's recent average triggers an alert. */
  FRAUD_AMOUNT_SPIKE_MULTIPLIER: z.coerce.number().min(1).default(3),
  /** A pending/initiated txn older than this (ms) is flagged as stuck in an ops alert. Default 30 min. */
  TXN_STUCK_ALERT_MS: z.coerce.number().int().min(0).default(30 * 60 * 1000),
  /**
   * Shared secret for bank → AsanPay VAN credit webhooks (HMAC-SHA256 of
   * `bankTxnId|vanNumber|vpa|amount`). Optional — when unset the webhook returns 503.
   */
  VAN_WEBHOOK_SECRET: z.string().min(16).optional(),
  /**
   * Comma-separated allowlist of STQC-certified RD-service device-provider ids (PidData
   * DeviceInfo@dpId) accepted for AePS biometric capture — e.g. Mantra, Morpho/IDEMIA, Precision.
   * Case-insensitive prefix match. Empty means allow-all (dev only — see isAepsDeviceAllowlistEnforced).
   */
  AEPS_CERTIFIED_DEVICE_PROVIDERS: z
    .string()
    .default("MANTRA,MORPHO,IDEMIA,PRECISION,STARTEK,SECUGEN,COGENT,EVOLUTE,M2SYS")
    .transform((v) => v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)),
  /**
   * AEPS rail mode. Same UI/API; only the provider behind the adapter changes.
   * - off: no AePS provider configured — AePS requests fail with a clear 503
   * - instantpay_sandbox / instantpay_live: real InstantPay adapter (fail-closed if creds missing)
   * - paysprint_sandbox / paysprint_live: real PaySprint adapter (fail-closed if creds missing)
   * The retired `dummy` value is read as `off` so an old env cannot stop the server booting.
   */
  AEPS_PROVIDER_MODE: z.preprocess(
    (v) => (v === "dummy" ? "off" : v),
    z.enum(["off", "instantpay_sandbox", "instantpay_live", "paysprint_sandbox", "paysprint_live"]).default("off"),
  ),
  INSTANTPAY_CLIENT_ID: z.string().optional(),
  INSTANTPAY_CLIENT_SECRET: z.string().optional(),
  /** Auth code header — InstantPay docs use fixed "1". */
  INSTANTPAY_AUTH_CODE: z.string().default("1"),
  /**
   * AES-256 key (32 utf8 chars OR base64 of 32 bytes) used to encrypt Aadhaar for InstantPay
   * biometricData.encryptedAadhaar (aes-256-cbc). Required in sandbox/live modes.
   */
  INSTANTPAY_AES_KEY: z.string().optional(),
  /** Optional override; default is InstantPay production host for both sandbox and live accounts. */
  INSTANTPAY_BASE_URL: z.string().url().optional(),
  /**
   * PaySprint AEPS credentials. Docs (PaySprint/Unimplemented/) leave UAT base URL and AES
   * mode/padding as "confirm with PaySprint" — AES-128-CBC/PKCS7 is a best-effort default until
   * confirmed. Fail-closed: sandbox/live modes refuse to start without all of these set.
   */
  PAYSPRINT_PARTNER_ID: z.string().optional(),
  PAYSPRINT_JWT_SECRET: z.string().optional(),
  PAYSPRINT_AES_KEY: z.string().optional(),
  PAYSPRINT_AES_IV: z.string().optional(),
  /** Required on UAT per provider docs; not required on Live. */
  PAYSPRINT_AUTHORISED_KEY: z.string().optional(),
  /** Not in docs (marked "confirm with PaySprint") — must be set explicitly before sandbox/live use. */
  PAYSPRINT_UAT_BASE_URL: z.string().url().optional(),
  PAYSPRINT_LIVE_BASE_URL: z.string().url().default("https://api.paysprint.in/service-api/api/v1/service"),
  /**
   * JWT payload timestamp unit — PaySprint's Authentication doc prose states "Timestamp is in
   * seconds ... valid for <=5 minutes" (confirmed 2026-07-21), even though one of their own C#
   * code samples uses milliseconds. Trusting the prose over the sample code, per the docs' own
   * gotcha ("trust partner sample over polluted reference material").
   */
  PAYSPRINT_JWT_TIMESTAMP_UNIT: z.enum(["ms", "s"]).default("s"),
  /** Max km from registered outlet for AEPS txns (InstantPay best practice: 2–3 km). */
  AEPS_GEOFENCE_KM: z.coerce.number().positive().default(3),
  /** Days without AEPS activity before merchant is treated as dormant. */
  // RBI "AePS — Due Diligence of AePS Touchpoint Operators" Directions (26 Jun 2025, in force
  // 1 Jan 2026): an operator with no transactions for three consecutive months must complete
  // fresh KYC before resuming. 90 is the ceiling, not a tuning knob — do not raise it.
  AEPS_DORMANCY_DAYS: z.coerce.number().int().positive().max(90).default(90),
  /**
   * Concurrent biometric scanners an agent may keep registered. A cap plus self-service
   * de-registration handles honest churn without an approval queue, while the one-serial-one-agent
   * index handles the case a cap cannot: the same device moving between agents.
   */
  MAX_AGENT_DEVICES: z.coerce.number().int().positive().max(10).default(3),
  /** SLA clock for disputes (task #11) — hours from raise to due, surfaced to ops, not enforced automatically. */
  DISPUTE_SLA_HOURS: z.coerce.number().int().positive().default(48),
  /** Consecutive biometric mismatches on one Aadhaar before merchant block / EDD. */
  AEPS_BIO_MISMATCH_LIMIT: z.coerce.number().int().positive().default(2),
  /**
   * VyaparAPI (mobile/DTH recharge). Partner `api_key` from Vyapar portal.
   * Optional until admin enables the provider — recharge fails closed if missing when routed.
   */
  VYAPARAPI_API_KEY: z.string().min(8).optional(),
  VYAPARAPI_BASE_URL: z.string().url().default("https://api.vyaparapi.com"),
  /**
   * Shared secret for Vyapar → AsanPay partner callback (`?token=` or `X-Vyapar-Token`).
   * Required for the webhook to accept updates when set.
   */
  VYAPARAPI_CALLBACK_SECRET: z.string().min(16).optional(),
  /**
   * BestAPI (Vyapar plans portal) — operator / plans / roffer for mobile recharge UI.
   * Recharge debit still goes through VyaparAPI.
   */
  BESTAPI_API_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(8).optional(),
  ),
  BESTAPI_API_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(8).optional(),
  ),
  BESTAPI_BASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().default("https://bestapi.in"),
  ),
  /**
   * Meta WhatsApp Cloud API. Token + phone-number id from Meta Developer
   * → WhatsApp → API Setup. Recipient is the user's signin/signup mobile — never a fixed number.
   */
  WHATSAPP_ACCESS_TOKEN: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(8).optional(),
  ),
  WHATSAPP_PHONE_NUMBER_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  /** Optional. Admin test endpoint only when body `to` is omitted. Not used for OTP. */
  WHATSAPP_RECIPIENT_NUMBER: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  ),
  /** Graph API version, e.g. v26.0 (current as of July 2026). */
  WHATSAPP_GRAPH_API_VERSION: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().default("v26.0"),
  ),
  /**
   * Approved WhatsApp authentication template name. Required to OTP any number
   * outside Meta's test allowlist / 24h window. Empty = send a free-form text OTP.
   */
  WHATSAPP_OTP_TEMPLATE_NAME: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  ),
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().default("en"),
  ),
  /**
   * AsanPay internal WhatsApp Support (Admin Inbox). Off by default.
   * OTP uses WHATSAPP_* above and keeps working when this is false.
   */
  WHATSAPP_SUPPORT_ENABLED: z.coerce.boolean().default(false),
  /**
   * Meta webhook verify token (Callback URL → Verify token). Required for
   * GET /api/whatsapp/webhook hub challenge. Same string as Meta dashboard.
   */
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(8).optional(),
  ),
  /**
   * Optional approved template for Admin Support replies outside the 24h window.
   * Body should accept one text variable ({{1}}) = reply text. Empty = free-text only in-window.
   */
  WHATSAPP_SUPPORT_TEMPLATE_NAME: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  ),
  WHATSAPP_SUPPORT_TEMPLATE_LANGUAGE: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().default("en"),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;

/** Fail-closed: sandbox/live must have InstantPay credentials — never silently fall back to another rail. */
export function assertAepsProviderConfig(): void {
  if (!isInstantPayAepsMode()) return;
  const missing: string[] = [];
  if (!env.INSTANTPAY_CLIENT_ID) missing.push("INSTANTPAY_CLIENT_ID");
  if (!env.INSTANTPAY_CLIENT_SECRET) missing.push("INSTANTPAY_CLIENT_SECRET");
  if (!env.INSTANTPAY_AES_KEY) missing.push("INSTANTPAY_AES_KEY");
  if (missing.length) {
    throw new Error(
      `AEPS_PROVIDER_MODE=${env.AEPS_PROVIDER_MODE} requires ${missing.join(", ")}. ` +
        "Set the credentials in Coolify, or switch AEPS_PROVIDER_MODE to a rail whose credentials are set.",
    );
  }
}

export function isInstantPayAepsMode(): boolean {
  return env.AEPS_PROVIDER_MODE === "instantpay_sandbox" || env.AEPS_PROVIDER_MODE === "instantpay_live";
}

export function isPaySprintAepsMode(): boolean {
  return env.AEPS_PROVIDER_MODE === "paysprint_sandbox" || env.AEPS_PROVIDER_MODE === "paysprint_live";
}

/** Fail-closed: PaySprint sandbox/live must have all credentials — never silent-fallback. */
export function assertPaySprintProviderConfig(): void {
  if (!isPaySprintAepsMode()) return;
  const missing: string[] = [];
  if (!env.PAYSPRINT_PARTNER_ID) missing.push("PAYSPRINT_PARTNER_ID");
  if (!env.PAYSPRINT_JWT_SECRET) missing.push("PAYSPRINT_JWT_SECRET");
  if (!env.PAYSPRINT_AES_KEY) missing.push("PAYSPRINT_AES_KEY");
  if (!env.PAYSPRINT_AES_IV) missing.push("PAYSPRINT_AES_IV");
  if (env.AEPS_PROVIDER_MODE === "paysprint_sandbox") {
    if (!env.PAYSPRINT_AUTHORISED_KEY) missing.push("PAYSPRINT_AUTHORISED_KEY");
    if (!env.PAYSPRINT_UAT_BASE_URL) missing.push("PAYSPRINT_UAT_BASE_URL");
  }
  if (missing.length) {
    throw new Error(
      `AEPS_PROVIDER_MODE=${env.AEPS_PROVIDER_MODE} requires ${missing.join(", ")}. ` +
        "Set the credentials in Coolify, or switch AEPS_PROVIDER_MODE to a rail whose credentials are set.",
    );
  }
}

/** Never expose OTP over the wire in production, even if the env flag is mis-set. */
export function shouldExposeOtpInResponse(): boolean {
  return env.NODE_ENV !== "production" && env.EXPOSE_OTP_IN_RESPONSE;
}

/**
 * Fixed OTP for a whitelisted test number (TEST_OTP_OVERRIDES), or null.
 * A "*:otp" entry applies to ALL numbers (pre-launch only — remove once SMS provider is live).
 * Exact number entries win over the wildcard.
 */
export function getTestOtpOverride(mobile: string): string | null {
  return parseOtpOverrides(env.TEST_OTP_OVERRIDES, mobile);
}

/** Signup-only fixed OTP (TEST_SIGNUP_OTP_OVERRIDES). Falls back to login overrides if unset. */
export function getTestSignupOtpOverride(mobile: string): string | null {
  return parseOtpOverrides(env.TEST_SIGNUP_OTP_OVERRIDES, mobile) ?? parseOtpOverrides(env.TEST_OTP_OVERRIDES, mobile);
}

function parseOtpOverrides(raw: string, mobile: string): string | null {
  if (!raw) return null;
  // Coolify / docker often leave wrapping quotes or spaces on the value.
  const cleaned = raw.trim().replace(/^["']|["']$/g, "");
  if (!cleaned) return null;
  // Allow bare "232323" (no *: prefix) — common Coolify misconfig.
  if (/^\d{6}$/.test(cleaned)) return cleaned;

  const mobileDigits = mobile.replace(/\D/g, "");
  const mobile10 = mobileDigits.slice(-10);
  let wildcard: string | null = null;
  for (const pair of cleaned.split(",")) {
    const trimmed = pair.trim().replace(/^["']|["']$/g, "");
    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      // Tolerate stray bare OTPs inside a comma list.
      if (/^\d{6}$/.test(trimmed)) wildcard = trimmed;
      continue;
    }
    const num = trimmed.slice(0, colon).trim().replace(/^["']|["']$/g, "");
    const otp = trimmed.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
    if (!otp || !/^\d{6}$/.test(otp)) continue;
    if (num === mobile || num === mobileDigits || num === mobile10) return otp;
    if (num === "*") wildcard = otp;
  }
  return wildcard;
}

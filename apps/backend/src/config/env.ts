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
   * Example: "*:242424" → every mobile gets signup OTP 242424 (non-production only —
   * wildcard / bare entries make the server refuse to boot when NODE_ENV=production).
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
  /** Agent web base URL used in emailed links (signup invites). */
  AGENT_PORTAL_URL: z.string().url().default("https://dev.asanpay.in"),
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
   * - noble: Noble adapter (fail-closed if creds missing)
   * Any retired value (`dummy`, old provider modes) is read as `off` so an old env cannot stop the server booting.
   */
  AEPS_PROVIDER_MODE: z.preprocess(
    (v) => (String(v ?? "").trim().toLowerCase() === "noble" ? "noble" : "off"),
    z.enum(["off", "noble"]),
  ),
  /**
   * AEPS / DMT / recharge / CMS provider. Optional until keys are issued — client fails closed
   * with a clear message when missing.
   */
  NOBLE_API_KEY: z.string().optional(),
  NOBLE_API_VALUE: z.string().optional(),
  NOBLE_BASE_SERVICE: z.string().url().default("https://service.noblewebstudio.in"),
  NOBLE_BASE_AEPS: z.string().url().default("https://aeapi.noblewebstudio.in"),
  NOBLE_BASE_DMT: z.string().url().default("https://dmt.noblewebstudio.in"),
  NOBLE_BASE_RECHARGE: z.string().url().default("https://rcapi.noblewebstudio.in"),
  NOBLE_BASE_CMS: z.string().url().default("https://cms.noblewebstudio.in"),
  /** Provider cost per bank account check (₹), debited from the agent's wallet. */
  BANK_NAME_CHECK_COST: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "BANK_NAME_CHECK_COST must be rupees, e.g. 0.80")
    .default("0.80"),
  BANK_PENNY_DROP_COST: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "BANK_PENNY_DROP_COST must be rupees, e.g. 1.80")
    .default("1.80"),
  /**
   * Service geofence: a txn is allowed within SHOP_GEOFENCE_KM of the shop (outlet) location OR
   * within HOME_GEOFENCE_KM of the home location captured at signup.
   */
  SHOP_GEOFENCE_KM: z.coerce.number().positive().optional(),
  HOME_GEOFENCE_KM: z.coerce.number().positive().default(5),
  /** Legacy shop radius — used only when SHOP_GEOFENCE_KM is not set. */
  AEPS_GEOFENCE_KM: z.coerce.number().positive().optional(),
  /** Optional MaxMind GeoLite2 City/Country .mmdb path — country of the phone that captured a signup location. */
  GEOLITE2_DB_PATH: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  ),
  /** Ask ip-api.com whether the capture IP is a proxy / VPN (free tier, HTTP, 45 req/min). Off by default. */
  IP_PROXY_CHECK_ENABLED: z.preprocess(
    (v) => ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase()),
    z.boolean(),
  ),
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
  /** KYC photo OCR: PaddleOCR first, Tesseract as backup. `off` = Tesseract only. */
  KYC_OCR_PADDLE: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z.enum(["on", "off"]).default("on"),
  ),
  /** PaddleOCR models: `v5` = PP-OCRv5 detection + English recognition (default), `v4` = rollback. */
  KYC_OCR_PADDLE_MODEL: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z.enum(["v4", "v5"]).default("v5"),
  ),
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

const otpProblems = testOtpProductionViolations(env);
if (otpProblems.length > 0) {
  console.error("Refusing to start with test OTP settings in production:", otpProblems);
  throw new Error(`Test OTP settings are not allowed in production: ${otpProblems.join("; ")}`);
}

/**
 * Production must never run with OTP shortcuts that work for every number or leak the OTP.
 * Exact-number review accounts in TEST_*_OTP_OVERRIDES stay allowed. Returns problems; empty = OK.
 */
export function testOtpProductionViolations(cfg: {
  NODE_ENV: string;
  EXPOSE_OTP_IN_RESPONSE: boolean;
  TEST_OTP_OVERRIDES: string;
  TEST_SIGNUP_OTP_OVERRIDES: string;
}): string[] {
  if (cfg.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (cfg.EXPOSE_OTP_IN_RESPONSE) {
    problems.push("EXPOSE_OTP_IN_RESPONSE must be false or unset");
  }
  for (const key of ["TEST_OTP_OVERRIDES", "TEST_SIGNUP_OTP_OVERRIDES"] as const) {
    if (hasWildcardOtpOverride(cfg[key])) {
      problems.push(`${key} must not contain a "*:" or bare OTP entry — list exact test numbers only, or clear it`);
    }
  }
  return problems;
}

/** Mirrors parseOtpOverrides: a "*:otp" pair or a bare 6-digit OTP applies to every number. */
function hasWildcardOtpOverride(raw: string): boolean {
  const cleaned = raw.trim().replace(/^["']|["']$/g, "");
  if (!cleaned) return false;
  return cleaned.split(",").some((pair) => {
    const trimmed = pair.trim().replace(/^["']|["']$/g, "");
    const colon = trimmed.indexOf(":");
    if (colon <= 0) return /^\d{6}$/.test(trimmed);
    return trimmed.slice(0, colon).trim().replace(/^["']|["']$/g, "") === "*";
  });
}

/** True when both provider API credentials are non-empty (keys may arrive after code lands). */
export function isNobleConfigured(): boolean {
  return Boolean(env.NOBLE_API_KEY?.trim() && env.NOBLE_API_VALUE?.trim());
}

/** MOCK ids saved before keys were set do not count once live keys exist — agent must re-onboard. */
export function isUsableNobleAgentId(id: string | null | undefined): id is string {
  if (!id) return false;
  return !(isNobleConfigured() && id.startsWith("MOCK"));
}

export function isAepsOnboardingRequired(role: string, nobleAgentId: string | null | undefined): boolean {
  return role === "retailer" && env.AEPS_PROVIDER_MODE === "noble" && !isUsableNobleAgentId(nobleAgentId);
}

/** Shop geofence radius: SHOP_GEOFENCE_KM, else the legacy AEPS_GEOFENCE_KM, else 15. */
export function shopGeofenceKm(): number {
  return env.SHOP_GEOFENCE_KM ?? env.AEPS_GEOFENCE_KM ?? 15;
}

export function isNobleAepsMode(): boolean {
  return env.AEPS_PROVIDER_MODE === "noble";
}

/** Fail-closed: noble mode requires API credentials for live money rails. */
export function assertNobleAepsProviderConfig(): void {
  if (!isNobleAepsMode()) return;
  if (isNobleConfigured()) return;
  throw new Error(
    "AEPS_PROVIDER_MODE=noble requires NOBLE_API_KEY and NOBLE_API_VALUE. " +
      "Set them in Coolify, or switch AEPS_PROVIDER_MODE to another rail.",
  );
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

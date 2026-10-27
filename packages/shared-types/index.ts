// Shared across backend + all web/mobile apps. Keep this dependency-free (no runtime imports).

export const USER_ROLES = [
  "admin",
  "super_distributor",
  "distributor",
  "retailer",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that use the unified agent web/mobile app (not admin portal). */
export const AGENT_PORTAL_ROLES = [
  "super_distributor",
  "distributor",
  "retailer",
] as const;
export type AgentPortalRole = (typeof AGENT_PORTAL_ROLES)[number];

/** Login portal identifiers sent to the API. */
export const AUTH_PORTALS = ["admin", "agent"] as const;
export type AuthPortal = (typeof AUTH_PORTALS)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  super_distributor: "Super Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
};

export const KYC_STATUSES = ["pending", "verified", "rejected"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const WALLET_TYPES = ["main", "aeps"] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export const LEDGER_ENTRY_TYPES = ["debit", "credit"] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const TRANSACTION_STATUSES = [
  "initiated",
  "pending",
  "success",
  "failed",
  "reversed",
  "refunded",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export interface AuthUser {
  id: string;
  uid: string;
  role: UserRole;
  name: string;
  mobile: string;
  email: string | null;
  /** ISO timestamp when email was confirmed via OTP; null if unverified. */
  emailVerifiedAt: string | null;
  /** Opt-in for rare product update emails. */
  emailMarketingOptIn: boolean;
  parentId: string | null;
  kycStatus: KycStatus;
  isActive: boolean;
  /** True once PAN/Aadhaar docs have been submitted (admin may still verify). */
  hasKycDocs: boolean;
  /** True once Noble AEPS agent_onboarding saved a uniqueAgentId. */
  hasNobleAgent: boolean;
  /** Retailer must finish AEPS agent onboarding before opening AEPS services. */
  aepsOnboardingRequired?: boolean;
  /** True once transaction PIN is set. */
  hasTxnPin: boolean;
  /** True once login MPIN is set (mobile quick unlock). */
  hasLoginMpin: boolean;
  /** True when Telegram chat is linked for OTP delivery. */
  telegramLinked: boolean;
  /** True when this agent may raise fund requests (admin can switch it per agent). */
  fundRequestEnabled: boolean;
}

/** Max accounts in one linked group (one Distributor + one Retailer). */
export const MAX_LINKED_ACCOUNTS = 2;

/** GET /api/linked-accounts row. Never carries PAN / Aadhaar. */
export interface LinkedAccountSummary {
  userId: string;
  uid: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  /** e.g. XXXXXX4521 */
  mobileMasked: string;
  isCurrent: boolean;
  /** ISO time the link was created; null when the current account has no links. */
  linkedAt: string | null;
  linkMethod: "otp" | null;
  /** Switching into this account needs OTP on its mobile (last OTP verify is older than 24 h). */
  otpRequiredForSwitch: boolean;
  /** ISO time until which switching into this account is locked after wrong MPINs. */
  switchLockedUntil: string | null;
  /** `needs_review` = inactive, KYC no longer verified, or identity no longer matches. */
  status: "active" | "needs_review";
}

export interface LinkedAccountsResponse {
  accounts: LinkedAccountSummary[];
  maxLinked: number;
}

/** Verified-KYC comparison with the logged-in account. Name is checked only after PAN + Aadhaar match. */
export interface LinkIdentityChecks {
  pan: boolean;
  aadhaar: boolean;
  name: boolean;
}

/** POST /api/linked-accounts/link/check — Verify popup before OTP. */
export interface LinkCheckResult {
  eligible: boolean;
  /** Why linking is blocked (identity / name), else null. */
  message: string | null;
  checks: LinkIdentityChecks;
  /** Other account details — only when PAN and Aadhaar match (same person). */
  account: {
    name: string;
    uid: string;
    role: UserRole;
    roleLabel: string;
    mobileMasked: string;
    kycStatus: "verified";
  } | null;
}

/** SD / Distributor may raise fund requests by default; a retailer only when admin enables it. */
export function isFundRequestEnabled(role: UserRole, override: boolean | null | undefined): boolean {
  if (role === "admin") return false;
  return override ?? role !== "retailer";
}

export interface JwtAccessPayload {
  sub: string; // user id
  uid: string;
  role: UserRole;
  type: "access";
}

export interface JwtRefreshPayload {
  sub: string;
  type: "refresh";
  jti: string; // token id, for revocation
}

export interface LoginRequest {
  mobile: string;
  password: string;
  portal: AuthPortal;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function isAgentPortalRole(role: UserRole): role is AgentPortalRole {
  return (AGENT_PORTAL_ROLES as readonly string[]).includes(role);
}

export function isAdminRole(role: UserRole): boolean {
  return role === "admin";
}

// ─── Catalog types (shared between backend → web → mobile) ───

export interface CatalogService {
  id: string;
  code: string;
  name: string;
  badge: string | null;
  /** SVG filename under apps/agent-portal/public/service-icons/, e.g. "Cash-Withdraw.svg". null = default icon. */
  icon: string | null;
}

export interface CatalogCategory {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  services: CatalogService[];
}

/**
 * Build URL for service icon.
 * Web: `/service-icons/${filename}`
 * Mobile: use this to look up XML or remote URL.
 */
export function serviceIconPath(icon: string | null | undefined): string | null {
  if (!icon) return null;
  return `/service-icons/${icon}`;
}

/**
 * Single source of truth for the white-label brand name/tagline — both apps/agent-portal/lib/brand.ts
 * and apps/asanpay-mobile-app/src/theme/brand.ts read these defaults from here so a rename
 * only has to happen in one place. Web can still override at runtime via
 * NEXT_PUBLIC_BRAND_NAME/NEXT_PUBLIC_BRAND_TAGLINE; the mobile app is compiled, so a brand
 * change there always needs a fresh release build regardless of where the constant lives.
 * Android release signing uses the same brand string via Gradle `BRAND_NAME` →
 * e.g. AsanPay → ASANPAY_UPLOAD_STORE_FILE (secrets in ~/.gradle/gradle.properties).
 */
export const BRAND_DEFAULTS = {
  name: "AsanPay",
  tagline: "Payment Made Easy",
} as const;

/** BestAPI / Vyapar numeric circle codes (Punjab = 02 confirmed live). */
export const TELECOM_CIRCLES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "10", name: "Delhi" },
  { code: "02", name: "Punjab" },
  { code: "03", name: "Himachal Pradesh" },
  { code: "96", name: "Haryana" },
  { code: "55", name: "Jammu & Kashmir" },
  { code: "97", name: "Uttar Pradesh (West)" },
  { code: "54", name: "Uttar Pradesh (East)" },
  { code: "92", name: "Mumbai" },
  { code: "90", name: "Maharashtra" },
  { code: "98", name: "Gujarat" },
  { code: "93", name: "Madhya Pradesh" },
  { code: "70", name: "Rajasthan" },
  { code: "31", name: "Kolkata" },
  { code: "51", name: "West Bengal" },
  { code: "53", name: "Odisha" },
  { code: "56", name: "Assam" },
  { code: "16", name: "North East" },
  { code: "52", name: "Bihar" },
  { code: "06", name: "Karnataka" },
  { code: "40", name: "Chennai" },
  { code: "94", name: "Tamil Nadu" },
  { code: "95", name: "Kerala" },
  { code: "49", name: "Andhra Pradesh" },
  { code: "99", name: "Sikkim" },
  { code: "100", name: "Tripura" },
  { code: "101", name: "Chhattisgarh" },
  { code: "102", name: "Goa" },
  { code: "103", name: "Meghalaya" },
  { code: "104", name: "Mizoram" },
  { code: "105", name: "Jharkhand" },
];

/** PhonePe-style recharge pack filters (BestAPI category + pack text). */
export const RECHARGE_PLAN_TAB_ORDER = [
  "popular",
  "unlimited",
  "data",
  "yearly",
  "international",
  "roaming",
  "talktime",
  "other",
] as const;
export type RechargePlanTabId = (typeof RECHARGE_PLAN_TAB_ORDER)[number];

export const RECHARGE_PLAN_TAB_LABELS: Record<RechargePlanTabId, string> = {
  popular: "Popular",
  unlimited: "Truly Unlimited",
  data: "Data",
  yearly: "Yearly",
  international: "International",
  roaming: "Roaming",
  talktime: "Talktime",
  other: "Other",
};

export function classifyRechargePlanTab(plan: {
  category?: string;
  description?: string;
  validity?: string;
  title?: string;
}): RechargePlanTabId {
  const blob = `${plan.category ?? ""} ${plan.title ?? ""} ${plan.description ?? ""} ${plan.validity ?? ""}`.toLowerCase();
  if (/isd|international|intl/.test(blob)) return "international";
  if (/roam/.test(blob)) return "roaming";
  if (/talk\s*time|talktime|top\s*up|topup|voucher/.test(blob)) return "talktime";
  if (/\b(year|yearly|annual|365|360|12\s*month)/.test(blob)) return "yearly";
  if (/unlimited/.test(blob)) return "unlimited";
  if (/\bdata\b/.test(blob) && !/\bcall/.test(blob)) return "data";
  if (/recommend|popular|combo/.test(blob)) return "popular";
  return "other";
}

/** Friendly DTH customer-info rows for agent UI (BestAPI DATA fields). */
export type DthInfoRow = { label: string; value: string };

const DTH_INFO_LABELS: Record<string, string> = {
  vc: "Subscriber ID",
  name: "Customer name",
  rmn: "Registered mobile",
  balance: "Balance",
  monthly: "Monthly amount",
  "next recharge date": "Next recharge",
  plan: "Current plan",
  status: "Connection status",
  "last recharge date": "Last recharge date",
  "last recharge amount": "Last recharge amount",
  switchofdate: "Switch-off date",
};

/** Address / location keys — never show in agent UI (PII). */
const DTH_INFO_LOCATION_SKIP = new Set([
  "address",
  "city",
  "district",
  "state",
  "pin code",
  "pincode",
  "pin",
  "postalcode",
]);

/** Always show these account rows (even when BestAPI sends N/A). */
const DTH_INFO_ALWAYS_SHOW = new Set(["last recharge date", "last recharge amount"]);

const DTH_INFO_ORDER = [
  "name",
  "balance",
  "vc",
  "rmn",
  "plan",
  "monthly",
  "next recharge date",
  "switchofdate",
  "status",
  "last recharge date",
  "last recharge amount",
] as const;

function isBlankDthValue(value: string): boolean {
  const t = value.trim();
  return !t || /^n\/?a$/i.test(t) || t === "-" || t === "—";
}

function formatDthInfoValue(rawLabel: string, value: string): string {
  const key = rawLabel.trim().toLowerCase();
  if (isBlankDthValue(value)) return "N/A";
  if (key === "status") {
    if (value === "1" || /^active$/i.test(value)) return "Active";
    if (value === "0" || /^inactive$/i.test(value)) return "Inactive";
  }
  if (/date|switchof/i.test(key)) {
    const parsed = parseDthDate(value);
    if (parsed) {
      return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  if (/balance|amount|monthly/i.test(key) && /^₹?[\d,]+(\.\d+)?$/.test(value.trim().replace(/\s/g, ""))) {
    const n = Number(value.replace(/[₹,\s]/g, ""));
    if (Number.isFinite(n)) {
      return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    }
  }
  return value.trim();
}

/** BestAPI often sends US-style `10/29/2026 12:00:00 AM` — parse reliably. */
function parseDthDate(raw: string): Date | null {
  const t = raw.trim();
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM))?/i);
  if (!m) return null;
  let month = Number(m[1]) - 1;
  let day = Number(m[2]);
  const year = Number(m[3]);
  // If first part > 12, treat as DD/MM/YYYY
  if (Number(m[1]) > 12) {
    day = Number(m[1]);
    month = Number(m[2]) - 1;
  }
  let hour = m[4] != null ? Number(m[4]) : 0;
  const minute = m[5] != null ? Number(m[5]) : 0;
  const second = m[6] != null ? Number(m[6]) : 0;
  const ampm = (m[7] || "").toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const out = new Date(year, month, day, hour, minute, second);
  return Number.isNaN(out.getTime()) ? null : out;
}

/**
 * Turns raw BestAPI summary rows into ordered, human-readable fields.
 * Empty / N/A values are dropped (except last recharge date/amount).
 * Home address fields are never returned.
 */
export function formatDthSubscriberInfo(rows: DthInfoRow[]): {
  name: string | null;
  balance: string | null;
  account: DthInfoRow[];
  /** Always empty — address kept out of UI for privacy. */
  location: DthInfoRow[];
} {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const key = row.label.trim().toLowerCase();
    if (!key) continue;
    if (DTH_INFO_LOCATION_SKIP.has(key)) continue;
    if (isBlankDthValue(row.value) && !DTH_INFO_ALWAYS_SHOW.has(key)) continue;
    byKey.set(key, formatDthInfoValue(row.label, row.value));
  }

  // Ensure last-recharge rows exist even if API omitted them
  for (const key of DTH_INFO_ALWAYS_SHOW) {
    if (!byKey.has(key)) byKey.set(key, "N/A");
  }

  const name = byKey.get("name") ?? null;
  const balance = byKey.get("balance") ?? null;

  const accountKeys = new Set([
    "vc",
    "rmn",
    "plan",
    "monthly",
    "next recharge date",
    "switchofdate",
    "status",
    "last recharge date",
    "last recharge amount",
  ]);

  const account: DthInfoRow[] = [];

  for (const key of DTH_INFO_ORDER) {
    if (key === "name" || key === "balance") continue;
    const value = byKey.get(key);
    if (!value) continue;
    const label = DTH_INFO_LABELS[key] ?? key;
    if (accountKeys.has(key)) account.push({ label, value });
  }

  for (const [key, value] of byKey) {
    if (key === "name" || key === "balance") continue;
    if (accountKeys.has(key)) continue;
    if (DTH_INFO_LOCATION_SKIP.has(key)) continue;
    if (DTH_INFO_ORDER.includes(key as (typeof DTH_INFO_ORDER)[number])) continue;
    account.push({ label: DTH_INFO_LABELS[key] ?? rowLabelTitle(key), value });
  }

  return { name, balance, account, location: [] };
}

function rowLabelTitle(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export {
  TERMS_BODY,
  PRIVACY_BODY,
  EULA_BODY,
  EULA_SUMMARY,
  LEGAL_VERSIONS,
  POLICY_VERSION,
  SIGNUP_POLICY_VERSION,
  buildLegalDownloadText,
  buildSignupLegalDownloadText,
} from "./legalCopy";
export {
  INDIAN_STATES,
  findIndianState,
  searchIndianStates,
  stateCodeFromName,
  type IndianState,
} from "./indianStates";
export {
  KYC_DOC_CHECK_COPY,
  PAN_FORMAT_ERROR,
  kycDocCheckBlocksStep,
  kycDocCheckHints,
  formatPanName,
  kycDocCheckSlotsForStep,
  kycDocCheckLabel,
  kycDocCheckToUi,
  type KycDocCheckItem,
  type KycDocCheckResult,
  type KycDocCheckSlot,
  type KycDocCheckStatus,
  type KycDocCheckUi,
} from "./kycDocCheck";
export {
  AEPS_ONBOARDING_STEPS,
  EMPTY_AEPS_ONBOARDING_FORM,
  validateAepsOnboardingStep,
  type AepsOnboardingError,
  type AepsOnboardingForm,
  type AepsOnboardingLocks,
  type AepsOnboardingPrefill,
} from "./aepsOnboarding";

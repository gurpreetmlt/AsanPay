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
  /** True once InstantPay Register Outlet (min-KYC) saved an outlet id. */
  hasInstantpayOutlet: boolean;
  /** True once transaction PIN is set. */
  hasTxnPin: boolean;
  /** True once login MPIN is set (mobile quick unlock). */
  hasLoginMpin: boolean;
  /** True when Telegram chat is linked for OTP delivery. */
  telegramLinked: boolean;
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

export { TERMS_BODY, PRIVACY_BODY, buildLegalDownloadText } from "./legalCopy";

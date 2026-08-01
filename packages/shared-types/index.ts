// Shared across backend + all web/mobile apps. Keep this dependency-free (no runtime imports).

export const USER_ROLES = [
  "admin",
  "master_distributor",
  "distributor",
  "retailer",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that use the unified agent web/mobile app (not admin portal). */
export const AGENT_PORTAL_ROLES = [
  "master_distributor",
  "distributor",
  "retailer",
] as const;
export type AgentPortalRole = (typeof AGENT_PORTAL_ROLES)[number];

/** Login portal identifiers sent to the API. */
export const AUTH_PORTALS = ["admin", "agent"] as const;
export type AuthPortal = (typeof AUTH_PORTALS)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  master_distributor: "Super Distributor",
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
  /** SVG filename under apps/web/public/service-icons/, e.g. "Cash-Withdraw.svg". null = default icon. */
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
 * Single source of truth for the white-label brand name/tagline — both apps/web/lib/brand.ts
 * and apps/asanpay-mobile-app/src/theme/brand.ts read these defaults from here so a rename
 * only has to happen in one place. Web can still override at runtime via
 * NEXT_PUBLIC_BRAND_NAME/NEXT_PUBLIC_BRAND_TAGLINE; the mobile app is compiled, so a brand
 * change there always needs a fresh release build regardless of where the constant lives.
 */
export const BRAND_DEFAULTS = {
  name: "AsanPay",
  tagline: "Payment Made Easy",
} as const;

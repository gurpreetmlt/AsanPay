export const SECURITY_PAGE = "/settings/security";

export interface AdminTotpStatus {
  enabled: boolean;
  enabledAt: string | null;
  pendingSetup: boolean;
  required: boolean;
}

export interface AdminTotpSetup {
  secretBase32: string;
  otpauthUrl: string;
}

const SETUP_REQUIRED_KEY = "asanpay-admin-totp-setup-required";

export function markTotpSetupRequired(required: boolean): void {
  if (typeof window === "undefined") return;
  if (required) sessionStorage.setItem(SETUP_REQUIRED_KEY, "1");
  else sessionStorage.removeItem(SETUP_REQUIRED_KEY);
}

export function isTotpSetupRequiredFlag(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SETUP_REQUIRED_KEY) === "1";
}

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP" for manual entry. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function onlyDigits(value: string, max = 6): string {
  return value.replace(/\D/g, "").slice(0, max);
}

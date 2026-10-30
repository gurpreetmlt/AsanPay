export const SECURITY_PAGE = "/settings/security";

export interface AdminTotpStatus {
  enabled: boolean;
  enabledAt: string | null;
  pendingSetup: boolean;
  required: boolean;
  backupCodesRemaining?: number;
}

export interface AdminTotpWithBackupCodes extends AdminTotpStatus {
  backupCodes: string[];
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

/** Recovery code input: `ABCDE-23456`, upper case, dash auto-inserted. */
export function formatRecoveryCode(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
}

export function isRecoveryCodeComplete(value: string): boolean {
  return /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(value);
}

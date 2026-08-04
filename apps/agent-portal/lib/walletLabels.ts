import type { WalletType } from "@asanpay/shared-types";

/** Product-facing names (§9.3): never "Wallet" — prepaid advance, not stored-value. */
export function walletDisplayName(walletType: WalletType | string): string {
  if (walletType === "main") return "Service Balance";
  if (walletType === "aeps") return "Earnings";
  return `${walletType} balance`;
}

export function formatInr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

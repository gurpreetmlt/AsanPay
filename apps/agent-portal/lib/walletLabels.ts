import type { WalletType } from "@asanpay/shared-types";

/**
 * Product-facing names (§9.3): never "Wallet".
 * main  = spendable advance (UI: Main)
 * aeps  = cash from customer AEPS services only (UI: AEPS)
 * DB still stores wallet_type main | aeps.
 */
export function walletDisplayName(walletType: WalletType | string): string {
  if (walletType === "main") return "Main";
  if (walletType === "aeps") return "AEPS";
  return `${walletType} balance`;
}

export function formatInr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

import type { WalletType } from "@asanpay/shared-types";

/** Product-facing names: main = Wallet 1, aeps = Wallet 2 */
export function walletDisplayName(walletType: WalletType | string): string {
  if (walletType === "main") return "Wallet 1";
  if (walletType === "aeps") return "Wallet 2";
  return `${walletType} wallet`;
}

export function formatInr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

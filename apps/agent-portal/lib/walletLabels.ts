import type { WalletType } from "@asanpay/shared-types";

/** Product-facing names: main = Main Wallet, aeps = AEPS Wallet */
export function walletDisplayName(walletType: WalletType | string): string {
  if (walletType === "main") return "Main Wallet";
  if (walletType === "aeps") return "AEPS Wallet";
  return `${walletType} wallet`;
}

export function formatInr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

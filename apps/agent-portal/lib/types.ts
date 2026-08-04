import type { UserRole, KycStatus, WalletType, CatalogCategory } from "@asanpay/shared-types";

export type CatalogCategoryView = CatalogCategory;

export interface WalletBalance {
  id: string;
  userId: string;
  walletType: WalletType;
  balance: string;
  /** Sum of open (pending/initiated) txn amounts for this wallet */
  pendingBalance?: string;
  version: number;
}

export interface DownlineUser {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: UserRole;
  kycStatus: KycStatus;
  isActive: boolean;
  mainBalance: string;
  /** AEPS / cash-in wallet balance when returned by downline/network APIs. */
  aepsBalance?: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  walletType: WalletType;
  entryType: "debit" | "credit";
  amount: string;
  balanceAfter: string;
  referenceType: string;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
}

export interface TxnRow {
  id: string;
  txnRef: string;
  amount: string;
  status: string;
  walletType: "main" | "aeps" | null;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  createdAt: string;
  completedAt: string | null;
}

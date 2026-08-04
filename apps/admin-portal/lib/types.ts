import type { UserRole, KycStatus, WalletType } from "@asanpay/shared-types";

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
  createdAt: string;
}

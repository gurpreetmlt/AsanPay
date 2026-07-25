import type { WalletType } from "@asanpay/shared-types";

export interface CatalogCategoryView {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  services: { id: string; code: string; name: string; badge: string | null }[];
}

export interface WalletBalance {
  id: string;
  userId: string;
  walletType: WalletType;
  balance: string;
  version: number;
}

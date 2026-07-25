import type { UserRole } from "@asanpay/shared-types";

export const CHILD_ROLE: Record<UserRole, UserRole | null> = {
  admin: "master_distributor",
  master_distributor: "distributor",
  distributor: "retailer",
  retailer: null,
};

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  master_distributor: "Master Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
};

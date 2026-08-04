import type { UserRole } from "@asanpay/shared-types";
import { ROLE_LABELS } from "@asanpay/shared-types";

export const CHILD_ROLE: Record<UserRole, UserRole | null> = {
  admin: "super_distributor",
  super_distributor: "distributor",
  distributor: "retailer",
  retailer: null,
};

export { ROLE_LABELS as ROLE_LABEL };

export function isPartnerRole(role: UserRole): boolean {
  return role === "super_distributor" || role === "distributor";
}

export function isRetailerRole(role: UserRole): boolean {
  return role === "retailer";
}

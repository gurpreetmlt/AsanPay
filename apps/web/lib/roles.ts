import type { UserRole } from "@asanpay/shared-types";
import { ROLE_LABELS } from "@asanpay/shared-types";

export const CHILD_ROLE: Record<UserRole, UserRole | null> = {
  admin: "master_distributor",
  master_distributor: "distributor",
  distributor: "retailer",
  retailer: null,
};

export const ROLE_LABEL = ROLE_LABELS;

export function isPartnerRole(role: UserRole): boolean {
  return role === "master_distributor" || role === "distributor";
}

export function isRetailerRole(role: UserRole): boolean {
  return role === "retailer";
}

export function getPortalSubtitle(role: UserRole | null): string {
  if (!role) return "Agent Login";
  if (role === "master_distributor") return "Super Distributor";
  if (role === "distributor") return "Distributor";
  if (role === "retailer") return "Retailer Agent";
  return ROLE_LABELS[role];
}

import type { AuthPortal, AuthUser, UserRole } from "@asanpay/shared-types";
import { AGENT_PORTAL_ROLES, isAdminRole, isAgentPortalRole, ROLE_LABELS } from "@asanpay/shared-types";

export { AGENT_PORTAL_ROLES, isAdminRole, isAgentPortalRole, ROLE_LABELS };

/** Who can onboard whom — one level down the hierarchy. */
export const CHILD_ROLE: Record<UserRole, UserRole | null> = {
  admin: "master_distributor",
  master_distributor: "distributor",
  distributor: "retailer",
  retailer: null,
};

export function assertPortalAccess(user: AuthUser, portal: AuthPortal): void {
  if (portal === "admin") {
    if (!isAdminRole(user.role)) {
      throw new Error("This account cannot access the admin portal. Use the agent app or web.");
    }
    return;
  }

  if (!isAgentPortalRole(user.role)) {
    throw new Error("Admin accounts must use the admin portal.");
  }
}

export function getPortalErrorMessage(user: AuthUser, portal: AuthPortal): string | null {
  try {
    assertPortalAccess(user, portal);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Portal access denied";
  }
}

/** Default route after login for web/mobile. */
export function getHomeRoute(_role: UserRole): string {
  return "/dashboard";
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

export function isPartnerRole(role: UserRole): boolean {
  return role === "master_distributor" || role === "distributor";
}

export function isRetailerRole(role: UserRole): boolean {
  return role === "retailer";
}

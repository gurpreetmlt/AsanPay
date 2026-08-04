import { BRAND_DEFAULTS, type UserRole } from "@asanpay/shared-types";

/**
 * White-label brand config. Defaults come from the single shared source
 * (@asanpay/shared-types BRAND_DEFAULTS) — override per deployment via env vars (set in
 * Coolify's Environment Variables for that app) — no code change needed to
 * launch a new brand on the same codebase/backend.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || BRAND_DEFAULTS.name,
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || BRAND_DEFAULTS.tagline,
  loginSubtitle: "Agent Login — Super Distributor, Distributor & Retailer",
} as const;

export const B = {
  blue: "#0B2A9A",
  blueMid: "#123A9E",
  blueLight: "#2A5CDD",
  green: "#12B76A",
  greenDark: "#0F9E5C",
  greenLight: "#24CC82",
  tagline: "#5A6DA8",
  muted: "#5A6DA8",
  bg: "#F0F4FF",
  secondary: "#E8EEFB",
  border: "rgba(11,42,154,0.1)",
  badgeGrad: "linear-gradient(135deg, #2A5CDD 0%, #0B2A9A 100%)",
  walletGrad: "linear-gradient(135deg, #24CC82 0%, #11A362 100%)",
} as const;

/** Login chip order: Retailer → Distributor → Super Dist. (all blue — same as Super/Dist). */
export const ROLES = [
  {
    id: "retailer" as const,
    label: "Retailer",
    shortLabel: "Retailer",
    badge: "R",
    color: B.blue,
    gradient: B.badgeGrad,
  },
  {
    id: "distributor" as const,
    label: "Distributor",
    shortLabel: "Distributor",
    badge: "D",
    color: B.blueMid,
    gradient: `linear-gradient(135deg,${B.blueLight},${B.blue})`,
  },
  {
    id: "super" as const,
    label: "Super Distributor",
    shortLabel: "Super Dist.",
    badge: "SD",
    color: B.blue,
    gradient: B.badgeGrad,
  },
];

export type Role = (typeof ROLES)[number];

export function roleFromUserRole(role: UserRole | null | undefined): Role {
  if (role === "super_distributor") {
    return ROLES.find((r) => r.id === "super") ?? ROLES[2];
  }
  if (role === "distributor") {
    return ROLES.find((r) => r.id === "distributor") ?? ROLES[1];
  }
  return ROLES.find((r) => r.id === "retailer") ?? ROLES[0];
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

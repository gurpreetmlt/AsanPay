import type { UserRole } from "@asanpay/shared-types";

/** AsanPay brand — from Figma Make "B2B Fintech App Design" */
export const brand = {
  name: "AsanPay",
  tagline: "HAR KADAM TARAKKI KI OR",
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
  if (role === "master_distributor") {
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

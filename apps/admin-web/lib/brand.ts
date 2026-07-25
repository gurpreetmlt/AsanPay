/**
 * AsanPay Admin brand.
 * Themeable tokens follow `html.dark` CSS vars — dark mode works automatically.
 * Keep badgeGrad / solid accents for CTAs.
 */
export const B = {
  /** Heading / primary text — follows light/dark */
  blue: "var(--admin-text)",
  blueMid: "var(--brand-blue-mid)",
  blueLight: "#2A5CDD",
  green: "#12B76A",
  greenDark: "#0F9E5C",
  muted: "var(--admin-muted)",
  bg: "var(--admin-bg)",
  secondary: "var(--admin-secondary)",
  border: "var(--admin-border)",
  card: "var(--admin-card)",
  /** Solid brand gradient for primary buttons (unchanged in dark) */
  badgeGrad: "linear-gradient(135deg, #2A5CDD 0%, #0B2A9A 100%)",
  danger: "#DC2626",
} as const;

export const ROLE_LABEL: Record<string, string> = {
  master_distributor: "Super Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
  admin: "Admin",
};

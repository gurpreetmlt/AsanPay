/** AsanPay brand palette — light top-left → dark bottom-right on gradients */
export const brand = {
  blue: { light: "#2A5CDD", dark: "#0B2A9A", flat: "#123A9E" },
  green: { light: "#24CC82", dark: "#11A362", flat: "#12B76A", payEnd: "#0F9E5C" },
  white: "#FFFFFF",
  wordmarkColor: "#0B2A9A",
  tagline: "#5A6DA8",
} as const;

export const colors = {
  // Brand blues
  blue: brand.blue.dark,
  blueLight: brand.blue.light,
  blueFlat: brand.blue.flat,
  bluePale: "#e8eef9",

  // Brand greens
  green: brand.green.flat,
  greenLight: brand.green.light,
  greenDark: brand.green.dark,
  greenPayEnd: brand.green.payEnd,
  greenBg: "#ecfdf3",

  // Hero / badge — royal blue gradient
  gradient: [brand.blue.light, brand.blue.dark] as const,
  // CTAs / wallet actions — green gradient
  gradientButton: [brand.green.light, brand.green.dark] as const,
  // Wordmark "Pay"
  gradientPay: [brand.green.flat, brand.green.payEnd] as const,
  gradientSoft: ["#e8eef9", "#ecfdf3"] as const,

  white: brand.white,
  wordmarkColor: brand.wordmarkColor,
  tagline: brand.tagline,
  taglineOnGradient: "rgba(255,255,255,0.82)",

  headerGlass: "rgba(255,255,255,0.14)",
  headerGlassBorder: "rgba(255,255,255,0.28)",

  glow: "rgba(255,255,255,0.16)",
  glowSoft: "rgba(255,255,255,0.08)",
  onGradient: brand.white,
  onGradientMuted: "rgba(255,255,255,0.82)",

  // Semantic — debit, logout, errors
  danger: "#dc2626",
  dangerDark: "#b91c1c",
  dangerBg: "#fef2f2",

  surface: "#f4f5f9",
  card: brand.white,
  border: "#e8e9f0",
  text: "#1f2333",
  textMuted: "#6b7280",
  textLight: "#9ca3af",
};

export const gradientDirection = {
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
};

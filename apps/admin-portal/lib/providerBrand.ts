import { hexAlpha } from "@/lib/bankLogo";

type ProviderBrand = { primary: string; secondary: string; domain?: string };

const PROVIDER_BRAND: Record<string, ProviderBrand> = {
  vyaparapi: { primary: "#6D28D9", secondary: "#F59E0B", domain: "vyaparapi.com" },
  instantpay: { primary: "#0B4EA2", secondary: "#1E88E5", domain: "instantpay.in" },
  paysprint: { primary: "#E31E24", secondary: "#B71C1C", domain: "paysprint.in" },
  eko: { primary: "#F5B301", secondary: "#E09B00", domain: "eko.in" },
};

const DEFAULT_BRAND: ProviderBrand = {
  primary: "#2A5CDD",
  secondary: "#0B2A9A",
};

/** Matches on code prefix so variants like `eko_aeps` share the parent brand. */
export function providerBrand(code: string): ProviderBrand {
  const c = code.toLowerCase();
  const key = Object.keys(PROVIDER_BRAND).find((k) => c === k || c.startsWith(k));
  return key ? PROVIDER_BRAND[key] : DEFAULT_BRAND;
}

export function providerLogoUrl(code: string): string | null {
  const { domain } = providerBrand(code);
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null;
}

export function providerInitials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

export function providerCardGradient(code: string): string {
  const { primary, secondary } = providerBrand(code);
  return `linear-gradient(135deg, #ffffff 0%, ${hexAlpha(primary, "12")} 55%, ${hexAlpha(secondary, "16")} 100%)`;
}

export function providerCardGlow(code: string): string {
  const { primary } = providerBrand(code);
  return `0 6px 8px rgba(15,23,42,0.04), 0 8px 20px ${hexAlpha(primary, "10")}`;
}

export function providerCardCornerGlows(code: string): {
  topRight: string;
  bottomLeft: string;
  border: string;
} {
  const { primary, secondary } = providerBrand(code);
  return {
    topRight: hexAlpha(secondary, "40"),
    bottomLeft: hexAlpha(primary, "28"),
    border: hexAlpha(primary, "22"),
  };
}

// Mirror of apps/agent-portal/lib/bankLogo.ts — keep the brand map in sync with it.

/** IFSC first 4 letters = bank code (e.g. SBIN, HDFC). */
export function bankCodeFromIfsc(ifsc: string): string {
  return ifsc.replace(/\s/g, "").slice(0, 4).toUpperCase();
}

/** Public bank logo CDN (Razorpay). Callers fall back to an icon if the image 404s. */
export function bankLogoUrl(ifsc: string): string {
  return `https://cdn.razorpay.com/bank/${bankCodeFromIfsc(ifsc)}.gif`;
}

type BankBrand = { primary: string; secondary: string };

const BANK_BRAND: Record<string, BankBrand> = {
  SBIN: { primary: "#1A237E", secondary: "#42A5F5" },
  HDFC: { primary: "#004C8F", secondary: "#ED1C24" },
  ICIC: { primary: "#F57C00", secondary: "#BF360C" },
  AXIS: { primary: "#97144D", secondary: "#E91E63" },
  UTIB: { primary: "#97144D", secondary: "#E91E63" },
  PUNB: { primary: "#C62828", secondary: "#FFC107" },
  BARB: { primary: "#F57C00", secondary: "#0D47A1" },
  CNRB: { primary: "#00695C", secondary: "#FF8F00" },
  UBIN: { primary: "#E65100", secondary: "#1565C0" },
  IDIB: { primary: "#005DA9", secondary: "#FDB913" },
  IOBA: { primary: "#283593", secondary: "#5C6BC0" },
  KKBK: { primary: "#C62828", secondary: "#EF5350" },
  YESB: { primary: "#0066B3", secondary: "#00BCD4" },
  FDRL: { primary: "#1565C0", secondary: "#42A5F5" },
  INDB: { primary: "#B71C1C", secondary: "#E53935" },
  BKID: { primary: "#1565C0", secondary: "#FF6F00" },
  CBIN: { primary: "#2E7D32", secondary: "#81C784" },
  MAHB: { primary: "#6A1B9A", secondary: "#AB47BC" },
  IDFB: { primary: "#9C1D3D", secondary: "#AD1457" },
  RATN: { primary: "#EF6C00", secondary: "#FF8A65" },
  AIRP: { primary: "#E53935", secondary: "#0277BD" },
};

const DEFAULT_BRAND: BankBrand = { primary: "#2A5CDD", secondary: "#0B2A9A" };

export function bankBrandColors(ifsc: string): BankBrand {
  return BANK_BRAND[bankCodeFromIfsc(ifsc)] || DEFAULT_BRAND;
}

export function hexAlpha(hex: string, alphaHex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  return `#${h}${alphaHex}`;
}

/** Soft white card wash tinted by the bank's logo colours. */
export function bankCardGradient(ifsc: string): string {
  const { primary, secondary } = bankBrandColors(ifsc);
  return `linear-gradient(135deg, #ffffff 0%, ${hexAlpha(primary, "12")} 55%, ${hexAlpha(secondary, "16")} 100%)`;
}

export function bankCardGlow(ifsc: string): string {
  const { primary } = bankBrandColors(ifsc);
  return `0 6px 8px rgba(15,23,42,0.04), 0 8px 20px ${hexAlpha(primary, "10")}`;
}

export function bankCardCornerGlows(ifsc: string): { topRight: string; bottomLeft: string; border: string } {
  const { primary, secondary } = bankBrandColors(ifsc);
  return {
    topRight: hexAlpha(secondary, "40"),
    bottomLeft: hexAlpha(primary, "28"),
    border: hexAlpha(primary, "22"),
  };
}

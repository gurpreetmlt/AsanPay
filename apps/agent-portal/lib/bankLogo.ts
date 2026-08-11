/** IFSC first 4 letters = bank code (e.g. SBIN, HDFC). */
export function bankCodeFromIfsc(ifsc: string): string {
  return ifsc.replace(/\s/g, "").slice(0, 4).toUpperCase();
}

/**
 * Public bank logo CDN (Razorpay). Falls back to Landmark icon if image 404s.
 * Example: https://cdn.razorpay.com/bank/SBIN.gif
 */
export function bankLogoUrl(ifsc: string): string {
  return `https://cdn.razorpay.com/bank/${bankCodeFromIfsc(ifsc)}.gif`;
}

/** Logo-inspired brand pair: primary = glow / accent, secondary = gradient blend. */
type BankBrand = { primary: string; secondary: string };

const BANK_BRAND: Record<string, BankBrand> = {
  SBIN: { primary: "#1A237E", secondary: "#42A5F5" }, // navy + SBI blue
  HDFC: { primary: "#004C8F", secondary: "#ED1C24" }, // navy + HDFC red
  ICIC: { primary: "#F57C00", secondary: "#BF360C" }, // orange
  AXIS: { primary: "#97144D", secondary: "#E91E63" }, // burgundy / magenta
  UTIB: { primary: "#97144D", secondary: "#E91E63" },
  PUNB: { primary: "#C62828", secondary: "#FFC107" }, // PNB red + gold
  BARB: { primary: "#F57C00", secondary: "#0D47A1" }, // BoB orange + blue
  CNRB: { primary: "#00695C", secondary: "#FF8F00" }, // teal + gold
  UBIN: { primary: "#E65100", secondary: "#1565C0" },
  // Indian Bank logo: navy wordmark + golden tri-curve mark (not teal).
  IDIB: { primary: "#005DA9", secondary: "#FDB913" },
  IOBA: { primary: "#283593", secondary: "#5C6BC0" },
  KKBK: { primary: "#C62828", secondary: "#EF5350" }, // Kotak red
  YESB: { primary: "#0066B3", secondary: "#00BCD4" },
  FDRL: { primary: "#1565C0", secondary: "#42A5F5" },
  // IndusInd logo: red / magenta family
  INDB: { primary: "#B71C1C", secondary: "#E53935" },
  BKID: { primary: "#1565C0", secondary: "#FF6F00" },
  CBIN: { primary: "#2E7D32", secondary: "#81C784" },
  MAHB: { primary: "#6A1B9A", secondary: "#AB47BC" },
  IDFB: { primary: "#9C1D3D", secondary: "#AD1457" }, // IDFC maroon
  RATN: { primary: "#EF6C00", secondary: "#FF8A65" },
  AIRP: { primary: "#E53935", secondary: "#0277BD" }, // Airtel red + blue
};

const BANK_NAMES: Record<string, string> = {
  SBIN: "State Bank of India",
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  AXIS: "Axis Bank",
  UTIB: "Axis Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  IDIB: "Indian Bank",
  IOBA: "Indian Overseas Bank",
  KKBK: "Kotak Mahindra Bank",
  YESB: "Yes Bank",
  FDRL: "Federal Bank",
  INDB: "IndusInd Bank",
  BKID: "Bank of India",
  CBIN: "Central Bank of India",
  MAHB: "Bank of Maharashtra",
  IDFB: "IDFC FIRST Bank",
  RATN: "RBL Bank",
  AIRP: "Airtel Payments Bank",
};

const DEFAULT_BRAND: BankBrand = { primary: "#2A5CDD", secondary: "#0B2A9A" };

export function bankBrandColors(ifsc: string): BankBrand {
  return BANK_BRAND[bankCodeFromIfsc(ifsc)] || DEFAULT_BRAND;
}

/** Primary brand tint (glow / border accent). */
export function bankBrandTint(ifsc: string): string {
  return bankBrandColors(ifsc).primary;
}

export function bankNameFromIfsc(ifsc: string): string | undefined {
  return BANK_NAMES[bankCodeFromIfsc(ifsc)];
}

/** AePS favourite / list bank `id` → Razorpay CDN bank code (IFSC prefix). */
const AEPS_BANK_LOGO_CODE: Record<string, string> = {
  bob: "BARB",
  pnb: "PUNB",
  sbi: "SBIN",
  hdfc: "HDFC",
  airtel: "AIRP",
  icici: "ICIC",
  boi: "BKID",
  canara: "CNRB",
  indian: "IDIB",
  union: "UBIN",
  kotak: "KKBK",
  axis: "UTIB",
  iob: "IOBA",
  central: "CBIN",
  bom: "MAHB",
  idbi: "IBKL",
  yes: "YESB",
  uco: "UCBA",
  indusind: "INDB",
  idfc: "IDFB",
  federal: "FDRL",
  rbl: "RATN",
};

/**
 * Logo URL for AePS bank picker. Same Razorpay CDN as settlement IFSC logos.
 * Returns null when unknown — caller shows letter fallback.
 */
export function aepsBankLogoUrl(bank: { id: string; name?: string }): string | null {
  const byId = AEPS_BANK_LOGO_CODE[bank.id.toLowerCase()];
  if (byId) return bankLogoUrl(`${byId}0000000`);
  const name = (bank.name || "").toLowerCase();
  for (const [code, label] of Object.entries(BANK_NAMES)) {
    const needle = label.toLowerCase().replace(/ bank$/i, "");
    if (needle.length >= 4 && name.includes(needle.slice(0, Math.min(12, needle.length)))) {
      return bankLogoUrl(`${code}0000000`);
    }
  }
  return null;
}

function hexAlpha(hex: string, alphaHex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  return `#${h}${alphaHex}`;
}

/**
 * Soft white card wash tinted by bank logo colors — matches mobile BankDetailCard fills.
 */
export function bankCardGradient(ifsc: string): string {
  const { primary, secondary } = bankBrandColors(ifsc);
  return `linear-gradient(135deg, #ffffff 0%, ${hexAlpha(primary, "12")} 55%, ${hexAlpha(secondary, "16")} 100%)`;
}

/** Light elevation only — no thick colored outer halo. */
export function bankCardGlow(ifsc: string, selected = false): string {
  const { primary } = bankBrandColors(ifsc);
  if (selected) {
    return `0 6px 12px ${hexAlpha(primary, "18")}, 0 10px 28px ${hexAlpha(primary, "14")}`;
  }
  return `0 6px 8px rgba(15,23,42,0.04), 0 8px 20px ${hexAlpha(primary, "10")}`;
}

/**
 * Soft corner circles (mobile ditto) — solid blobs, not full-bleed radials.
 */
export function bankCardCornerGlows(ifsc: string): {
  topRight: string;
  bottomLeft: string;
  border: string;
} {
  const { primary, secondary } = bankBrandColors(ifsc);
  return {
    topRight: hexAlpha(secondary, "40"),
    bottomLeft: hexAlpha(primary, "28"),
    border: hexAlpha(primary, "22"),
  };
}

export { hexAlpha };

export function formatSettlementBankCopy(details: {
  bankName?: string;
  branch?: string;
  city?: string;
  holderName: string;
  accountNumber: string;
  ifsc: string;
}): string {
  const lines = [
    details.bankName ? `Bank: ${details.bankName}` : null,
    details.branch ? `Branch: ${details.branch}` : null,
    details.city ? `City: ${details.city}` : null,
    `Account holder: ${details.holderName}`,
    `Account number: ${details.accountNumber}`,
    `IFSC: ${details.ifsc}`,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

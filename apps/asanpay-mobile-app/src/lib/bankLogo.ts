/** IFSC first 4 letters = bank code (e.g. SBIN, HDFC). */
export function bankCodeFromIfsc(ifsc: string): string {
  return ifsc.replace(/\s/g, "").slice(0, 4).toUpperCase();
}

/** Public bank logo CDN (Razorpay). Fallback to icon if image fails. */
export function bankLogoUrl(ifsc: string): string {
  return `https://cdn.razorpay.com/bank/${bankCodeFromIfsc(ifsc)}.gif`;
}

/** Logo-inspired brand pair: primary = glow / accent, secondary = gradient blend. */
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
  IDIB: { primary: "#00838F", secondary: "#004D40" },
  IOBA: { primary: "#283593", secondary: "#5C6BC0" },
  KKBK: { primary: "#C62828", secondary: "#EF5350" },
  YESB: { primary: "#0066B3", secondary: "#00BCD4" },
  FDRL: { primary: "#1565C0", secondary: "#42A5F5" },
  INDB: { primary: "#7B1FA2", secondary: "#C2185B" },
  BKID: { primary: "#1565C0", secondary: "#FF6F00" },
  CBIN: { primary: "#2E7D32", secondary: "#81C784" },
  MAHB: { primary: "#6A1B9A", secondary: "#AB47BC" },
  IDFB: { primary: "#9C1D3D", secondary: "#AD1457" },
  RATN: { primary: "#EF6C00", secondary: "#FF8A65" },
  AIRP: { primary: "#E53935", secondary: "#0277BD" },
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

export function bankBrandTint(ifsc: string): string {
  return bankBrandColors(ifsc).primary;
}

export function bankNameFromIfsc(ifsc: string): string | undefined {
  return BANK_NAMES[bankCodeFromIfsc(ifsc)];
}

function hexAlpha(hex: string, alphaHex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  return `#${h}${alphaHex}`;
}

/** Soft card fill colors for RN (no CSS gradient string). */
export function bankCardFillColors(ifsc: string): [string, string, string] {
  const { primary, secondary } = bankBrandColors(ifsc);
  return ["#ffffff", hexAlpha(primary, "22"), hexAlpha(secondary, "36")];
}

/** Glow shadow color = primary brand. */
export function bankCardGlowColor(ifsc: string): string {
  return bankBrandColors(ifsc).primary;
}

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

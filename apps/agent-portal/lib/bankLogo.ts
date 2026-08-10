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

/** Soft brand tint for card gradients (logo-inspired sky tones). */
const BANK_TINT: Record<string, string> = {
  SBIN: "#1E88E5",
  HDFC: "#1565C0",
  ICIC: "#F57C00",
  AXIS: "#97144D",
  PUNB: "#FFC107",
  BARB: "#0D47A1",
  CNRB: "#00695C",
  UBIN: "#E65100",
  IDIB: "#00838F",
  IOBA: "#283593",
  KKBK: "#C62828",
  YESB: "#0066B3",
  FDRL: "#1565C0",
  INDB: "#00695C",
  UTIB: "#97144D",
  BKID: "#1565C0",
  CBIN: "#2E7D32",
  MAHB: "#6A1B9A",
  IDFB: "#AD1457",
  RATN: "#EF6C00",
  AIRP: "#0277BD",
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

export function bankBrandTint(ifsc: string): string {
  return BANK_TINT[bankCodeFromIfsc(ifsc)] || "#2A5CDD";
}

export function bankNameFromIfsc(ifsc: string): string | undefined {
  return BANK_NAMES[bankCodeFromIfsc(ifsc)];
}

/** White → soft sky tint from bank brand (card background). */
export function bankCardGradient(ifsc: string): string {
  const tint = bankBrandTint(ifsc);
  return `linear-gradient(152deg, #ffffff 0%, #f7fbff 42%, ${tint}22 100%)`;
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

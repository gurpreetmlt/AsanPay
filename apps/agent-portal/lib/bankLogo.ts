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

export function bankBrandTint(ifsc: string): string {
  return BANK_TINT[bankCodeFromIfsc(ifsc)] || "#2A5CDD";
}

/** White → light sky tint from bank brand (card background). */
export function bankCardGradient(ifsc: string): string {
  const tint = bankBrandTint(ifsc);
  return `linear-gradient(145deg, #ffffff 0%, ${tint}18 48%, ${tint}28 100%)`;
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

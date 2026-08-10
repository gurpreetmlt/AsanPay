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

export function formatSettlementBankCopy(details: {
  holderName: string;
  accountNumber: string;
  ifsc: string;
}): string {
  return [
    `Account holder: ${details.holderName}`,
    `Account number: ${details.accountNumber}`,
    `IFSC: ${details.ifsc}`,
  ].join("\n");
}

/** Raw 12-digit Aadhaar (no spaces) — what we store in state and submit to the API. */
export function stripAadhaar(input: string): string {
  return input.replace(/\D/g, "").slice(0, 12);
}

/** Display formatting only — "1234 1234 1234". Never persist this; always store the raw digits. */
export function formatAadhaar(raw: string): string {
  const digits = stripAadhaar(raw);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

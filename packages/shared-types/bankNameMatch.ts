/** Typed beneficiary name vs the name the bank returned (bank names are upper case, with initials / titles). */

export type BankNameMatchLevel = "match" | "partial" | "mismatch";

export interface BankNameMatch {
  percent: number;
  level: BankNameMatchLevel;
}

const TITLES = new Set(["MR", "MRS", "MS", "MISS", "SMT", "SHRI", "SRI", "KUMARI", "KUM", "DR"]);

function tokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t));
}

/** Initial ("R") matches a full word starting with R at 0.8; whole words match at 1. */
export function bankNameMatch(typed: string, bankName: string): BankNameMatch {
  const a = tokens(typed);
  const b = tokens(bankName);
  if (a.length === 0 || b.length === 0) return { percent: 0, level: "mismatch" };
  if (a.join("") === b.join("")) return { percent: 100, level: "match" };

  const left = [...b];
  let score = 0;
  for (const t of a) {
    let idx = left.indexOf(t);
    if (idx >= 0) {
      score += 1;
      left.splice(idx, 1);
      continue;
    }
    idx = left.findIndex((u) => (u.length === 1 || t.length === 1) && u[0] === t[0]);
    if (idx >= 0) {
      score += 0.8;
      left.splice(idx, 1);
    }
  }
  const percent = Math.round(((2 * score) / (a.length + b.length)) * 100);
  return { percent, level: percent >= 80 ? "match" : percent >= 50 ? "partial" : "mismatch" };
}

export const BANK_NAME_MATCH_COPY: Record<BankNameMatchLevel, string> = {
  match: "Name matches the bank",
  partial: "Name partly matches the bank — check before saving",
  mismatch: "Name does not match the bank — check the account number",
};

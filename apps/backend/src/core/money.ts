// Money type for the ledger engine: BIGINT paise, carried in JS as `bigint`.
//
// This is deliberately separate from `modules/wallet/decimal.ts`, which converts the LEGACY
// numeric(14,2) rupee columns (`wallets.balance`, `wallet_ledger_entries.amount`) to/from
// `number` paise. The two coexist until every balance-mutating path is switched to
// postJournal(); do not mix them in one calculation.
//
// Never use `number` here. Drizzle's bigint({ mode: "number" }) silently loses precision past
// 2^53 paise, and any float arithmetic on money is a defect regardless of magnitude.

import { HttpError } from "../utils/httpError";

/** Amount in paise. Always a whole number of paise, may be negative only in derived figures. */
export type Paise = bigint;

const PAISE_PER_RUPEE = 100n;

/**
 * Parse a decimal rupee string ("1234.56", "-12", "1,234.5") into paise.
 * Integer string math only — no parseFloat, so no binary-float rounding can touch a money value.
 * More than 2 decimal places is rounded half-up on the 3rd digit, matching the legacy
 * `decimal.ts` behaviour so a migrated commission rule never silently loses value.
 */
export function rupeesToPaise(rupees: string): Paise {
  const t = rupees.trim().replace(/,/g, "");
  if (!/^[-+]?\d*(\.\d*)?$/.test(t) || t === "" || t === "." || t === "-" || t === "+") {
    throw new Error(`Not a valid rupee amount: ${JSON.stringify(rupees)}`);
  }

  const neg = t.startsWith("-");
  const [whole = "", fracRaw = ""] = t.replace(/^[-+]/, "").split(".");

  let frac: bigint;
  if (fracRaw.length <= 2) {
    frac = BigInt((fracRaw + "00").slice(0, 2));
  } else {
    frac = BigInt(fracRaw.slice(0, 2)) + (Number(fracRaw[2]) >= 5 ? 1n : 0n);
  }

  const paise = BigInt(whole || "0") * PAISE_PER_RUPEE + frac;
  return neg ? -paise : paise;
}

/** Format paise as a plain decimal rupee string ("1234.56"). Safe for JSON transport. */
export function paiseToRupees(paise: Paise): string {
  const neg = paise < 0n;
  const abs = neg ? -paise : paise;
  const whole = abs / PAISE_PER_RUPEE;
  const frac = abs % PAISE_PER_RUPEE;
  return `${neg ? "-" : ""}${whole}.${String(frac).padStart(2, "0")}`;
}

/** Indian-grouped display string ("₹12,34,567.89"). Presentation only — never parse this back. */
export function formatINR(paise: Paise): string {
  const plain = paiseToRupees(paise);
  const neg = plain.startsWith("-");
  const [whole = "0", frac = "00"] = (neg ? plain.slice(1) : plain).split(".");

  // Indian grouping: last 3 digits, then pairs.
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;

  return `${neg ? "-" : ""}₹${grouped}.${frac}`;
}

export function sumPaise(amounts: readonly Paise[]): Paise {
  return amounts.reduce<Paise>((acc, a) => acc + a, 0n);
}

/**
 * Guard for amounts crossing the ledger boundary. `ledger_entries.amount` has a
 * CHECK (amount > 0) — direction is carried by `direction`, never by a negative amount.
 */
export function assertPositiveAmount(paise: Paise, label = "amount"): Paise {
  const n = typeof paise === "bigint" ? paise : BigInt(paise as unknown as string | number | bigint);
  if (n <= 0n) {
    throw new HttpError(422, `${label} must be greater than zero`, "INVALID_AMOUNT");
  }
  return n;
}

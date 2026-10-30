import { HttpError } from "../../utils/httpError";

// Defaults only — admin changes them in Platform Settings → Money limits (platformLimits.service).
/** Provider caps a single Airtel DMT transfer at ₹5,000. */
export const DMT_PER_TXN_LIMIT_RUPEES = 5_000;
export const DMT_REMITTER_MONTHLY_LIMIT_RUPEES = 25_000;
export const DMT_AGENT_DAILY_LIMIT_RUPEES = 200_000;
export const ADMIN_MANUAL_FUND_DAILY_LIMIT_RUPEES = 1_000_000;

/** Money-transfer service codes; every one shares the same remitter / agent limits. */
export const DMT_SERVICE_CODES = ["dmt", "DMT", "MONEY_TRANSFER"] as const;

/** DMT statuses that consume a limit — anything that may still move (or has moved) money. */
export const DMT_LIMIT_STATUSES = ["success", "pending", "initiated"] as const;

export function isDmtServiceCode(code: string): boolean {
  return (DMT_SERVICE_CODES as readonly string[]).includes(code);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** UTC instant of 00:00 IST on the IST calendar day containing `now`. */
export function istDayStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

/** UTC instant of 00:00 IST on the 1st of the IST calendar month containing `now`. */
export function istMonthStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
}

/** "₹25,000" / "₹2,00,000" / "₹1,234.50" — Indian digit grouping. */
export function formatRupees(rupees: number): string {
  const hasPaise = Math.round(rupees * 100) % 100 !== 0;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export interface DmtLimitInput {
  /** Principal of the transfer being attempted, in paise. */
  amountPaise: number;
  /** This remitter's DMT principal already used this IST month (success + pending + initiated). */
  remitterMonthPaise: number;
  /** This agent's DMT principal already used today (IST). */
  agentDayPaise: number;
}

export interface DmtLimits {
  perTxnRupees: number;
  remitterMonthlyRupees: number;
  agentDailyRupees: number;
}

export const DEFAULT_DMT_LIMITS: DmtLimits = {
  perTxnRupees: DMT_PER_TXN_LIMIT_RUPEES,
  remitterMonthlyRupees: DMT_REMITTER_MONTHLY_LIMIT_RUPEES,
  agentDailyRupees: DMT_AGENT_DAILY_LIMIT_RUPEES,
};

export interface DmtLimitViolation {
  code: "DMT_PER_TXN_LIMIT" | "DMT_REMITTER_MONTHLY_LIMIT" | "DMT_AGENT_DAILY_LIMIT";
  message: string;
}

/** First DMT limit the attempted transfer would break, or null when it fits all of them. */
export function checkDmtLimits(input: DmtLimitInput, limits: DmtLimits = DEFAULT_DMT_LIMITS): DmtLimitViolation | null {
  const perTxnPaise = Math.round(limits.perTxnRupees * 100);
  if (input.amountPaise > perTxnPaise) {
    return {
      code: "DMT_PER_TXN_LIMIT",
      message: `A single money transfer cannot be more than ${formatRupees(limits.perTxnRupees)}. Enter a smaller amount.`,
    };
  }

  const remitterCapPaise = Math.round(limits.remitterMonthlyRupees * 100);
  if (input.remitterMonthPaise + input.amountPaise > remitterCapPaise) {
    const leftPaise = Math.max(0, remitterCapPaise - input.remitterMonthPaise);
    return {
      code: "DMT_REMITTER_MONTHLY_LIMIT",
      message:
        leftPaise === 0
          ? `This remitter has reached the ${formatRupees(limits.remitterMonthlyRupees)} monthly limit. Try again next month.`
          : `This remitter can send only ${formatRupees(leftPaise / 100)} more this month (monthly limit ${formatRupees(limits.remitterMonthlyRupees)}). Enter a smaller amount.`,
    };
  }

  const agentCapPaise = Math.round(limits.agentDailyRupees * 100);
  if (input.agentDayPaise + input.amountPaise > agentCapPaise) {
    const leftPaise = Math.max(0, agentCapPaise - input.agentDayPaise);
    return {
      code: "DMT_AGENT_DAILY_LIMIT",
      message:
        leftPaise === 0
          ? `You have reached the ${formatRupees(limits.agentDailyRupees)} daily money transfer limit. Try again tomorrow.`
          : `You can send only ${formatRupees(leftPaise / 100)} more in money transfers today (daily limit ${formatRupees(limits.agentDailyRupees)}). Enter a smaller amount.`,
    };
  }

  return null;
}

export function assertDmtLimits(input: DmtLimitInput, limits: DmtLimits = DEFAULT_DMT_LIMITS): void {
  const violation = checkDmtLimits(input, limits);
  if (violation) throw new HttpError(422, violation.message, violation.code);
}

/** Rejects a manual top-up that would push this admin's IST-day total past the cap. */
export function assertManualFundDailyCap(
  todayPaise: number,
  amountPaise: number,
  capRupees: number = ADMIN_MANUAL_FUND_DAILY_LIMIT_RUPEES,
): void {
  if (todayPaise + amountPaise > Math.round(capRupees * 100)) {
    throw new HttpError(
      422,
      `Daily manual top-up limit of ${formatRupees(capRupees)} reached. Raise it in Platform Settings → Money limits, or top up again tomorrow.`,
      "MANUAL_FUND_DAILY_LIMIT_EXCEEDED",
    );
  }
}

/** Rejects an admin credit override above what the retailer asked for. */
export function assertCreditWithinRequested(creditPaise: bigint, requestedPaise: bigint): void {
  if (creditPaise > requestedPaise) {
    throw new HttpError(
      422,
      `Credit amount cannot be more than the requested amount ${formatRupees(Number(requestedPaise) / 100)}`,
      "CREDIT_ABOVE_REQUESTED",
    );
  }
}

/** Uppercase, strip everything but letters and digits — the form UTR uniqueness is checked on. */
export function normaliseBankUtr(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

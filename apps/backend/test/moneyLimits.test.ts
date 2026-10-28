import { describe, expect, it } from "vitest";
import {
  assertCreditWithinRequested,
  assertDmtLimits,
  assertManualFundDailyCap,
  checkDmtLimits,
  formatRupees,
  isDmtServiceCode,
  istDayStart,
  istMonthStart,
  normaliseBankUtr,
  type DmtLimits,
} from "../src/modules/limits/moneyLimits";
import { reconDaysToRun } from "../src/modules/providers/noble/reconJob";
import { HttpError } from "../src/utils/httpError";

const LIMITS: DmtLimits = { perTxnRupees: 25_000, remitterMonthlyRupees: 25_000, agentDailyRupees: 200_000 };
const rs = (rupees: number) => rupees * 100;

describe("checkDmtLimits", () => {
  it("accepts a transfer that fits every limit, including landing exactly on a cap", () => {
    expect(checkDmtLimits({ amountPaise: rs(5_000), remitterMonthPaise: 0, agentDayPaise: 0 }, LIMITS)).toBeNull();
    expect(
      checkDmtLimits({ amountPaise: rs(5_000), remitterMonthPaise: rs(20_000), agentDayPaise: rs(195_000) }, LIMITS),
    ).toBeNull();
  });

  it("rejects a single transfer above the per-transaction max", () => {
    const v = checkDmtLimits({ amountPaise: rs(25_000) + 1, remitterMonthPaise: 0, agentDayPaise: 0 }, LIMITS);
    expect(v?.code).toBe("DMT_PER_TXN_LIMIT");
    expect(v?.message).toContain("₹25,000");
  });

  it("rejects when the remitter has used the whole month", () => {
    const v = checkDmtLimits({ amountPaise: rs(100), remitterMonthPaise: rs(25_000), agentDayPaise: 0 }, LIMITS);
    expect(v?.code).toBe("DMT_REMITTER_MONTHLY_LIMIT");
    expect(v?.message).toBe("This remitter has reached the ₹25,000 monthly limit. Try again next month.");
  });

  it("tells how much the remitter can still send when partly used", () => {
    const v = checkDmtLimits({ amountPaise: rs(10_000), remitterMonthPaise: rs(18_000), agentDayPaise: 0 }, LIMITS);
    expect(v?.code).toBe("DMT_REMITTER_MONTHLY_LIMIT");
    expect(v?.message).toContain("only ₹7,000 more this month");
  });

  it("rejects when the agent's IST-day DMT total would pass ₹2,00,000", () => {
    const full = checkDmtLimits({ amountPaise: rs(1), remitterMonthPaise: 0, agentDayPaise: rs(200_000) }, LIMITS);
    expect(full?.code).toBe("DMT_AGENT_DAILY_LIMIT");
    expect(full?.message).toContain("₹2,00,000");
    const partial = checkDmtLimits({ amountPaise: rs(10_000), remitterMonthPaise: 0, agentDayPaise: rs(195_000) }, LIMITS);
    expect(partial?.message).toContain("only ₹5,000 more");
  });

  it("assertDmtLimits throws a 422 HttpError", () => {
    try {
      assertDmtLimits({ amountPaise: rs(30_000), remitterMonthPaise: 0, agentDayPaise: 0 }, LIMITS);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(422);
      expect((err as HttpError).code).toBe("DMT_PER_TXN_LIMIT");
    }
  });

  it("recognises DMT service codes only", () => {
    expect(isDmtServiceCode("dmt")).toBe(true);
    expect(isDmtServiceCode("MONEY_TRANSFER")).toBe(true);
    expect(isDmtServiceCode("aeps_cash_withdrawal")).toBe(false);
  });
});

describe("IST day / month boundaries", () => {
  it("starts the day at 00:00 IST (18:30 UTC the day before)", () => {
    // 20:00 UTC on 24 Oct = 01:30 IST on 25 Oct
    expect(istDayStart(new Date("2026-10-24T20:00:00Z")).toISOString()).toBe("2026-10-24T18:30:00.000Z");
    // 17:00 UTC on 24 Oct = 22:30 IST on 24 Oct
    expect(istDayStart(new Date("2026-10-24T17:00:00Z")).toISOString()).toBe("2026-10-23T18:30:00.000Z");
  });

  it("starts the month at 00:00 IST on the 1st", () => {
    // 19:00 UTC on 31 Oct = 00:30 IST on 1 Nov
    expect(istMonthStart(new Date("2026-10-31T19:00:00Z")).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(istMonthStart(new Date("2026-10-15T10:00:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });
});

describe("manual top-up daily cap", () => {
  it("allows up to the cap and rejects beyond it", () => {
    expect(() => assertManualFundDailyCap(rs(900_000), rs(100_000), 1_000_000)).not.toThrow();
    expect(() => assertManualFundDailyCap(rs(900_000), rs(100_000) + 1, 1_000_000)).toThrowError(
      "Daily manual top-up limit of ₹10,00,000 reached. A second admin must approve further top-ups tomorrow or raise the limit.",
    );
  });
});

describe("fund request credit override", () => {
  it("rejects a credit above the requested amount", () => {
    expect(() => assertCreditWithinRequested(500_000n, 500_000n)).not.toThrow();
    expect(() => assertCreditWithinRequested(500_001n, 500_000n)).toThrowError(
      "Credit amount cannot be more than the requested amount ₹5,000",
    );
  });
});

describe("UTR normalisation + rupee format", () => {
  it("normalises case and separators", () => {
    expect(normaliseBankUtr(" utr-1234 5678 ")).toBe("UTR12345678");
  });
  it("formats rupees with Indian grouping", () => {
    expect(formatRupees(200_000)).toBe("₹2,00,000");
    expect(formatRupees(1234.5)).toBe("₹1,234.50");
  });
});

describe("reconDaysToRun", () => {
  it("before 00:30 IST only catches up yesterday without re-sending", () => {
    // 18:45 UTC = 00:15 IST
    expect(reconDaysToRun(new Date("2026-10-24T18:45:00Z"))).toEqual([
      { day: "2026-10-24", resubmitIfStale: false },
    ]);
  });
  it("after 00:30 IST re-sends yesterday when it went out incomplete", () => {
    // 19:15 UTC = 00:45 IST on 25 Oct
    expect(reconDaysToRun(new Date("2026-10-24T19:15:00Z"))).toEqual([
      { day: "2026-10-24", resubmitIfStale: true },
    ]);
  });
  it("after 23:15 IST also sends today", () => {
    // 17:50 UTC = 23:20 IST on 24 Oct
    expect(reconDaysToRun(new Date("2026-10-24T17:50:00Z"))).toEqual([
      { day: "2026-10-23", resubmitIfStale: true },
      { day: "2026-10-24", resubmitIfStale: false },
    ]);
  });
});

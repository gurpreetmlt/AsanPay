import { describe, it, expect } from "vitest";
import {
  rupeesToPaise,
  paiseToRupees,
  formatINR,
  sumPaise,
  assertPositiveAmount,
} from "../src/core/money";

describe("core/money — BIGINT paise", () => {
  it("round-trips without precision loss", () => {
    for (const v of ["0.00", "0.01", "12.34", "99999999999.99", "-45.60"]) {
      expect(paiseToRupees(rupeesToPaise(v))).toBe(v);
    }
  });

  it("survives amounts past Number.MAX_SAFE_INTEGER paise", () => {
    // 10^15 rupees is 10^17 paise, well past 2^53. This is exactly the case where
    // bigint({ mode: "number" }) would silently corrupt a balance.
    const huge = rupeesToPaise("1000000000000000.00");
    expect(huge).toBe(100000000000000000n);
    expect(paiseToRupees(huge + 1n)).toBe("1000000000000000.01");
  });

  it("rounds half-up on the third decimal, never in the payer's favour", () => {
    expect(rupeesToPaise("0.005")).toBe(1n);
    expect(rupeesToPaise("0.004")).toBe(0n);
    expect(rupeesToPaise("1.235")).toBe(124n);
  });

  it("rejects anything that is not a number", () => {
    for (const bad of ["abc", "", "1.2.3", "12rs", "-"]) {
      expect(() => rupeesToPaise(bad)).toThrow();
    }
  });

  it("formats with Indian digit grouping", () => {
    expect(formatINR(rupeesToPaise("1234.56"))).toBe("₹1,234.56");
    expect(formatINR(rupeesToPaise("123456.78"))).toBe("₹1,23,456.78");
    expect(formatINR(rupeesToPaise("-500"))).toBe("-₹500.00");
  });

  it("sums exactly", () => {
    const parts = ["0.10", "0.20", "0.30"].map(rupeesToPaise);
    // The classic float trap: 0.1 + 0.2 + 0.3 !== 0.6 in binary floating point.
    expect(paiseToRupees(sumPaise(parts))).toBe("0.60");
  });

  it("guards the ledger's amount > 0 constraint before the database has to", () => {
    expect(() => assertPositiveAmount(0n)).toThrow();
    expect(() => assertPositiveAmount(-1n)).toThrow();
    expect(assertPositiveAmount(1n)).toBe(1n);
  });
});

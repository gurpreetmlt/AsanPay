import { describe, expect, it } from "vitest";
import {
  providerBankList,
  requireAepsBank,
  requireCashDepositBank,
} from "../src/modules/providers/noble/aepsBanks";

describe("provider AEPS + Cash Deposit bank lists", () => {
  const banks = providerBankList();

  it("has every live AEPS bank and every named Cash Deposit bank, without the test bank", () => {
    expect(banks.filter((b) => b.aepsEnabled)).toHaveLength(135);
    expect(banks.filter((b) => b.cashDepositEnabled)).toHaveLength(61);
    expect(new Set(banks.map((b) => b.iin)).size).toBe(banks.length);
    expect(banks.some((b) => b.iin === "900010")).toBe(false);
  });

  it("lists Cash Deposit-only banks as not AEPS-enabled", () => {
    expect(banks.find((b) => b.iin === "607053")).toEqual({
      iin: "607053",
      name: "Saptagiri Grameena Bank",
      aepsEnabled: false,
      cashDepositEnabled: true,
    });
  });

  it("allows SBI for AEPS but refuses it for Cash Deposit", () => {
    expect(requireAepsBank("607094")).toBe("State Bank of India");
    expect(() => requireCashDepositBank("607094")).toThrow(
      expect.objectContaining({ statusCode: 422, code: "CASH_DEPOSIT_BANK_NOT_LIVE" }),
    );
  });

  it("refuses an IIN that is not on the live AEPS list", () => {
    expect(() => requireAepsBank("YES000")).toThrow(expect.objectContaining({ code: "AEPS_BANK_NOT_LIVE" }));
    expect(() => requireAepsBank("607053")).toThrow(expect.objectContaining({ code: "AEPS_BANK_NOT_LIVE" }));
  });

  it("names Cash Deposit banks from either list", () => {
    expect(requireCashDepositBank("607153")).toBe("Axis Bank");
    expect(requireCashDepositBank("607200")).toBe("Saurashtra Gramin Bank");
  });
});

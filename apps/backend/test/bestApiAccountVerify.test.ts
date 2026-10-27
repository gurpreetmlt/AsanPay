import { describe, it, expect } from "vitest";
import { classifyBestApiAccount } from "../src/modules/providers/bestapi/accountVerify";

const ok = (response: Record<string, unknown>) => ({
  success: true,
  data: { Errorcode: 100, status: "Success", msg: "Fetch Successfully", mode: "PD", response },
  error: null,
});

describe("classifyBestApiAccount", () => {
  it("returns the bank name on success", () => {
    const r = classifyBestApiAccount(
      200,
      ok({ beneficiary_name: "DEMO SINGH", account_status: "ACTIVE", bank_name: "Demo Bank", branch_name: "MAIN" }),
    );
    expect(r).toEqual({ outcome: "verified", beneficiaryName: "DEMO SINGH", bankName: "Demo Bank", branchName: "MAIN", mode: "PD" });
  });

  it("treats a closed account as invalid (no fallback to the paid provider)", () => {
    const r = classifyBestApiAccount(200, ok({ beneficiary_name: "DEMO SINGH", account_status: "CLOSED" }));
    expect(r.outcome).toBe("invalid");
  });

  it("falls back when the name is missing", () => {
    expect(classifyBestApiAccount(200, ok({ account_status: "ACTIVE" })).outcome).toBe("error");
  });

  it("treats 'invalid account' failures as invalid", () => {
    const r = classifyBestApiAccount(200, { success: false, data: { status: "Failed", msg: "Invalid account number" } });
    expect(r.outcome).toBe("invalid");
  });

  it("falls back on provider errors", () => {
    expect(classifyBestApiAccount(502, { message: "Bad gateway" }).outcome).toBe("error");
    expect(classifyBestApiAccount(200, { success: false, data: { status: "Failed", msg: "Service down" } }).outcome).toBe("error");
  });
});

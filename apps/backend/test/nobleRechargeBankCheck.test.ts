import { beforeEach, describe, expect, it, vi } from "vitest";

const noblePost = vi.fn();
vi.mock("../src/modules/providers/noble/client", () => ({ noblePost: (...a: unknown[]) => noblePost(...a) }));
vi.mock("../src/modules/verifications/verificationRouting.service", () => ({ isVerificationOn: async () => true }));
vi.mock("../src/cache/redis", () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => undefined),
}));
vi.mock("../src/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config/env")>()),
  isNobleConfigured: () => true,
}));

import { NobleAdapter } from "../src/modules/providers/adapters/noble.adapter";
import { nobleBankAccountCheck } from "../src/modules/providers/noble/bankVerify";
import { clearRechargeDetectCache } from "../src/modules/providers/noble/rechargeOperators";

const adapter = new NobleAdapter();

beforeEach(() => {
  noblePost.mockReset();
  clearRechargeDetectCache();
});

function rechargeWith(submitJson: Record<string, unknown>, accountRef = "98765 43210") {
  noblePost
    .mockResolvedValueOnce({
      httpStatus: 200,
      json: { status: 1, responseData: [{ operatorCodeB2B: "AIRTEL_B2B", circleCode: "30" }] },
    })
    .mockResolvedValueOnce({ httpStatus: 200, json: submitJson });
  return adapter.recharge({
    retailerUserId: "u1",
    serviceCode: "MOBILE_PREPAID",
    operatorCode: "AT",
    accountRef,
    amount: "299",
    clientRef: "LKP2610280001AB",
  });
}

describe("Noble recharge submit", () => {
  it("sends the digits-only number", async () => {
    await rechargeWith({ status: 1, responseData: [{ tranStatus: "Success", apiTransactionId: "API9" }] });
    expect(noblePost.mock.calls[1]![2]).toMatchObject({ rechargeNumber: "9876543210", transactionId: "LKP2610280001AB" });
  });

  it("is success only on tranStatus Success", async () => {
    const r = await rechargeWith({ status: 1, responseData: [{ tranStatus: "Success", apiTransactionId: "API9" }] });
    expect(r.status).toBe("success");
  });

  it("stays pending when status is 1 but tranStatus is missing", async () => {
    const r = await rechargeWith({ status: 1, responseData: [{ apiTransactionId: "API9" }] });
    expect(r.status).toBe("pending");
    expect(r.success).toBe(false);
  });

  it("fails on tranStatus Failed", async () => {
    const r = await rechargeWith({ status: 1, responseData: [{ tranStatus: "Failed" }] });
    expect(r.status).toBe("failed");
  });
});

describe("Noble recharge status", () => {
  const check = (providerTxnId: string | null, createdAt = new Date()) =>
    adapter.checkStatus({
      providerTxnId,
      clientRef: "LKP2610280001AB",
      txnDate: "2026-10-27",
      serviceCode: "MOBILE_PREPAID",
      createdAt,
    });
  const failedReply = (row: Record<string, unknown> = {}) => ({
    httpStatus: 200,
    json: { status: 1, statusCode: "RE0001", responseData: [{ tranStatus: "Failed", ...row }] },
  });

  it("keeps a fresh unknown-id 'Failed' pending (provider never received it)", async () => {
    noblePost.mockResolvedValueOnce(failedReply({ apiTransactionId: "", operatorTransactionId: "" }));
    const r = await check(null);
    expect(r.status).toBe("pending");
    expect(r.success).toBe(false);
  });

  it("fails when the 'Failed' row carries the provider transaction id", async () => {
    noblePost.mockResolvedValueOnce(failedReply({ apiTransactionId: "2202231910362280426" }));
    const r = await check(null);
    expect(r.status).toBe("failed");
  });

  it("fails when the 'Failed' row carries the operator transaction id", async () => {
    noblePost.mockResolvedValueOnce(failedReply({ operatorTransactionId: "OP123" }));
    const r = await check(null);
    expect(r.status).toBe("failed");
  });

  it("fails an id-less 'Failed' once the recharge is 30 minutes old", async () => {
    noblePost.mockResolvedValueOnce(failedReply());
    const r = await check(null, new Date(Date.now() - 31 * 60 * 1000));
    expect(r.status).toBe("failed");
  });

  it("keeps an id-less 'Failed' pending at 29 minutes", async () => {
    noblePost.mockResolvedValueOnce(failedReply());
    const r = await check(null, new Date(Date.now() - 29 * 60 * 1000));
    expect(r.status).toBe("pending");
  });

  it("treats Success as final even without ids", async () => {
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: 1, responseData: [{ tranStatus: "Success" }] } });
    const r = await check(null);
    expect(r.status).toBe("success");
  });

  it("queries by apiTransactionId (ATI) when the provider id is known", async () => {
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: 1, responseData: [{ tranStatus: "Success" }] } });
    const r = await check("2202231910362280426");
    expect(noblePost.mock.calls[0]![2]).toEqual({
      statusBy: "ATI",
      apiTransactionId: "2202231910362280426",
      transactionId: "",
      transactionDate: "",
    });
    expect(r.status).toBe("success");
  });

  it("falls back to our id + IST date (TI_TD)", async () => {
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: 1, responseData: [{ tranStatus: "Pending" }] } });
    const r = await check(null);
    expect(noblePost.mock.calls[0]![2]).toEqual({
      statusBy: "TI_TD",
      apiTransactionId: "",
      transactionId: "LKP2610280001AB",
      transactionDate: "2026-10-27",
    });
    expect(r.status).toBe("pending");
  });
});

describe("Noble bank account check", () => {
  const run = (httpStatus: number, json: Record<string, unknown>) => {
    noblePost.mockResolvedValueOnce({ httpStatus, json });
    return nobleBankAccountCheck("pennyless", { accountNumber: "001201601234", ifsc: "ICIC0000012", transactionId: "BNC123456789" });
  };

  it("returns the beneficiary name on tranStatus Success", async () => {
    const r = await run(200, { status: 1, responseData: [{ beneficiaryName: " DEMO SINGH ", tranStatus: "Success" }] });
    expect(r.status).toBe("success");
    expect(r.data.beneficiaryName).toBe("DEMO SINGH");
  });

  it("fails when the bank returns no account (status 1 + Failed)", async () => {
    const r = await run(200, { status: 1, responseData: [{ beneficiaryName: "", tranStatus: "Failed" }] });
    expect(r.status).toBe("failed");
  });

  it("fails on an explicit status 0 rejection", async () => {
    const r = await run(200, { status: 0, statusCode: "VR0002", responseData: "[]" });
    expect(r.status).toBe("failed");
  });

  it("stays pending on a provider error (status -1)", async () => {
    const r = await run(200, { status: -1, statusCode: "VR0003", responseData: "[]" });
    expect(r.status).toBe("pending");
  });

  it("stays pending on an unknown tranStatus", async () => {
    const r = await run(200, { status: 1, responseData: [{ tranStatus: "Initiated" }] });
    expect(r.status).toBe("pending");
  });
});

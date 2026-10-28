import { beforeEach, describe, expect, it, vi } from "vitest";

const noblePost = vi.fn();
const remitterMobile = vi.fn();
const beneList = vi.fn();
vi.mock("../src/modules/providers/noble/client", () => ({ noblePost: (...a: unknown[]) => noblePost(...a) }));
vi.mock("../src/modules/providers/noble/airtelDmt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/modules/providers/noble/airtelDmt")>();
  return {
    ...actual,
    dmtRemitterMobileForTxn: (...a: unknown[]) => remitterMobile(...a),
    nobleBeneList: (...a: unknown[]) => beneList(...a),
    resolveAirtelMerchantCtx: vi.fn(async () => ({
      merchantMobile: "9829098290",
      latitude: "12.9715",
      longitude: "77.5945",
      retailerCode: "RID9950244184",
    })),
  };
});

import { NobleAdapter } from "../src/modules/providers/adapters/noble.adapter";

const adapter = new NobleAdapter();
const HOUR = 60 * 60 * 1000;
const TXN_ID = "NDMT0123456789AB";

function check(json: Record<string, unknown>, ageMs = 5 * 60 * 1000, httpStatus = 200) {
  noblePost.mockResolvedValueOnce({ httpStatus, json });
  return adapter.checkStatus({
    providerTxnId: null,
    clientRef: TXN_ID,
    serviceCode: "dmt",
    createdAt: new Date(Date.now() - ageMs),
  });
}

const statusRow = (transactionStatus: string) => ({
  status: 1,
  statusCode: "DB0031",
  responseData: [{ transactionId: TXN_ID, rrn: "518120786738", charges: "12", transactionStatus }],
});

beforeEach(() => {
  noblePost.mockReset();
  remitterMobile.mockReset().mockResolvedValue("9680976136");
  beneList.mockReset().mockResolvedValue([
    { name: "Test Singh", accountNumber: "465464654646", ifsc: "ICIC0000012", bank: "ICICI Bank", mobile: "9680976135" },
  ]);
});

describe("DMT status check", () => {
  it("sends the remitter mobile and the OTP-time transaction id", async () => {
    await check(statusRow("Success"));
    expect(noblePost.mock.calls[0]?.[1]).toBe("/api/v1.0/airtel_dmt/transaction_status");
    expect(noblePost.mock.calls[0]?.[2]).toEqual({ mobileNumber: "9680976136", transactionId: TXN_ID });
  });

  it("reads transactionStatus: Success / Failed / Refunded are final, Pending is not", async () => {
    expect((await check(statusRow("Success"))).status).toBe("success");
    expect((await check(statusRow("Failed"))).status).toBe("failed");
    expect((await check(statusRow("Refunded"))).status).toBe("failed");
    expect((await check(statusRow("Pending"))).status).toBe("pending");
    expect((await check(statusRow("On Hold"))).status).toBe("pending");
  });

  it("status 1 without transactionStatus is not treated as paid", async () => {
    expect((await check({ status: 1, statusCode: "DB0031", responseData: [{}] }, 3 * HOUR)).status).toBe("pending");
  });

  it("'No records found' (DB0042) is pending at first and failed after an hour", async () => {
    const noRecord = { status: -1, statusCode: "DB0042", message: "DB Response", description: "No records found" };
    expect((await check(noRecord, 10 * 60 * 1000)).status).toBe("pending");
    expect((await check(noRecord, 2 * HOUR)).status).toBe("failed");
  });

  it("gateway errors and other codes stay pending", async () => {
    expect((await check({ status: -1, message: "<html>502</html>" }, 3 * HOUR, 502)).status).toBe("pending");
    expect((await check({ status: 0, statusCode: "PM0002" }, 3 * HOUR)).status).toBe("pending");
  });

  it("stays pending without calling the provider when the remitter mobile is unknown", async () => {
    remitterMobile.mockResolvedValueOnce(null);
    const r = await adapter.checkStatus({ providerTxnId: null, clientRef: TXN_ID, serviceCode: "dmt", createdAt: new Date(0) });
    expect(r.status).toBe("pending");
    expect(noblePost).not.toHaveBeenCalled();
  });
});

describe("DMT transfer", () => {
  const params = {
    retailerUserId: "u1",
    customerMobile: "9680976136",
    accountNumber: "465464654646",
    ifsc: "ICIC0000012",
    amount: "5000",
    mode: "imps" as const,
    otp: "123456",
    referenceKey: `verify-token~${TXN_ID}`,
    externalRef: "AP261028XYZ",
  };

  it("posts the documented body with the OTP-time transaction id", async () => {
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: statusRow("Success") });
    const r = await adapter.dmtTransfer(params);
    expect(r.status).toBe("success");
    expect(noblePost.mock.calls[0]?.[2]).toEqual({
      mobileNumber: "9680976136",
      latitude: "12.9715",
      longitude: "77.5945",
      otp: "123456",
      amount: "5000",
      transactionId: TXN_ID,
      token: "verify-token",
      retailerId: "RID9950244184",
      beneName: "Test Singh",
      bankName: "ICICI Bank",
      ifsc: "ICIC0000012",
      beneAccountNumber: "465464654646",
      beneMobileNumber: "9680976135",
      transferMode: "IMPS",
    });
  });

  it("status 1 without transactionStatus is pending (initiated), status 0 is failed", async () => {
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: 1, statusCode: "SS0011", responseData: [{}] } });
    const pending = await adapter.dmtTransfer(params);
    expect(pending.status).toBe("pending");
    expect(pending.providerTxnId).toBe(TXN_ID);
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: 0, statusCode: "VF0003" } });
    expect((await adapter.dmtTransfer(params)).status).toBe("failed");
  });

  it("refuses before the provider call: amount outside ₹100–₹5,000, bad OTP, no OTP session, unknown bene", async () => {
    await expect(adapter.dmtTransfer({ ...params, amount: "5001" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(adapter.dmtTransfer({ ...params, amount: "99" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(adapter.dmtTransfer({ ...params, otp: "1234" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(adapter.dmtTransfer({ ...params, referenceKey: "verify-token" })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(adapter.dmtTransfer({ ...params, ifsc: "SBIN0000001" })).rejects.toMatchObject({ statusCode: 422 });
    expect(noblePost).not.toHaveBeenCalled();
  });

  it("transaction OTP enforces the same amount range", async () => {
    await expect(
      adapter.dmtGenerateTransactionOtp({ retailerUserId: "u1", customerMobile: "9680976136", amount: "25000", referenceKey: "x".repeat(8) }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(noblePost).not.toHaveBeenCalled();
  });
});

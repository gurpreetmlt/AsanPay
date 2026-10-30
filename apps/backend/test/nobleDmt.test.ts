import { beforeEach, describe, expect, it, vi } from "vitest";

const noblePost = vi.fn();
const remitterMobile = vi.fn();
const beneList = vi.fn();
const railState = new Map<string, Record<string, unknown>>();
vi.mock("../src/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/env")>();
  return { ...actual, isNobleConfigured: () => true };
});
vi.mock("../src/modules/providers/noble/client", () => ({ noblePost: (...a: unknown[]) => noblePost(...a) }));
vi.mock("../src/modules/providers/noble/aepsOps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/modules/providers/noble/aepsOps")>();
  return {
    ...actual,
    resolveNobleAgentContext: vi.fn(async () => ({
      uniqueAgentId: "AGENT-HANDLE",
      endpointIp: "49.36.182.114",
      latitude: "12.9715",
      longitude: "77.5945",
      channel: "WEB",
      mobileDeviceId: "u1",
      userAgent: "AsanPayAndroid",
      live: true,
    })),
  };
});
vi.mock("../src/modules/providers/noble/airtelDmt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/modules/providers/noble/airtelDmt")>();
  return {
    ...actual,
    dmtRemitterForTxn: (...a: unknown[]) => remitterMobile(...a),
    nobleBeneList: (...a: unknown[]) => beneList(...a),
    loadRailFlowState: vi.fn(async (rail: string, u: string, m: string) => railState.get(`${rail}:${u}:${m}`) ?? null),
    saveRailFlowState: vi.fn(async (rail: string, u: string, m: string, s: Record<string, unknown>) => {
      railState.set(`${rail}:${u}:${m}`, s);
    }),
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
  railState.clear();
  remitterMobile.mockReset().mockResolvedValue({ mobile: "9680976136", rail: "airtel" });
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

describe("Jio DMT", () => {
  const MOBILE = "9680976136";
  const COMMON = {
    uniqueAgentId: "AGENT-HANDLE",
    channel: "MOB",
    deviceOsType: "ANDROID",
    latitude: "12.9715",
    longitude: "77.5945",
    publicIp: "49.36.182.114",
  };
  const ok = (responseData: unknown[] = []) => ({ httpStatus: 200, json: { status: 1, statusCode: "SS0011", message: "Success", responseData } });
  const registered = ok([
    {
      registered: true,
      remittanceUserId: "13456763222000259",
      firstName: "Demo",
      middleName: "",
      lastName: "Singh",
      limits: { yearlyLimit: 300000, yearlyCount: 1, monthlyLimit: 25000, monthlyCount: 1, dailyLimit: 25000, dailyCount: 1 },
    },
  ]);

  async function otpFor(amount: string) {
    noblePost.mockResolvedValueOnce(registered);
    await adapter.dmtRemitterProfile({ retailerUserId: "u1", customerMobile: MOBILE, rail: "jio", channel: "MOB" });
    noblePost.mockResolvedValueOnce(ok());
    const otp = await adapter.dmtGenerateTransactionOtp({
      retailerUserId: "u1",
      customerMobile: MOBILE,
      amount,
      referenceKey: "13456763222000259",
      rail: "jio",
      channel: "MOB",
    });
    return otp.data.referenceKey;
  }

  const transfer = (referenceKey: string, over: Record<string, unknown> = {}) =>
    adapter.dmtTransfer({
      retailerUserId: "u1",
      customerMobile: MOBILE,
      accountNumber: "465464654646",
      ifsc: "ICIC0000012",
      amount: "100",
      mode: "imps",
      otp: "123456",
      referenceKey,
      rail: "jio",
      channel: "MOB",
      ...over,
    });

  it("remitter_login: registered remitter returns a profile keyed by remittanceUserId", async () => {
    noblePost.mockResolvedValueOnce(registered);
    const r = await adapter.dmtRemitterProfile({ retailerUserId: "u1", customerMobile: MOBILE, rail: "jio", channel: "MOB" });
    expect(noblePost.mock.calls[0]?.[1]).toBe("/api/v1.0/jio_dmt/remitter_login");
    expect(noblePost.mock.calls[0]?.[2]).toEqual({ ...COMMON, remitterMobile: MOBILE });
    expect(r.data.profile?.referenceKey).toBe("13456763222000259");
    expect(r.data.profile?.isNeftAllowed).toBe(false);
    expect(r.data.profile?.beneficiaries).toHaveLength(1);
  });

  it("remitter_login: unregistered remitter returns a registration key and no profile", async () => {
    noblePost.mockResolvedValueOnce(ok([{ registered: false }]));
    const r = await adapter.dmtRemitterProfile({ retailerUserId: "u1", customerMobile: MOBILE, rail: "jio" });
    expect(r.data.profile).toBeNull();
    expect(r.data.referenceKey?.length).toBeGreaterThanOrEqual(8);
  });

  it("transfer reuses the OTP-time id and amount and posts every documented field", async () => {
    const key = await otpFor("100");
    const otpTxnId = key.split("~")[1];
    expect(otpTxnId).toHaveLength(15);
    noblePost.mockResolvedValueOnce({
      httpStatus: 200,
      json: { status: 1, statusCode: "DB0031", message: "Success", responseData: [{ transactionStatus: "Success", transactionId: otpTxnId, rrn: "6260107319000" }] },
    });
    const r = await transfer(key);
    expect(r.status).toBe("success");
    expect(r.providerTxnId).toBe(otpTxnId);
    expect(noblePost.mock.calls[2]?.[1]).toBe("/api/v1.0/jio_dmt/txn_verify_submit");
    expect(noblePost.mock.calls[2]?.[2]).toEqual({
      ...COMMON,
      remitterMobile: MOBILE,
      remittanceUserId: "13456763222000259",
      remitterName: "Demo Singh",
      beneName: "Test Singh",
      beneAccountAlias: "Test Singh",
      beneAccountNo: "465464654646",
      beneIfscCode: "ICIC0000012",
      amount: "100",
      transferMode: "IMPS",
      otp: "123456",
      transactionId: otpTxnId,
      deviceId: "",
      deviceOsVer: "",
      deviceModel: "",
    });
  });

  it("refuses before the provider call: amount changed after OTP, NEFT, decimals, replayed OTP", async () => {
    const key = await otpFor("100");
    noblePost.mockReset();
    await expect(transfer(key, { amount: "200" })).rejects.toMatchObject({ statusCode: 422 });
    await expect(transfer(key, { mode: "neft" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(transfer(key, { amount: "100.50" })).rejects.toMatchObject({ statusCode: 400 });
    expect(noblePost).not.toHaveBeenCalled();
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: -1, statusCode: "SS0013", message: "Pending", responseData: [] } });
    expect((await transfer(key)).status).toBe("pending");
    await expect(transfer(key)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("status check goes to txn_status for transfers sent via Jio", async () => {
    remitterMobile.mockResolvedValueOnce({ mobile: MOBILE, rail: "jio" });
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: statusRow("Success") });
    const r = await adapter.checkStatus({ providerTxnId: null, clientRef: TXN_ID, serviceCode: "dmt", createdAt: new Date() });
    expect(r.status).toBe("success");
    expect(noblePost.mock.calls[0]?.[1]).toBe("/api/v1.0/jio_dmt/txn_status");
    expect(noblePost.mock.calls[0]?.[2]).toEqual({ mobileNumber: MOBILE, transactionId: TXN_ID });
  });

  it("agent-side refusals become a clear next step", async () => {
    noblePost.mockResolvedValueOnce({
      httpStatus: 200,
      json: { status: -1, statusCode: "SS0013", message: "Error", description: "Agent KYC is Required", responseData: [] },
    });
    await expect(
      adapter.dmtRemitterProfile({ retailerUserId: "u1", customerMobile: MOBILE, rail: "jio" }),
    ).rejects.toMatchObject({ statusCode: 422, code: "JIO_DMT_AGENT_KYC" });
  });
});

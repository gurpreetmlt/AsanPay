import { beforeEach, describe, expect, it, vi } from "vitest";

const noblePost = vi.fn();
vi.mock("../src/modules/providers/noble/client", () => ({ noblePost: (...a: unknown[]) => noblePost(...a) }));
vi.mock("../src/modules/providers/noble/aepsOps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/modules/providers/noble/aepsOps")>();
  return {
    ...actual,
    resolveNobleAgentContext: vi.fn(async () => ({
      uniqueAgentId: "AGENT1",
      endpointIp: "1.2.3.4",
      latitude: "12.9715",
      longitude: "77.5945",
      channel: "APP",
      mobileDeviceId: "DEV",
      userAgent: "test",
      live: true,
    })),
  };
});

import { NobleAdapter } from "../src/modules/providers/adapters/noble.adapter";

const adapter = new NobleAdapter();
const HOUR = 60 * 60 * 1000;

function check(serviceCode: string, json: Record<string, unknown>, ageMs = 5 * 60 * 1000, httpStatus = 200) {
  noblePost.mockResolvedValueOnce({ httpStatus, json });
  return adapter.checkStatus({
    providerTxnId: null,
    clientRef: "NDMT123456789",
    txnDate: "2026-10-28",
    serviceCode,
    createdAt: new Date(Date.now() - ageMs),
  });
}

beforeEach(() => noblePost.mockReset());

describe("Noble status checks never guess a final answer", () => {
  it("explicit SUCCESS / FAILED are final", async () => {
    expect((await check("aeps_cash_withdrawal", { status: 1, responseData: [{ tranStatus: "SUCCESS" }] })).status).toBe("success");
    expect((await check("aeps_cash_withdrawal", { status: 1, responseData: [{ tranStatus: "Failed" }] })).status).toBe("failed");
  });

  it("gateway error / HTML page stays pending", async () => {
    expect((await check("aeps_cash_withdrawal", { status: -1, message: "<html>502</html>" }, HOUR * 3, 502)).status).toBe("pending");
  });

  it("unknown tranStatus stays pending", async () => {
    expect((await check("aeps_cash_withdrawal", { status: 1, responseData: [{ tranStatus: "HOLD" }] })).status).toBe(
      "pending",
    );
  });

  it("status 1 without tranStatus is not treated as paid", async () => {
    expect((await check("aeps_cash_withdrawal", { status: 1, responseData: [{}] })).status).toBe("pending");
  });

  it("'no record' is never final, however old the txn", async () => {
    const noRecord = { status: 0, statusCode: "AG0003", message: "No Records Found" };
    expect((await check("aeps_cash_withdrawal", noRecord, 10 * 60 * 1000)).status).toBe("pending");
    expect((await check("aeps_cash_withdrawal", noRecord, 48 * HOUR)).status).toBe("pending");
  });

  it("other status 0 replies on a status check stay pending", async () => {
    expect((await check("aeps_cash_withdrawal", { status: 0, statusCode: "XX9999", message: "Try later" }, 2 * HOUR)).status).toBe(
      "pending",
    );
  });

  it("AEPS 'No Records Found' (status -1 / AG0003, as documented) stays pending", async () => {
    const noRecord = { status: -1, statusCode: "AG0003", message: "Error", description: "No Records Found" };
    expect((await check("aeps_cash_withdrawal", noRecord, 10 * 60 * 1000)).status).toBe("pending");
    expect((await check("aeps_cash_deposit", noRecord, 48 * HOUR)).status).toBe("pending");
  });

  it("AG0003 with any other text is a generic error, never final", async () => {
    const other = { status: -1, statusCode: "AG0003", message: "Error", description: "Invalid transactionDate" };
    expect((await check("aeps_cash_withdrawal", other, 3 * HOUR)).status).toBe("pending");
  });

  it("tranStatus is ignored unless status = 1", async () => {
    const odd = { status: 0, statusCode: "AG0002", responseData: [{ tranStatus: "Failed" }] };
    expect((await check("aeps_cash_withdrawal", odd, 3 * HOUR)).status).toBe("pending");
  });

  it("status check for a txn created near IST midnight never fails on 'no record'", async () => {
    const noRecord = { status: -1, statusCode: "AG0003", description: "No Records Found" };
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: noRecord });
    const r = await adapter.checkStatus({
      providerTxnId: null,
      clientRef: "AP261027ABC123",
      serviceCode: "aeps_cash_withdrawal",
      // 23:55 IST on 27 Oct = 18:25 UTC
      createdAt: new Date("2026-10-27T18:25:00Z"),
    });
    expect(r.status).toBe("pending");
    expect(noblePost.mock.calls[0]?.[2]).toEqual({ transactionId: "AP261027ABC123", transactionDate: "27/10/2026" });
  });
});

describe("AEPS money submits need an explicit tranStatus", () => {
  const params = {
    retailerUserId: "u1",
    aadhaarNumber: "987654321234",
    bankIin: "607094",
    mobile: "9876543210",
    biometricPayload: "<PidData/>",
    amount: "2000",
    externalRef: "AP261028ABC123",
  };

  it("status 1 without tranStatus stays pending; explicit Success / Failed are final", async () => {
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: 1, responseData: [{}] } });
    expect((await adapter.aepsWithdraw(params)).status).toBe("pending");
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: 1, responseData: [{ tranStatus: "Success" }] } });
    expect((await adapter.aepsWithdraw(params)).status).toBe("success");
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: 0, statusCode: "VF0003" } });
    expect((await adapter.aepsDeposit({ ...params, bankIin: "607153" })).status).toBe("failed");
    expect(noblePost.mock.calls[0]?.[2]).toMatchObject({ bankName: "State Bank of India", bioType: "0" });
    expect(noblePost.mock.calls[2]?.[2]).toMatchObject({ bankName: "Axis Bank", bankIn: "607153" });
  });

  it("refuses a bank that is not on the live list before calling the provider", async () => {
    await expect(adapter.aepsDeposit(params)).rejects.toMatchObject({ code: "CASH_DEPOSIT_BANK_NOT_LIVE" });
    await expect(adapter.aepsWithdraw({ ...params, bankIin: "YES000" })).rejects.toMatchObject({
      code: "AEPS_BANK_NOT_LIVE",
    });
    expect(noblePost).not.toHaveBeenCalled();
  });
});

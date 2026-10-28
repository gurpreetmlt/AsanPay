import { beforeEach, describe, expect, it, vi } from "vitest";

const noblePost = vi.fn();
vi.mock("../src/modules/providers/noble/client", () => ({ noblePost: (...a: unknown[]) => noblePost(...a) }));

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
  it("DMT recheck queries the id it is given", async () => {
    await check("dmt", { status: 1, responseData: [{ tranStatus: "SUCCESS" }] });
    expect(noblePost.mock.calls[0]?.[2]).toEqual({ transactionId: "NDMT123456789" });
  });

  it("explicit SUCCESS / FAILED are final", async () => {
    expect((await check("dmt", { status: 1, responseData: [{ tranStatus: "SUCCESS" }] })).status).toBe("success");
    expect((await check("dmt", { status: 1, responseData: [{ tranStatus: "Failed" }] })).status).toBe("failed");
  });

  it("gateway error / HTML page stays pending", async () => {
    expect((await check("dmt", { status: -1, message: "<html>502</html>" }, HOUR * 3, 502)).status).toBe("pending");
  });

  it("unknown tranStatus stays pending", async () => {
    expect((await check("aeps_cash_withdrawal", { status: 1, responseData: [{ tranStatus: "HOLD" }] })).status).toBe(
      "pending",
    );
  });

  it("status 1 without tranStatus is not treated as paid", async () => {
    expect((await check("aeps_cash_withdrawal", { status: 1, responseData: [{}] })).status).toBe("pending");
  });

  it("'no record' is pending at first and failed after an hour", async () => {
    const noRecord = { status: 0, statusCode: "AG0003", message: "No Records Found" };
    expect((await check("dmt", noRecord, 10 * 60 * 1000)).status).toBe("pending");
    expect((await check("dmt", noRecord, 2 * HOUR)).status).toBe("failed");
  });

  it("other status 0 replies on a status check stay pending", async () => {
    expect((await check("dmt", { status: 0, statusCode: "XX9999", message: "Try later" }, 2 * HOUR)).status).toBe(
      "pending",
    );
  });
});

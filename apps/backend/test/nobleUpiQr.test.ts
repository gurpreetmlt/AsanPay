import { beforeEach, describe, expect, it, vi } from "vitest";

const noblePost = vi.fn();
vi.mock("../src/modules/providers/noble/client", () => ({ noblePost: (...a: unknown[]) => noblePost(...a) }));

import { NobleAdapter } from "../src/modules/providers/adapters/noble.adapter";
import { nobleUpiQrCollect } from "../src/modules/providers/noble/upiQr.service";

const adapter = new NobleAdapter();

function statusReply(json: Record<string, unknown>) {
  return { httpStatus: 200, json };
}

function check(createdAgoMs: number) {
  return adapter.checkStatus({
    providerTxnId: "API1",
    clientRef: "LKP2026TEST0001",
    txnDate: "2026-10-26",
    serviceCode: "UPI_CASH_POINT",
    createdAt: new Date(Date.now() - createdAgoMs),
  });
}

beforeEach(() => noblePost.mockReset());

describe("UPI QR status", () => {
  it("queries upiqr_status with our txnRef and DD/MM/YYYY", async () => {
    noblePost.mockResolvedValueOnce(statusReply({ status: 1, responseData: [{ tranStatus: "PENDING" }] }));
    await check(10_000);
    expect(noblePost).toHaveBeenCalledWith("aeps", "/v2.0/aeps/upiqr_status", {
      transactionId: "LKP2026TEST0001",
      transactionDate: "26/10/2026",
    });
  });

  it("success only on explicit tranStatus SUCCESS, keeps the RRN", async () => {
    noblePost.mockResolvedValueOnce(
      statusReply({ status: 1, responseData: [{ tranStatus: "SUCCESS", rrn: "617210123456", apiTransactionId: "API9" }] }),
    );
    const r = await check(60_000);
    expect(r.status).toBe("success");
    expect(r.providerTxnId).toBe("API9");
    expect(r.data.rrn).toBe("617210123456");
  });

  it("status 1 without tranStatus is not treated as paid", async () => {
    noblePost.mockResolvedValueOnce(statusReply({ status: 1, responseData: [{}] }));
    expect((await check(60_000)).status).toBe("pending");
  });

  it("expired / failed are terminal with clear reasons", async () => {
    noblePost.mockResolvedValueOnce(statusReply({ status: 1, responseData: [{ tranStatus: "EXPIRED" }] }));
    const expired = await check(60_000);
    expect(expired.status).toBe("failed");
    expect(expired.message).toBe("QR expired before the customer paid");

    noblePost.mockResolvedValueOnce(statusReply({ status: 1, responseData: [{ tranStatus: "Failed" }] }));
    expect((await check(60_000)).message).toBe("The customer's UPI payment failed");
  });

  it("no record: pending while young, failed after the grace window", async () => {
    const noRecord = { status: -1, statusCode: "AG0003", description: "No Records Found" };
    noblePost.mockResolvedValueOnce(statusReply(noRecord));
    expect((await check(60_000)).status).toBe("pending");
    noblePost.mockResolvedValueOnce(statusReply(noRecord));
    const old = await check(16 * 60_000);
    expect(old.status).toBe("failed");
    expect(old.message).toBe("The customer did not pay this QR");
  });

  it("other provider errors stay pending", async () => {
    noblePost.mockResolvedValueOnce({ httpStatus: 500, json: { status: -1, statusCode: "AG0099" } });
    expect((await check(60 * 60_000)).status).toBe("pending");
  });
});

describe("UPI QR generate", () => {
  const ctx = {
    uniqueAgentId: "AGENT",
    channel: "APP",
    mobileDeviceId: "DEV",
    ipAddress: "1.1.1.1",
    userAgent: "test",
    latitude: "12.9715",
    longitude: "77.5945",
    live: true,
  } as unknown as Parameters<typeof nobleUpiQrCollect>[0];
  const input = { amount: "500", mobileNumber: "9876543210", transactionId: "LKP2026TEST0002" };

  it("generated QR is pending (not paid) and sends our txnRef", async () => {
    noblePost.mockResolvedValueOnce({
      httpStatus: 200,
      json: { status: 1, responseData: [{ qr: "upi://pay?pa=x@bank", apiTransactionId: "API2" }] },
    });
    const r = await nobleUpiQrCollect(ctx, input);
    expect(r.status).toBe("pending");
    expect(r.data.qr).toBe("upi://pay?pa=x@bank");
    expect(noblePost.mock.calls[0]![2]).toMatchObject({ transactionId: "LKP2026TEST0002", amount: "500" });
  });

  it("provider rejection fails with the provider reason", async () => {
    noblePost.mockResolvedValueOnce({
      httpStatus: 200,
      json: { status: -1, statusCode: "AG0010", description: "KYC pending for agent" },
    });
    const r = await nobleUpiQrCollect(ctx, input);
    expect(r.status).toBe("failed");
    expect(r.message).toBe("UPI QR not generated: KYC pending for agent");
  });
});

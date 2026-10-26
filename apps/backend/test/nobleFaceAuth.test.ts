import { beforeEach, describe, expect, it, vi } from "vitest";

const noblePost = vi.fn();
vi.mock("../src/modules/providers/noble/client", () => ({ noblePost: (...a: unknown[]) => noblePost(...a) }));
vi.mock("../src/modules/providers/noble/aepsOps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/modules/providers/noble/aepsOps")>();
  return {
    ...actual,
    resolveNobleAgentContext: vi.fn(async () => ({
      uniqueAgentId: "AGENT1",
      endpointIp: "1.1.1.1",
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
import { nobleBioType } from "../src/modules/providers/noble/aepsOps";
import { nobleApDaily2fa, nobleApKyc } from "../src/modules/onboarding/nobleAepsSession.service";

const adapter = new NobleAdapter();
const ok = { httpStatus: 200, json: { status: 1, responseData: [{ tranStatus: "SUCCESS" }] } };

function sentBody(): Record<string, unknown> {
  return noblePost.mock.calls[0]![2] as Record<string, unknown>;
}

beforeEach(() => {
  noblePost.mockReset();
  noblePost.mockResolvedValue(ok);
});

describe("bioType mapping (0 = finger, 2 = face)", () => {
  it("maps capture type", () => {
    expect(nobleBioType()).toBe("0");
    expect(nobleBioType("FINGER")).toBe("0");
    expect(nobleBioType("FACE")).toBe("2");
  });

  it("AEPS daily 2FA sends bioType 2 for face, 0 by default", async () => {
    const base = { retailerUserId: "u1", aadhaarNumber: "123412341234", biometricPayload: "<PidData/>" };
    await adapter.agentAuth({ ...base, captureType: "FACE" });
    expect(noblePost.mock.calls[0]![1]).toBe("/v2.0/aeps/daily_2fa");
    expect(sentBody().bioType).toBe("2");
    noblePost.mockClear();
    await adapter.agentAuth(base);
    expect(sentBody().bioType).toBe("0");
  });

  it("Aadhaar Pay transaction sends customer face as bioType 2", async () => {
    await adapter.aadhaarPay({
      retailerUserId: "u1",
      aadhaarNumber: "123412341234",
      bankIin: "607094",
      mobile: "9876543210",
      biometricPayload: "<PidData/>",
      amount: "500",
      captureType: "FACE",
    });
    expect(noblePost.mock.calls[0]![1]).toBe("/v2.0/aeps/ap_transaction");
    expect(sentBody().bioType).toBe("2");
  });

  it("Aadhaar Pay KYC and daily 2FA pass the capture type through", async () => {
    await nobleApKyc("u1", { biometricPayload: "<PidData/>", dob: "20/10/1985", captureType: "FACE" });
    expect(noblePost.mock.calls[0]![1]).toBe("/v2.0/aeps/ap_kyc");
    expect(sentBody().bioType).toBe("2");

    noblePost.mockClear();
    await nobleApDaily2fa("u1", { biometricPayload: "<PidData/>", captureType: "FACE" });
    expect(noblePost.mock.calls[0]![1]).toBe("/v2.0/aeps/ap_daily_2fa");
    expect(sentBody().bioType).toBe("2");

    noblePost.mockClear();
    await nobleApDaily2fa("u1", { biometricPayload: "<PidData/>" });
    expect(sentBody().bioType).toBe("0");
  });

  it("face failure message says face, not fingerprint", async () => {
    noblePost.mockResolvedValueOnce({ httpStatus: 200, json: { status: -1, statusCode: "AG0050" } });
    await expect(
      nobleApDaily2fa("u1", { biometricPayload: "<PidData/>", captureType: "FACE" }),
    ).rejects.toThrow(/face/i);
  });
});

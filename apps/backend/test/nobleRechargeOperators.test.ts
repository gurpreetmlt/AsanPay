import { beforeEach, describe, expect, it, vi } from "vitest";

const noblePost = vi.fn();
vi.mock("../src/modules/providers/noble/client", () => ({ noblePost: (...a: unknown[]) => noblePost(...a) }));
vi.mock("../src/cache/redis", () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => undefined),
}));

import {
  belongsToOperator,
  clearRechargeDetectCache,
  resolveRechargeRoute,
} from "../src/modules/providers/noble/rechargeOperators";

function detectReply(operatorCodeB2B: string, circleCode: string) {
  return {
    httpStatus: 200,
    json: { status: 1, responseData: [{ operatorCodeB2B, circleCode, remark: "PREPAID" }] },
  };
}

beforeEach(() => {
  noblePost.mockReset();
  clearRechargeDetectCache();
});

describe("belongsToOperator", () => {
  it("matches operator families", () => {
    expect(belongsToOperator("AT", "AIRTEL_B2B")).toBe(true);
    expect(belongsToOperator("VI", "VODAFONE_B2B")).toBe(true);
    expect(belongsToOperator("VI", "VI_B2B")).toBe(true);
    expect(belongsToOperator("VI", "VIDEOCON_B2B")).toBe(false);
    expect(belongsToOperator("JIO", "AIRTEL_B2B")).toBe(false);
  });
});

describe("resolveRechargeRoute", () => {
  it("uses detected operator + circle for mobile", async () => {
    noblePost.mockResolvedValueOnce(detectReply("AIRTEL_B2B", "30"));
    const r = await resolveRechargeRoute({ serviceCode: "MOBILE_PREPAID", operatorCode: "AT", accountRef: "9876543210" });
    expect(r).toEqual({ ok: true, operatorCode: "AIRTEL_B2B", circleCode: "30", source: "detected" });
  });

  it("caches detection per number", async () => {
    noblePost.mockResolvedValueOnce(detectReply("AIRTEL_B2B", "30"));
    await resolveRechargeRoute({ operatorCode: "AT", accountRef: "9876543210" });
    await resolveRechargeRoute({ operatorCode: "AT", accountRef: "9876543210" });
    expect(noblePost).toHaveBeenCalledTimes(1);
  });

  it("refuses a recharge when the number is on another operator", async () => {
    noblePost.mockResolvedValueOnce(detectReply("JIO_B2B", "10"));
    const r = await resolveRechargeRoute({ operatorCode: "AT", accountRef: "9876543210" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("This number is on Jio, not Airtel. Select Jio and try again.");
  });

  it("falls back to the default circle when detection fails", async () => {
    noblePost.mockRejectedValueOnce(new Error("network"));
    const r = await resolveRechargeRoute({ operatorCode: "AT", accountRef: "9876543210" });
    expect(r).toEqual({ ok: true, operatorCode: "AIRTEL_B2B", circleCode: "50", source: "fallback" });
  });

  it("maps DTH operators without a lookup", async () => {
    const r = await resolveRechargeRoute({ serviceCode: "DTH", operatorCode: "DTV", accountRef: "01528277123" });
    expect(r).toEqual({ ok: true, operatorCode: "DISHTV_B2B", circleCode: "50", source: "dth" });
    expect(noblePost).not.toHaveBeenCalled();
  });
});

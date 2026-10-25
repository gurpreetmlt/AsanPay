import { describe, expect, it } from "vitest";
import { istDate, reconBatchId, reconLine } from "../src/modules/providers/noble/reconJob";
import { withProviderEconomics } from "../src/modules/transactions/txn.service";
import type { ProviderResult } from "../src/modules/providers/types";

function result(data: Record<string, unknown>): ProviderResult {
  return { success: true, status: "success", providerTxnId: null, amount: null, message: "", data, raw: {} };
}

describe("AEPS recon helpers", () => {
  it("formats a recon line as status~txnRef~rrn", () => {
    expect(reconLine("success", "AP1234567890", "555552824276")).toBe("1~AP1234567890~555552824276");
    expect(reconLine("failed", "AP1234567890", "")).toBe("0~AP1234567890~");
  });

  it("builds a stable 10–15 character batch id per type and day", () => {
    const id = reconBatchId("CW", "2026-10-25");
    expect(id).toBe("APCW20261025");
    expect(id.length).toBeGreaterThanOrEqual(10);
    expect(id.length).toBeLessThanOrEqual(15);
  });

  it("uses the IST calendar day, not UTC", () => {
    // 20:00 UTC on 24 Oct = 01:30 IST on 25 Oct
    const now = new Date("2026-10-24T20:00:00Z");
    expect(istDate(0, now)).toBe("2026-10-25");
    expect(istDate(1, now)).toBe("2026-10-24");
  });
});

describe("withProviderEconomics", () => {
  it("keeps rrn, commission and charges under metadata.provider", () => {
    const meta = withProviderEconomics(
      { channel: "APP" },
      result({ rrn: "555552824276", commission: "3.00", charges: 12, balance: "900", aadhaarNumber: "0862" }),
    );
    expect(meta).toEqual({ channel: "APP", provider: { rrn: "555552824276", commission: "3.00", charges: "12" } });
  });

  it("leaves metadata untouched when the provider sends none of the fields", () => {
    const meta = { channel: "APP" };
    expect(withProviderEconomics(meta, result({ balance: "900" }))).toBe(meta);
  });
});

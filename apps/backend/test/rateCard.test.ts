import { describe, expect, it } from "vitest";
import {
  companyKeepsPaise,
  computeFixedPaise,
  computeProviderIncomePaise,
  computeSharePaise,
  inSlab,
  percentOfPaiseHalfUp,
  pickRow,
  pickShare,
  providerReceivablePaise,
  resolveRoleGross,
  splitFeeGstPaise,
} from "../src/modules/commission/rateCard.math";

const at = (iso: string) => new Date(iso);

describe("share math", () => {
  it("splits provider income 60 / 10 / 5 in paise", () => {
    expect(computeSharePaise(1000, "60")).toBe(600);
    expect(computeSharePaise(1000, "10")).toBe(100);
    expect(computeSharePaise(1000, "5")).toBe(50);
  });

  it("rounds half-up per component", () => {
    // ₹13.95 provider income
    expect(computeSharePaise(1395, "60.0000")).toBe(837);
    expect(computeSharePaise(1395, "10.0000")).toBe(140); // 139.5 → 140
    expect(computeSharePaise(1395, "5.0000")).toBe(70); // 69.75 → 70
    expect(percentOfPaiseHalfUp(1, "49.9999")).toBe(0);
    expect(percentOfPaiseHalfUp(1, "50")).toBe(1);
  });

  it("returns 0 for zero income or zero share", () => {
    expect(computeSharePaise(0, "60")).toBe(0);
    expect(computeSharePaise(1000, "0")).toBe(0);
  });
});

describe("provider income", () => {
  it("percentage of amount", () => {
    expect(computeProviderIncomePaise({ ruleType: "percentage", value: "0.5", capAmount: null }, 200_000)).toBe(1000);
  });

  it("applies the cap", () => {
    const rule = { ruleType: "percentage" as const, value: "0.5000", capAmount: "13.95" };
    expect(computeProviderIncomePaise(rule, 200_000)).toBe(1000); // ₹2,000 → ₹10 under cap
    expect(computeProviderIncomePaise(rule, 279_000)).toBe(1395); // ₹13.95 exactly at cap
    expect(computeProviderIncomePaise(rule, 500_000)).toBe(1395); // ₹25 capped to ₹13.95
  });

  it("flat ₹ ignores the amount", () => {
    expect(computeProviderIncomePaise({ ruleType: "flat", value: "1.5000", capAmount: null }, 999_999)).toBe(150);
  });
});

describe("slab edges", () => {
  const low = { providerId: null, effectiveFrom: at("2026-10-01"), minAmount: "0.00", maxAmount: "1000.00", tag: "low" };
  const high = { providerId: null, effectiveFrom: at("2026-10-01"), minAmount: "1000.00", maxAmount: "3000.00", tag: "high" };
  const above100 = { providerId: null, effectiveFrom: at("2026-10-01"), minAmount: "100.01", maxAmount: null, tag: "a100" };

  it("bounds are inclusive", () => {
    expect(inSlab(low, 100_000)).toBe(true);
    expect(inSlab(low, 100_001)).toBe(false);
    expect(inSlab(above100, 10_000)).toBe(false);
    expect(inSlab(above100, 10_001)).toBe(true);
  });

  it("shared edge goes to the higher slab start", () => {
    expect(pickRow([low, high], null, 100_000)?.tag).toBe("high");
    expect(pickRow([low, high], null, 99_999)?.tag).toBe("low");
    expect(pickRow([low, high], null, 300_001)).toBeNull();
  });

  it("provider-specific beats all-providers, then newest effective_from", () => {
    const all = { providerId: null, effectiveFrom: at("2026-10-20"), tag: "all" };
    const noble = { providerId: "p1", effectiveFrom: at("2026-01-01"), tag: "noble" };
    const nobleNew = { providerId: "p1", effectiveFrom: at("2026-10-01"), tag: "nobleNew" };
    expect(pickRow([all, noble], "p1", null)?.tag).toBe("noble");
    expect(pickRow([all, noble, nobleNew], "p1", null)?.tag).toBe("nobleNew");
    // All providers scope never sees a provider-specific row.
    expect(pickRow([all, noble], null, null)?.tag).toBe("all");
    expect(pickRow([noble], "p2", null)).toBeNull();
  });
});

describe("resolution order", () => {
  const amountPaise = 200_000;
  const fixedRule = { ruleType: "flat" as const, value: "4.0000" };

  it("agent override wins over share and fixed rule", () => {
    const r = resolveRoleGross({
      amountPaise,
      providerIncomePaise: 1000,
      override: { ruleType: "flat", value: "9.0000" },
      sharePercent: "60",
      fixedRule,
    });
    expect(r).toEqual({ source: "override", grossPaise: 900 });
  });

  it("share wins over fixed rule when provider income exists", () => {
    const r = resolveRoleGross({ amountPaise, providerIncomePaise: 1000, sharePercent: "60", fixedRule });
    expect(r).toEqual({ source: "share", grossPaise: 600 });
  });

  it("missing provider income falls back to the fixed rule", () => {
    const r = resolveRoleGross({ amountPaise, providerIncomePaise: null, sharePercent: "60", fixedRule });
    expect(r).toEqual({ source: "rule", grossPaise: 400 });
  });

  it("provider income of ₹0 pays a ₹0 share (no fallback)", () => {
    const r = resolveRoleGross({ amountPaise, providerIncomePaise: 0, sharePercent: "60", fixedRule });
    expect(r).toEqual({ source: "share", grossPaise: 0 });
  });

  it("nothing configured → none", () => {
    expect(resolveRoleGross({ amountPaise, providerIncomePaise: null })).toEqual({ source: "none", grossPaise: 0 });
  });
});

describe("per-slab shares", () => {
  const share = (id: string, minAmount: string | null, maxAmount: string | null, when: string, providerId: string | null = null) => ({
    id,
    providerId,
    minAmount,
    maxAmount,
    effectiveFrom: at(when),
  });
  const rows = [
    share("default", null, null, "2026-10-28T12:00:00Z"),
    share("slab-100", "100.00", "199.99", "2026-10-01T00:00:00Z"),
    share("slab-2000", "2000.00", "2099.99", "2026-10-01T00:00:00Z"),
  ];

  it("a slab row beats the newer service default inside its range", () => {
    expect(pickShare(rows, null, 15_000)?.id).toBe("slab-100");
    expect(pickShare(rows, null, 200_000)?.id).toBe("slab-2000");
  });

  it("amounts outside every slab fall back to the service default", () => {
    expect(pickShare(rows, null, 50_000)?.id).toBe("default");
  });

  it("null amount reads only the service default", () => {
    expect(pickShare(rows, null, null)?.id).toBe("default");
    expect(pickShare([share("slab-only", "100.00", "199.99", "2026-10-01T00:00:00Z")], null, null)).toBeNull();
  });

  it("the narrower of two overlapping slabs wins inside its range, whichever was saved last", () => {
    const overlap = [
      share("wide", "3000.00", "10000.00", "2026-10-28T12:00:00Z"),
      share("narrow", "3000.00", "7999.99", "2026-10-01T00:00:00Z"),
    ];
    expect(pickShare(overlap, null, 500_000)?.id).toBe("narrow");
    expect(pickShare(overlap, null, 900_000)?.id).toBe("wide");
  });

  it("a provider-specific default still beats an all-providers slab", () => {
    const withProvider = [...rows, share("p-default", null, null, "2026-09-01T00:00:00Z", "p1")];
    expect(pickShare(withProvider, "p1", 15_000)?.id).toBe("p-default");
    expect(pickShare(withProvider, null, 15_000)?.id).toBe("slab-100");
  });

  it("a flat share pays the flat ₹ and ignores the percent", () => {
    expect(resolveRoleGross({ amountPaise: 15_000, providerIncomePaise: 0, sharePercent: "0", shareFlat: "0.5" })).toEqual({
      source: "share",
      grossPaise: 50,
    });
    expect(resolveRoleGross({ amountPaise: 15_000, providerIncomePaise: 930, sharePercent: "80" })).toEqual({
      source: "share",
      grossPaise: 744,
    });
  });

  it("a slab share of 0 pays nothing even when a fixed rule exists", () => {
    expect(
      resolveRoleGross({
        amountPaise: 15_000,
        providerIncomePaise: 0,
        sharePercent: "0",
        fixedRule: { ruleType: "flat", value: "10" },
      }),
    ).toEqual({ source: "share", grossPaise: 0 });
  });
});

describe("fixed rule math stays unchanged", () => {
  it("matches the previous floor formula", () => {
    const legacy = (value: string, amountPaise: number) =>
      Math.floor((amountPaise * Math.round(parseFloat(value) * 10000)) / 1_000_000);
    for (const [value, amt] of [
      ["0.25", 200_000],
      ["1.5000", 123_457],
      ["0.0125", 999_999],
      ["2", 1],
    ] as const) {
      expect(computeFixedPaise({ ruleType: "percentage", value }, amt)).toBe(legacy(value, amt));
    }
    expect(computeFixedPaise({ ruleType: "flat", value: "13.9500" }, 1)).toBe(1395);
  });
});

describe("company keeps", () => {
  it("provider income + fee − role gross", () => {
    expect(companyKeepsPaise({ providerIncomePaise: 1000, customerFeePaise: 0, totalGrossPaise: 750 })).toEqual({
      companyKeepsPaise: 250,
      underwater: false,
    });
  });

  it("flags underwater when payouts exceed income", () => {
    expect(companyKeepsPaise({ providerIncomePaise: null, customerFeePaise: 1000, totalGrossPaise: 1200 })).toEqual({
      companyKeepsPaise: -200,
      underwater: true,
    });
  });
});

describe("GST on customer fee", () => {
  const on = { applies: true, percent: "18.0000" };

  it("on top: GST added to the fee (floor, same as the live debit)", () => {
    expect(splitFeeGstPaise(1000, { ...on, inclusive: false })).toEqual({ baseFeePaise: 1000, gstPaise: 180 });
    expect(splitFeeGstPaise(1001, { ...on, inclusive: false })).toEqual({ baseFeePaise: 1001, gstPaise: 180 });
  });

  it("included: GST = fee − fee ÷ 1.18, base + GST = fee", () => {
    expect(splitFeeGstPaise(1000, { ...on, inclusive: true })).toEqual({ baseFeePaise: 847, gstPaise: 153 });
    expect(splitFeeGstPaise(1180, { ...on, inclusive: true })).toEqual({ baseFeePaise: 1000, gstPaise: 180 });
  });

  it("off or zero fee → no GST", () => {
    expect(splitFeeGstPaise(1000, { applies: false, percent: "18", inclusive: true })).toEqual({
      baseFeePaise: 1000,
      gstPaise: 0,
    });
    expect(splitFeeGstPaise(0, { ...on, inclusive: false })).toEqual({ baseFeePaise: 0, gstPaise: 0 });
  });
});

describe("provider receivable", () => {
  it("income + 18% GST − 2% TDS", () => {
    expect(providerReceivablePaise(1000, { outputGstPercent: "18", tdsPercent: "2" })).toEqual({
      gstPaise: 180,
      tdsPaise: 20,
      netPaise: 1160,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  companyKeepsPaise,
  computeFixedPaise,
  computeProviderIncomePaise,
  computeSharePaise,
  inSlab,
  percentOfPaiseHalfUp,
  pickRow,
  resolveRoleGross,
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

import { describe, expect, it } from "vitest";
import { orderError, planBulkToggle, sameOrder, type CheckState } from "../src/modules/verifications/verificationRules";

const names: Record<string, string> = { bestapi: "BestAPI", vyaparapi: "VyaparAPI", noble_pennyless: "Noble", noble_pennydrop: "Noble" };
const nameOf = (p: string) => names[p] ?? p;

describe("orderError", () => {
  const bank = ["bestapi", "noble_pennyless", "noble_pennydrop"];

  it("accepts any permutation", () => {
    expect(orderError("Bank", bank, bank)).toBeNull();
    expect(orderError("Bank", bank, ["noble_pennydrop", "bestapi", "noble_pennyless"])).toBeNull();
  });

  it("rejects an API that is not part of the check", () => {
    expect(orderError("Mobile plans", ["bestapi", "vyaparapi"], ["bestapi", "noble"], nameOf)).toBe(
      "Mobile plans: noble is not an API for this check",
    );
  });

  it("rejects repeats", () => {
    expect(orderError("Mobile plans", ["bestapi", "vyaparapi"], ["bestapi", "bestapi"], nameOf)).toBe(
      "Mobile plans: BestAPI is listed more than once",
    );
  });

  it("rejects a missing API", () => {
    expect(orderError("Bank", bank, ["bestapi", "noble_pennyless"], nameOf)).toBe("Bank: the order is missing Noble");
    expect(orderError("Bank", bank, [])).toBe("Bank: the order is missing bestapi");
  });
});

describe("sameOrder", () => {
  it("compares position by position", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });
});

describe("planBulkToggle", () => {
  const states: Record<string, CheckState> = {
    pan_verify: { label: "PAN verification", providers: ["bestapi"], disabled: [] },
    mobile_plans: { label: "Mobile plans", providers: ["bestapi", "vyaparapi"], disabled: ["vyaparapi"] },
  };

  it("turns off APIs that are on and builds the next disabled list per check", () => {
    const r = planBulkToggle(
      [
        { check: "pan_verify", provider: "bestapi" },
        { check: "mobile_plans", provider: "bestapi" },
      ],
      false,
      states,
    );
    expect(r.applied).toHaveLength(2);
    expect(r.skipped).toEqual([]);
    expect(r.disabled).toEqual({ pan_verify: ["bestapi"], mobile_plans: ["vyaparapi", "bestapi"] });
  });

  it("skips APIs already in the requested state", () => {
    const off = planBulkToggle([{ check: "mobile_plans", provider: "vyaparapi" }], false, states);
    expect(off.applied).toEqual([]);
    expect(off.skipped).toEqual([{ check: "mobile_plans", provider: "vyaparapi", reason: "Already off" }]);
    expect(off.disabled).toEqual({});

    const on = planBulkToggle([{ check: "pan_verify", provider: "bestapi" }], true, states);
    expect(on.skipped[0]?.reason).toBe("Already on");
  });

  it("turns on a disabled API", () => {
    const r = planBulkToggle([{ check: "mobile_plans", provider: "vyaparapi" }], true, states);
    expect(r.disabled).toEqual({ mobile_plans: [] });
  });

  it("skips unknown checks, foreign providers and repeats", () => {
    const r = planBulkToggle(
      [
        { check: "nope", provider: "bestapi" },
        { check: "pan_verify", provider: "vyaparapi" },
        { check: "mobile_plans", provider: "bestapi" },
        { check: "mobile_plans", provider: "bestapi" },
      ],
      false,
      states,
      nameOf,
    );
    expect(r.applied).toEqual([{ check: "mobile_plans", provider: "bestapi" }]);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Unknown verification check",
      "VyaparAPI has no API for PAN verification",
      "Selected more than once — changed once",
    ]);
  });

  it("does not mutate the input state", () => {
    planBulkToggle([{ check: "mobile_plans", provider: "vyaparapi" }], true, states);
    expect(states.mobile_plans!.disabled).toEqual(["vyaparapi"]);
  });
});

import { describe, it, expect } from "vitest";
import { bankNameMatch } from "@asanpay/shared-types";

describe("bankNameMatch", () => {
  it("matches the same name in a different case and with a title", () => {
    expect(bankNameMatch("Demo Singh", "MR DEMO SINGH")).toEqual({ percent: 100, level: "match" });
  });

  it("treats an initial as a near match", () => {
    const r = bankNameMatch("Demo Kumar Singh", "DEMO K SINGH");
    expect(r.level).toBe("match");
    expect(r.percent).toBeGreaterThanOrEqual(90);
  });

  it("flags a partly matching name", () => {
    expect(bankNameMatch("Ramesh Kumar", "RAMESH SHARMA").level).toBe("partial");
  });

  it("flags a different person", () => {
    expect(bankNameMatch("Ramesh Kumar", "SURESH SHARMA")).toEqual({ percent: 0, level: "mismatch" });
  });

  it("returns mismatch when either side is empty", () => {
    expect(bankNameMatch("", "DEMO SINGH").level).toBe("mismatch");
  });
});

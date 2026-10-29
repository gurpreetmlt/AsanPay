import { describe, expect, it } from "vitest";
import { UNDO_WINDOW_MS, undoBlockReason, undoOpOf, undoReasonOf } from "../src/modules/commission/rateCardImport.ops";

const SERVICE = "8a1f1b4e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const PROVIDER = "1b2c3d4e-5f60-4a1b-9c2d-3e4f5a6b7c8d";
const ROW = "0f1e2d3c-4b5a-4968-8776-655443322110";
const base = { label: "Cash Withdraw · step", detail: "" };

describe("undoOpOf", () => {
  it("maps a provider income restore to set_income", () => {
    const op = undoOpOf({
      ...base,
      method: "post",
      url: "/admin/rate-card/provider-income",
      body: { serviceId: SERVICE, providerId: null, ruleType: "flat", value: "1.5", capAmount: null, minAmount: "100", maxAmount: "199.99" },
    });
    expect(op.kind).toBe("set_income");
  });

  it("maps a slab share restore to set_share", () => {
    const op = undoOpOf({
      ...base,
      method: "post",
      url: "/admin/rate-card/shares",
      body: { serviceId: SERVICE, providerId: PROVIDER, role: "retailer", sharePercent: "0", flatAmount: "0.5", minAmount: null, maxAmount: "500" },
    });
    expect(op).toMatchObject({ kind: "set_share", body: { role: "retailer", flatAmount: "0.5" } });
  });

  it("maps scope deletes for rows the import created", () => {
    expect(
      undoOpOf({
        ...base,
        method: "delete",
        url: "/admin/rate-card/provider-income/scope",
        body: { serviceId: SERVICE, providerId: null, minAmount: "100", maxAmount: null },
      }).kind,
    ).toBe("end_income_scope");
    expect(
      undoOpOf({
        ...base,
        method: "delete",
        url: "/admin/rate-card/shares/scope",
        body: { serviceId: SERVICE, providerId: PROVIDER, role: "distributor", minAmount: null, maxAmount: "1000" },
      }).kind,
    ).toBe("end_share_scope");
  });

  it("maps id deletes", () => {
    expect(undoOpOf({ ...base, method: "delete", url: `/admin/rate-card/shares/${ROW}`, body: {} })).toEqual({ kind: "end_share", id: ROW });
  });

  it("rejects anything that is not a slab write", () => {
    expect(() => undoOpOf({ ...base, method: "post", url: "/admin/users/x/block", body: {} })).toThrow(/not a rate card slab write/);
    expect(() => undoOpOf({ ...base, method: "patch", url: "/admin/rate-card/shares", body: {} })).toThrow();
    expect(() => undoOpOf({ ...base, method: "delete", url: "/admin/rate-card/shares/not-an-id", body: {} })).toThrow();
    expect(() => undoOpOf({ ...base, method: "post", url: "/admin/rate-card/tax", body: {} })).toThrow();
  });

  it("names the step when a restore body is invalid", () => {
    expect(() =>
      undoOpOf({ ...base, method: "post", url: "/admin/rate-card/provider-income", body: { serviceId: SERVICE, ruleType: "flat" } }),
    ).toThrow(/Cash Withdraw · step/);
  });
});

describe("undoBlockReason", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it("allows a fresh import", () => {
    expect(undoBlockReason({ createdAt: new Date(now.getTime() - 60_000), undoneAt: null }, now)).toBeNull();
  });
  it("blocks after 24 hours", () => {
    expect(undoBlockReason({ createdAt: new Date(now.getTime() - UNDO_WINDOW_MS - 1), undoneAt: null }, now)).toMatch(/24 hours/);
  });
  it("blocks a second undo", () => {
    expect(undoBlockReason({ createdAt: now, undoneAt: now }, now)).toMatch(/already undone/);
  });
});

it("undo reason is stable per import", () => {
  const r = { id: ROW, fileName: "rate-card.xlsx" };
  expect(undoReasonOf(r)).toBe(undoReasonOf(r));
  expect(undoReasonOf(r)).toContain("ref 0f1e2d3c");
});

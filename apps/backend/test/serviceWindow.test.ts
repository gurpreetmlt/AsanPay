import { describe, expect, it } from "vitest";
import { closedMessage, hmLabel, isInsideWindow } from "../src/modules/serviceWindow/serviceWindow.math";

/** IST wall clock → Date (IST = UTC + 5:30). */
const ist = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 29, h, m) - 330 * 60_000);

describe("night service window", () => {
  const night = { enabled: true, start: "00:00", end: "06:00" };

  it("is closed from 12:00 AM up to (not including) 6:00 AM IST", () => {
    expect(isInsideWindow(night, ist(0, 0))).toBe(true);
    expect(isInsideWindow(night, ist(3, 15))).toBe(true);
    expect(isInsideWindow(night, ist(5, 59))).toBe(true);
    expect(isInsideWindow(night, ist(6, 0))).toBe(false);
    expect(isInsideWindow(night, ist(23, 59))).toBe(false);
  });

  it("handles a window that crosses midnight", () => {
    const w = { enabled: true, start: "23:00", end: "05:00" };
    expect(isInsideWindow(w, ist(23, 30))).toBe(true);
    expect(isInsideWindow(w, ist(4, 0))).toBe(true);
    expect(isInsideWindow(w, ist(12, 0))).toBe(false);
  });

  it("is never closed when off or when start equals end", () => {
    expect(isInsideWindow({ ...night, enabled: false }, ist(2))).toBe(false);
    expect(isInsideWindow({ enabled: true, start: "02:00", end: "02:00" }, ist(2))).toBe(false);
  });

  it("formats 12-hour labels and the agent message", () => {
    expect(hmLabel("00:00")).toBe("12:00 AM");
    expect(hmLabel("06:30")).toBe("6:30 AM");
    expect(hmLabel("18:05")).toBe("6:05 PM");
    expect(closedMessage(night)).toBe("Services are closed from 12:00 AM to 6:00 AM. They open again at 6:00 AM.");
  });
});

import { describe, expect, it } from "vitest";
import { haversineKm, isWithinGeofence, hashAadhaar } from "../src/modules/aeps/compliance";

describe("haversine / geofence", () => {
  it("returns ~0 km for the same point", () => {
    expect(haversineKm(28.6139, 77.209, 28.6139, 77.209)).toBeLessThan(0.01);
  });

  it("flags a point beyond 3 km", () => {
    // ~5.5 km east of Connaught Place, Delhi
    expect(isWithinGeofence(28.6315, 77.2167, 28.6315, 77.27, 3)).toBe(false);
  });

  it("allows a point within 3 km", () => {
    expect(isWithinGeofence(28.6315, 77.2167, 28.632, 77.22, 3)).toBe(true);
  });
});

describe("hashAadhaar", () => {
  it("is stable and does not echo the raw number", () => {
    const h = hashAadhaar("123412341234");
    expect(h).toHaveLength(64);
    expect(h).not.toContain("1234");
    expect(hashAadhaar("123412341234")).toBe(h);
  });
});

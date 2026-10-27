import { describe, expect, it } from "vitest";
import {
  haversineKm,
  isWithinGeofence,
  hashAadhaar,
  serviceGeofenceDecision,
} from "../src/modules/aeps/compliance";
import { parseGeofencePatch, resolveGeofenceLimits } from "../src/modules/tenants/geofenceSettings";

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

describe("service geofence — 15 km from shop OR 5 km from home", () => {
  const limits = { shopKm: 15, homeKm: 5 };
  // Shop at Connaught Place, Delhi; home ~20 km south (Faridabad border).
  const shop = { lat: 28.6315, lng: 77.2167 };
  const home = { lat: 28.4515, lng: 77.2167 };

  it("allows a txn ~11 km from the shop (inside 15 km)", () => {
    const d = serviceGeofenceDecision({ shop, home }, 28.7305, 77.2167, limits);
    expect(d.shopKm!).toBeGreaterThan(10);
    expect(d.shopKm!).toBeLessThan(15);
    expect(d.allowed).toBe(true);
  });

  it("allows a txn ~3 km from home even though it is ~17 km from the shop", () => {
    const d = serviceGeofenceDecision({ shop, home }, 28.4785, 77.2167, limits);
    expect(d.shopKm!).toBeGreaterThan(15);
    expect(d.homeKm!).toBeLessThan(5);
    expect(d.allowed).toBe(true);
  });

  it("blocks a txn ~27 km from the shop and ~7 km from home", () => {
    const d = serviceGeofenceDecision({ shop, home }, 28.3885, 77.2167, limits);
    expect(d.shopKm!).toBeGreaterThan(15);
    expect(d.homeKm!).toBeGreaterThan(5);
    expect(d.allowed).toBe(false);
  });

  it("uses only the shop when no home location is registered (older accounts)", () => {
    expect(serviceGeofenceDecision({ shop, home: null }, 28.7305, 77.2167, limits).allowed).toBe(true);
    expect(serviceGeofenceDecision({ shop, home: null }, 28.4785, 77.2167, limits).allowed).toBe(false);
  });

  it("allows when neither point is registered", () => {
    expect(serviceGeofenceDecision({ shop: null, home: null }, 12.97, 77.59, limits).allowed).toBe(true);
  });

  it("allows everything when the admin turned the location check off", () => {
    const d = serviceGeofenceDecision({ shop, home }, 28.3885, 77.2167, { ...limits, enabled: false });
    expect(d.shopKm!).toBeGreaterThan(15);
    expect(d.allowed).toBe(true);
  });
});

describe("geofence limits — admin setting → server (env / default)", () => {
  const server = { shopKm: 15, homeKm: 5 };

  it("uses server limits when nothing is stored", () => {
    expect(resolveGeofenceLimits(undefined, server)).toEqual({
      enabled: true,
      shopKm: 15,
      homeKm: 5,
      shopKmSource: "server",
      homeKmSource: "server",
    });
  });

  it("admin values override env", () => {
    const l = resolveGeofenceLimits({ shopKm: 30, homeKm: 2 }, server);
    expect(l).toMatchObject({ shopKm: 30, homeKm: 2, shopKmSource: "admin", homeKmSource: "admin" });
    // ~27 km from the shop: blocked at 15 km, allowed at the admin's 30 km.
    const shop = { lat: 28.6315, lng: 77.2167 };
    expect(serviceGeofenceDecision({ shop, home: null }, 28.3885, 77.2167, server).allowed).toBe(false);
    expect(serviceGeofenceDecision({ shop, home: null }, 28.3885, 77.2167, l).allowed).toBe(true);
  });

  it("only enabled === false disables the check", () => {
    expect(resolveGeofenceLimits({ enabled: false }, server).enabled).toBe(false);
    expect(resolveGeofenceLimits({ enabled: "no" }, server).enabled).toBe(true);
  });

  it("ignores out-of-range stored values and falls back to server limits", () => {
    const l = resolveGeofenceLimits({ shopKm: 0, homeKm: 99 }, server);
    expect(l).toMatchObject({ shopKm: 15, homeKm: 5, shopKmSource: "server", homeKmSource: "server" });
  });

  it("PATCH validation enforces bounds with field-specific messages", () => {
    expect(parseGeofencePatch({ enabled: true, shopKm: 1, homeKm: 20 })).toEqual({ enabled: true, shopKm: 1, homeKm: 20 });
    expect(parseGeofencePatch({ shopKm: 50 })).toEqual({ shopKm: 50 });
    expect(() => parseGeofencePatch({ shopKm: 51 })).toThrow("Shop radius must be between 1 and 50 km");
    expect(() => parseGeofencePatch({ shopKm: 0.5 })).toThrow("Shop radius must be between 1 and 50 km");
    expect(() => parseGeofencePatch({ homeKm: 21 })).toThrow("Home radius must be between 1 and 20 km");
    expect(() => parseGeofencePatch({ homeKm: "abc" })).toThrow("Home radius must be between 1 and 20 km");
    expect(() => parseGeofencePatch({ enabled: "yes" })).toThrow("Location check must be on or off");
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

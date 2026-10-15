import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Fail-closed AEPS mode config: sandbox/live without InstantPay creds must throw at boot.
 * Reloads the env module with a fresh process.env snapshot per case.
 */

async function loadEnvModule(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  const keys = [
    "AEPS_PROVIDER_MODE",
    "INSTANTPAY_CLIENT_ID",
    "INSTANTPAY_CLIENT_SECRET",
    "INSTANTPAY_AES_KEY",
    "INSTANTPAY_AUTH_CODE",
    "INSTANTPAY_BASE_URL",
  ];
  for (const k of keys) {
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  process.env.DATABASE_URL ??= "postgres://asanpay:asanpay@localhost:5432/asanpay";
  process.env.JWT_ACCESS_SECRET ??= "dev-access-secret-please-change-me-32chars";
  process.env.JWT_REFRESH_SECRET ??= "dev-refresh-secret-please-change-me-32chars";
  process.env.AES_ENCRYPTION_KEY ??= "eBgFLCCqFzEWCfr2wN8XAoLWn38m2DlgHAJQU9kiZcI=";
  return import("../src/config/env");
}

afterEach(() => {
  vi.resetModules();
  delete process.env.AEPS_PROVIDER_MODE;
});

describe("assertAepsProviderConfig", () => {
  it("reads the retired dummy value as off and boots without credentials", async () => {
    const { assertAepsProviderConfig, env } = await loadEnvModule({ AEPS_PROVIDER_MODE: "dummy" });
    expect(env.AEPS_PROVIDER_MODE).toBe("off");
    expect(() => assertAepsProviderConfig()).not.toThrow();
  });

  it("fails closed when sandbox mode lacks credentials", async () => {
    const { assertAepsProviderConfig } = await loadEnvModule({
      AEPS_PROVIDER_MODE: "instantpay_sandbox",
      INSTANTPAY_CLIENT_ID: undefined,
      INSTANTPAY_CLIENT_SECRET: "secret",
      INSTANTPAY_AES_KEY: "12345678901234567890123456789012",
    });
    expect(() => assertAepsProviderConfig()).toThrow(/INSTANTPAY_CLIENT_ID/);
  });

  it("passes sandbox mode when all InstantPay credentials are set", async () => {
    const { assertAepsProviderConfig, isInstantPayAepsMode } = await loadEnvModule({
      AEPS_PROVIDER_MODE: "instantpay_sandbox",
      INSTANTPAY_CLIENT_ID: "client",
      INSTANTPAY_CLIENT_SECRET: "secret",
      INSTANTPAY_AES_KEY: "12345678901234567890123456789012",
    });
    expect(() => assertAepsProviderConfig()).not.toThrow();
    expect(isInstantPayAepsMode()).toBe(true);
  });
});

describe("aepsAdapterCode", () => {
  it("returns null when AePS is off", async () => {
    await loadEnvModule({ AEPS_PROVIDER_MODE: undefined });
    const { aepsAdapterCode } = await import("../src/modules/providers/aepsMode");
    expect(aepsAdapterCode()).toBeNull();
  });

  it("maps instantpay_live → instantpay", async () => {
    await loadEnvModule({
      AEPS_PROVIDER_MODE: "instantpay_live",
      INSTANTPAY_CLIENT_ID: "c",
      INSTANTPAY_CLIENT_SECRET: "s",
      INSTANTPAY_AES_KEY: "12345678901234567890123456789012",
    });
    const { aepsAdapterCode } = await import("../src/modules/providers/aepsMode");
    expect(aepsAdapterCode()).toBe("instantpay");
  });
});

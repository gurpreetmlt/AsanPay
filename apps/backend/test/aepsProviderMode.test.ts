import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * AEPS mode config: only `off | noble`; any retired value boots as `off`, and `noble`
 * without credentials fails closed. Reloads the env module per case.
 */

async function loadEnvModule(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  const keys = ["AEPS_PROVIDER_MODE", "NOBLE_API_KEY", "NOBLE_API_VALUE"];
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
  delete process.env.NOBLE_API_KEY;
  delete process.env.NOBLE_API_VALUE;
});

describe("AEPS_PROVIDER_MODE", () => {
  it.each(["dummy", "sandbox", "live", "retired_mode"])(
    "reads the retired value %s as off",
    async (mode) => {
      const { env, assertNobleAepsProviderConfig } = await loadEnvModule({ AEPS_PROVIDER_MODE: mode });
      expect(env.AEPS_PROVIDER_MODE).toBe("off");
      expect(() => assertNobleAepsProviderConfig()).not.toThrow();
    },
  );

  it("fails closed when noble mode lacks credentials", async () => {
    const { assertNobleAepsProviderConfig } = await loadEnvModule({ AEPS_PROVIDER_MODE: "noble" });
    expect(() => assertNobleAepsProviderConfig()).toThrow(/NOBLE_API_KEY/);
  });

  it("passes noble mode when credentials are set", async () => {
    const { assertNobleAepsProviderConfig, env } = await loadEnvModule({
      AEPS_PROVIDER_MODE: "noble",
      NOBLE_API_KEY: "k",
      NOBLE_API_VALUE: "v",
    });
    expect(env.AEPS_PROVIDER_MODE).toBe("noble");
    expect(() => assertNobleAepsProviderConfig()).not.toThrow();
  });
});

describe("aepsAdapterCode", () => {
  it("returns null when AePS is off", async () => {
    await loadEnvModule({ AEPS_PROVIDER_MODE: undefined });
    const { aepsAdapterCode } = await import("../src/modules/providers/aepsMode");
    expect(aepsAdapterCode()).toBeNull();
  });

  it("maps noble → noble", async () => {
    await loadEnvModule({ AEPS_PROVIDER_MODE: "noble", NOBLE_API_KEY: "k", NOBLE_API_VALUE: "v" });
    const { aepsAdapterCode } = await import("../src/modules/providers/aepsMode");
    expect(aepsAdapterCode()).toBe("noble");
  });
});

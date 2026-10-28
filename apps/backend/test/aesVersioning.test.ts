import { createCipheriv, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const CURRENT_KEY = randomBytes(32).toString("base64");
const PREVIOUS_KEY = randomBytes(32).toString("base64");

async function loadAes(env: { previous?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("AES_ENCRYPTION_KEY", CURRENT_KEY);
  vi.stubEnv("AES_ENCRYPTION_KEY_PREVIOUS", env.previous ?? "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STRICT_PRODUCTION", "false");
  if (!process.env.DATABASE_URL) vi.stubEnv("DATABASE_URL", "postgres://asanpay:asanpay@localhost:5432/asanpay");
  if ((process.env.JWT_ACCESS_SECRET ?? "").length < 32) {
    vi.stubEnv("JWT_ACCESS_SECRET", "dev-access-secret-please-change-me-32chars");
  }
  if ((process.env.JWT_REFRESH_SECRET ?? "").length < 32) {
    vi.stubEnv("JWT_REFRESH_SECRET", "dev-refresh-secret-please-change-me-32chars");
  }
  return import("../src/utils/aes");
}

/** Pre-versioning format: base64(iv + authTag + ciphertext), no prefix. */
function legacyEncrypt(plaintext: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("AES PII versioning", () => {
  it("writes v1-prefixed values that round-trip", async () => {
    const { encryptPII, decryptPII } = await loadAes();
    const enc = encryptPII("ABCDE1234F");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptPII(enc)).toBe("ABCDE1234F");
  });

  it("still decrypts legacy unprefixed values", async () => {
    const { decryptPII } = await loadAes();
    expect(decryptPII(legacyEncrypt("123412341234", CURRENT_KEY))).toBe("123412341234");
  });

  it("falls back to AES_ENCRYPTION_KEY_PREVIOUS for legacy and v1 values", async () => {
    const { decryptPII, encryptWithKey, parseAesKey } = await loadAes({ previous: PREVIOUS_KEY });
    expect(decryptPII(legacyEncrypt("old-legacy", PREVIOUS_KEY))).toBe("old-legacy");
    expect(decryptPII(encryptWithKey("old-v1", parseAesKey(PREVIOUS_KEY)))).toBe("old-v1");
  });

  it("rejects values encrypted with an unknown key", async () => {
    const { decryptPII } = await loadAes();
    expect(() => decryptPII(legacyEncrypt("x", PREVIOUS_KEY))).toThrow();
  });

  it("rejects tampered ciphertext", async () => {
    const { encryptPII, decryptPII } = await loadAes();
    const enc = encryptPII("ABCDE1234F");
    const raw = Buffer.from(enc.slice(3), "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptPII(`v1:${raw.toString("base64")}`)).toThrow();
  });
});

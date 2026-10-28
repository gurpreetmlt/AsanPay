import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotp,
  generateTotpSecret,
  hotp,
  totpStepAt,
  verifyTotp,
} from "../src/modules/auth/adminTotp";

// RFC 6238 Appendix B seed for SHA-1.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("base32", () => {
  it("round-trips random bytes", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 17]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it("encodes the RFC 4648 vector", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });

  it("decodes lower case, spaces and padding", () => {
    expect(base32Decode("mzxw 6ytb oi======").toString()).toBe("foobar");
  });

  it("rejects invalid characters", () => {
    expect(() => base32Decode("ABC1")).toThrow();
  });

  it("generates a 160-bit secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });
});

describe("TOTP RFC 6238 vectors (SHA-1)", () => {
  const cases: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];

  it.each(cases)("t=%i → %s (8 digits)", (t, expected) => {
    expect(generateTotp(RFC_SECRET, t * 1000, 8)).toBe(expected);
  });

  it.each(cases)("t=%i → last 6 digits", (t, expected) => {
    expect(generateTotp(RFC_SECRET, t * 1000)).toBe(expected.slice(-6));
  });

  it("matches HOTP RFC 4226 counter 0", () => {
    expect(hotp(Buffer.from("12345678901234567890"), 0)).toBe("755224");
  });
});

describe("verifyTotp", () => {
  const now = 1_700_000_000_000;
  const step = totpStepAt(now);
  const at = (deltaSteps: number) => generateTotp(RFC_SECRET, now + deltaSteps * 30_000);

  it("accepts the current code and returns its step", () => {
    expect(verifyTotp(RFC_SECRET, at(0), { nowMs: now })).toBe(step);
  });

  it("accepts ±1 step for clock drift", () => {
    expect(verifyTotp(RFC_SECRET, at(-1), { nowMs: now })).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, at(1), { nowMs: now })).toBe(step + 1);
  });

  it("rejects codes two steps away", () => {
    expect(verifyTotp(RFC_SECRET, at(-2), { nowMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(2), { nowMs: now })).toBeNull();
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(RFC_SECRET, "12345", { nowMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", { nowMs: now })).toBeNull();
  });

  it("tolerates a space in the middle of the code", () => {
    const code = at(0);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { nowMs: now })).toBe(step);
  });

  it("rejects a reused code (step at or below lastUsedStep)", () => {
    const used = verifyTotp(RFC_SECRET, at(0), { nowMs: now });
    expect(used).toBe(step);
    expect(verifyTotp(RFC_SECRET, at(0), { nowMs: now, lastUsedStep: used })).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(-1), { nowMs: now, lastUsedStep: used })).toBeNull();
  });

  it("still accepts a newer code after a reuse block", () => {
    expect(verifyTotp(RFC_SECRET, at(1), { nowMs: now, lastUsedStep: step })).toBe(step + 1);
  });

  it("rejects a code from another secret", () => {
    const other = generateTotpSecret();
    expect(verifyTotp(other, at(0), { nowMs: now })).toBeNull();
  });
});

describe("buildOtpauthUrl", () => {
  it("builds an authenticator-compatible URL", () => {
    const url = buildOtpauthUrl("JBSWY3DPEHPK3PXP", "AsanPay", "admin");
    expect(url).toBe(
      "otpauth://totp/AsanPay:admin?secret=JBSWY3DPEHPK3PXP&issuer=AsanPay&algorithm=SHA1&digits=6&period=30",
    );
  });
});

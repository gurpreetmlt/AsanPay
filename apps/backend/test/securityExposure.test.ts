import { describe, expect, it } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";
import { LOG_REDACT_PATHS, REDACTED, redactUrlQuery } from "../src/utils/redact";
import { testOtpProductionViolations } from "../src/config/env";

describe("redactUrlQuery", () => {
  it("leaves URLs without a query alone", () => {
    expect(redactUrlQuery("/api/kyc/me")).toBe("/api/kyc/me");
  });

  it("redacts webhook tokens and api keys but keeps other params", () => {
    expect(redactUrlQuery("/api/webhooks/vyaparapi?token=abc123&status=ok")).toBe(
      `/api/webhooks/vyaparapi?token=${REDACTED}&status=ok`,
    );
    expect(redactUrlQuery("/x?api_key=k1&hub.verify_token=t2&page=2")).toBe(
      `/x?api_key=${REDACTED}&hub.verify_token=${REDACTED}&page=2`,
    );
  });

  it("matches encoded and mixed-case keys", () => {
    expect(redactUrlQuery("/x?Secret%5Fvalue=s&OTP=123456")).toBe(
      `/x?Secret%5Fvalue=${REDACTED}&OTP=${REDACTED}`,
    );
  });
});

describe("logger redaction", () => {
  function capture(obj: Record<string, unknown>): string {
    let out = "";
    const sink = new Writable({
      write(chunk, _enc, cb) {
        out += chunk.toString();
        cb();
      },
    });
    pino({ redact: { paths: LOG_REDACT_PATHS, censor: REDACTED } }, sink).info(obj, "test");
    return out;
  }

  it("censors credentials and identity numbers at any of the first three levels", () => {
    const line = capture({
      password: "Test1234",
      body: { aadhaarNumber: "123456789012", otp: "424242" },
      ctx: { input: { panNumber: "ABCDE1234F", biometricPayload: "<PidData/>" } },
      req: { headers: { authorization: "Bearer abc" } },
      userId: "u1",
    });
    for (const secret of ["Test1234", "123456789012", "424242", "ABCDE1234F", "<PidData/>", "Bearer abc"]) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain('"userId":"u1"');
  });
});

describe("testOtpProductionViolations", () => {
  const base = {
    NODE_ENV: "production",
    EXPOSE_OTP_IN_RESPONSE: false,
    TEST_OTP_OVERRIDES: "",
    TEST_SIGNUP_OTP_OVERRIDES: "",
  };

  it("passes a clean production config", () => {
    expect(testOtpProductionViolations(base)).toEqual([]);
  });

  it("allows exact review numbers in production", () => {
    expect(testOtpProductionViolations({ ...base, TEST_OTP_OVERRIDES: "9333333333:222222" })).toEqual([]);
  });

  it("refuses OTP-in-response in production", () => {
    expect(testOtpProductionViolations({ ...base, EXPOSE_OTP_IN_RESPONSE: true })).toHaveLength(1);
  });

  it("refuses wildcard and bare OTP overrides in production", () => {
    expect(testOtpProductionViolations({ ...base, TEST_SIGNUP_OTP_OVERRIDES: "*:242424" })).toHaveLength(1);
    expect(testOtpProductionViolations({ ...base, TEST_SIGNUP_OTP_OVERRIDES: '"*:242424"' })).toHaveLength(1);
    expect(testOtpProductionViolations({ ...base, TEST_OTP_OVERRIDES: "232323" })).toHaveLength(1);
    expect(
      testOtpProductionViolations({ ...base, TEST_OTP_OVERRIDES: "9333333333:222222, * : 111111" }),
    ).toHaveLength(1);
  });

  it("ignores everything outside production", () => {
    expect(
      testOtpProductionViolations({
        NODE_ENV: "development",
        EXPOSE_OTP_IN_RESPONSE: true,
        TEST_OTP_OVERRIDES: "*:111111",
        TEST_SIGNUP_OTP_OVERRIDES: "*:242424",
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";
import { LOG_REDACT_PATHS, REDACTED, censorLogValue, redactUrlQuery } from "../src/utils/redact";
import { launchSafetyViolations, testOtpProductionViolations } from "../src/config/env";

describe("launchSafetyViolations", () => {
  const safe = {
    NODE_ENV: "production",
    ALLOW_STUB_PROVIDERS: false,
    ALLOW_BIOMETRIC_REPLAY: false,
    REQUIRE_TXN_PIN: true,
    CORS_ORIGIN: "https://app.asanpay.in,https://admin.asanpay.in",
    AGENT_PORTAL_URL: "https://app.asanpay.in",
    TEST_OTP_OVERRIDES: "",
    TEST_SIGNUP_OTP_OVERRIDES: "",
  };
  const raw = { AGENT_PORTAL_URL: "https://app.asanpay.in", DATABASE_URL: "postgres://x@db/asanpay" };

  it("passes a launch-ready config", () => {
    expect(launchSafetyViolations(safe, raw)).toEqual([]);
  });

  it("flags every unsafe switch", () => {
    const problems = launchSafetyViolations(
      {
        ...safe,
        ALLOW_STUB_PROVIDERS: true,
        ALLOW_BIOMETRIC_REPLAY: true,
        REQUIRE_TXN_PIN: false,
        CORS_ORIGIN: "http://localhost:3000",
        AGENT_PORTAL_URL: "https://dev.asanpay.in",
      },
      { AGENT_PORTAL_URL: "https://dev.asanpay.in", DATABASE_URL: "postgres://x@db.ap-south-1.rds.amazonaws.com/asanpay" },
    );
    expect(problems).toHaveLength(6);
  });
});

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

  it("masks mobile numbers and emails instead of logging them in full", () => {
    let out = "";
    const sink = new Writable({
      write(chunk, _enc, cb) {
        out += chunk.toString();
        cb();
      },
    });
    pino({ redact: { paths: LOG_REDACT_PATHS, censor: censorLogValue } }, sink).info(
      { mobile: "9876543210", ctx: { email: "agent@example.com" }, dob: "1990-01-01" },
      "test",
    );
    expect(out).not.toContain("9876543210");
    expect(out).toContain("••••3210");
    expect(out).toContain("a***@example.com");
    expect(out).not.toContain("1990-01-01");
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

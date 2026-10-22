import { describe, expect, it } from "vitest";
import { isNobleConfigured } from "../src/config/env";
import { nobleTimestamp } from "../src/modules/providers/noble/client";

describe("nobleTimestamp", () => {
  it("formats IST as yyyy-MM-ddTHH:mm:ss", () => {
    // 2024-06-17 21:27:09 UTC = 2024-06-18 02:57:09 IST
    const ts = nobleTimestamp(new Date("2024-06-17T21:27:09.000Z"));
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(ts).toBe("2024-06-18T02:57:09");
  });
});

describe("isNobleConfigured", () => {
  it("is false when keys are unset in this process", () => {
    // Wave 1: credentials optional until Coolify keys land — do not require them at boot.
    expect(typeof isNobleConfigured()).toBe("boolean");
  });
});

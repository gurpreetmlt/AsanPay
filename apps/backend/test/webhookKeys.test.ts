import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_API_URL,
  buildCallbackUrl,
  callbackNote,
  generateWebhookSecret,
  isKeyUsable,
  isWebhookProvider,
  maskSecret,
  maskedCallbackUrl,
  matchWebhookToken,
  secretLast4,
  type WebhookKeyCandidate,
} from "../src/modules/webhookKeys/webhookKeys.helpers";

const NOW = new Date("2026-10-29T08:00:00Z");
const HOUR = 60 * 60 * 1000;

function key(id: string, secret: string, extra: Partial<WebhookKeyCandidate> = {}): WebhookKeyCandidate {
  return { id, secret, status: "active", expiresAt: null, ...extra };
}

describe("webhook key masking", () => {
  it("keeps only the last 4 characters", () => {
    expect(secretLast4("abcdef1234567890f3a2")).toBe("f3a2");
    expect(maskSecret("f3a2")).toBe("••••f3a2");
  });

  it("generates 48 hex characters", () => {
    const a = generateWebhookSecret();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(generateWebhookSecret()).not.toBe(a);
  });

  it("recognises supported providers only", () => {
    expect(isWebhookProvider("noble")).toBe(true);
    expect(isWebhookProvider("whatsapp")).toBe(true);
    expect(isWebhookProvider("stripe")).toBe(false);
    expect(isWebhookProvider(undefined)).toBe(false);
  });
});

describe("callback URL builder", () => {
  it("builds full and masked URLs for token providers", () => {
    expect(buildCallbackUrl("noble", "https://api.example.in/", "a b")).toBe(
      "https://api.example.in/api/webhooks/noble/callback?token=a%20b",
    );
    expect(maskedCallbackUrl("vyaparapi", undefined, "3f2a")).toBe(
      `${DEFAULT_PUBLIC_API_URL}/api/webhooks/vyaparapi/callback?token=••••3f2a`,
    );
  });

  it("returns a note instead of a URL for Telegram and WhatsApp", () => {
    expect(buildCallbackUrl("telegram", null, "x")).toBeNull();
    expect(maskedCallbackUrl("whatsapp", null, "abcd")).toBeNull();
    expect(callbackNote("telegram")).toMatch(/secret_token/);
    expect(callbackNote("whatsapp")).toMatch(/X-Hub-Signature-256/);
    expect(callbackNote("noble")).toBeNull();
  });
});

describe("matchWebhookToken", () => {
  it("matches any usable key", () => {
    const keys = [key("a", "first-secret-value-1"), key("b", "second-secret-value")];
    expect(matchWebhookToken("second-secret-value", keys, NOW)).toBe("b");
    expect(matchWebhookToken("  first-secret-value-1 ", keys, NOW)).toBe("a");
  });

  it("rejects wrong, empty and missing tokens", () => {
    const keys = [key("a", "first-secret-value-1")];
    expect(matchWebhookToken("first-secret-value-2", keys, NOW)).toBeNull();
    expect(matchWebhookToken("", keys, NOW)).toBeNull();
    expect(matchWebhookToken(null, keys, NOW)).toBeNull();
    expect(matchWebhookToken("anything", [], NOW)).toBeNull();
  });

  it("excludes disabled and expired keys but keeps keys inside the rotation window", () => {
    const keys = [
      key("disabled", "disabled-secret-value", { status: "disabled" }),
      key("expired", "expired-secret-value", { expiresAt: new Date(NOW.getTime() - 1) }),
      key("grace", "grace-secret-value", { expiresAt: new Date(NOW.getTime() + 23 * HOUR) }),
    ];
    expect(matchWebhookToken("disabled-secret-value", keys, NOW)).toBeNull();
    expect(matchWebhookToken("expired-secret-value", keys, NOW)).toBeNull();
    expect(matchWebhookToken("grace-secret-value", keys, NOW)).toBe("grace");
  });

  it("isKeyUsable mirrors the same rules", () => {
    expect(isKeyUsable({ status: "active", expiresAt: null }, NOW)).toBe(true);
    expect(isKeyUsable({ status: "active", expiresAt: NOW }, NOW)).toBe(false);
    expect(isKeyUsable({ status: "disabled", expiresAt: null }, NOW)).toBe(false);
  });
});

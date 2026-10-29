import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_API_URL,
  REJECT_ALERT_COOLDOWN_MS,
  REJECT_ALERT_WINDOW_MS,
  buildCallbackUrl,
  buildProviderMessage,
  callbackNote,
  classifyDelivery,
  evaluateRejectAlert,
  generateWebhookSecret,
  isKeyUsable,
  isRejectedDelivery,
  isTestCallbackBody,
  isWebhookProvider,
  maskSecret,
  maskedCallbackUrl,
  matchWebhookToken,
  providerHealthStatus,
  secretLast4,
  serverEnvironment,
  suggestKeyName,
  topIps,
  validateServices,
  type RejectEvent,
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

describe("service chips", () => {
  it("accepts allowed services, dedupes and keeps canonical order", () => {
    expect(validateServices("noble", ["CMS", "UPI QR", "CMS"])).toEqual({ ok: true, services: ["UPI QR", "CMS"] });
    expect(validateServices("vyaparapi", ["Recharge"])).toEqual({ ok: true, services: ["Recharge"] });
  });

  it("rejects empty lists and services from another provider", () => {
    expect(validateServices("noble", [])).toEqual({ ok: false, message: "Select at least one service for this key" });
    const wrong = validateServices("vyaparapi", ["UPI QR"]);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.message).toMatch(/not a VyaparAPI service/);
    expect(validateServices("telegram", [42]).ok).toBe(false);
  });
});

describe("suggestKeyName", () => {
  it("names every provider", () => {
    expect(suggestKeyName("noble", ["UPI QR", "Recharge", "CMS"])).toBe("Noble callbacks for UPI QR, Recharge and CMS");
    expect(suggestKeyName("vyaparapi", ["Recharge"])).toBe("VyaparAPI recharge callbacks");
    expect(suggestKeyName("telegram", ["Bot updates"])).toBe("Telegram bot webhook");
    expect(suggestKeyName("whatsapp", ["Support inbox"])).toBe("WhatsApp webhook signature (Meta App Secret)");
  });

  it("follows the selected Noble chips", () => {
    expect(suggestKeyName("noble", ["CMS"])).toBe("Noble callbacks for CMS");
    expect(suggestKeyName("noble", ["CMS", "UPI QR"])).toBe("Noble callbacks for UPI QR and CMS");
  });
});

describe("buildProviderMessage", () => {
  it("includes services, full URL and token for token providers", () => {
    const text = buildProviderMessage({
      provider: "noble",
      services: ["UPI QR", "Recharge", "CMS"],
      secret: "abc123",
      base: "https://api.example.in",
    });
    expect(text).toBe(
      [
        "Callback details for AsanPay (Noble)",
        "Services: UPI QR, Recharge, CMS",
        "Callback URL: https://api.example.in/api/webhooks/noble/callback?token=abc123",
        "Token: abc123",
        "Please send callbacks as POST to the URL above. The token is also accepted in the X-Callback-Token header.",
      ].join("\n"),
    );
  });

  it("uses provider-specific wording for Telegram and WhatsApp", () => {
    const tg = buildProviderMessage({ provider: "telegram", services: [], secret: "s3cret", base: null });
    expect(tg).toContain(`Webhook URL: ${DEFAULT_PUBLIC_API_URL}/api/webhooks/telegram`);
    expect(tg).toContain("Secret token: s3cret");
    expect(tg).toContain("Services: Bot updates");
    const wa = buildProviderMessage({ provider: "whatsapp", services: ["Support inbox"], secret: "app", base: null });
    expect(wa).toContain("/api/whatsapp/webhook");
    expect(wa).toContain("X-Hub-Signature-256");
    expect(wa).not.toContain("?token=");
  });
});

describe("delivery classification", () => {
  it("classifies missing, wrong, matched and test callbacks", () => {
    expect(classifyDelivery({ token: "", matchedKeyId: null })).toBe("no_token");
    expect(classifyDelivery({ token: "   ", matchedKeyId: null })).toBe("no_token");
    expect(classifyDelivery({ token: null, matchedKeyId: null })).toBe("no_token");
    expect(classifyDelivery({ token: "wrong", matchedKeyId: null })).toBe("bad_token");
    expect(classifyDelivery({ token: "right", matchedKeyId: "k1" })).toBe("ok");
    expect(classifyDelivery({ token: "right", matchedKeyId: "k1", isTest: true })).toBe("test");
  });

  it("flags only wrong/missing keys as rejected", () => {
    expect(isRejectedDelivery("bad_token")).toBe(true);
    expect(isRejectedDelivery("no_token")).toBe(true);
    expect(isRejectedDelivery("ok")).toBe(false);
    expect(isRejectedDelivery("error")).toBe(false);
  });

  it("recognises the admin test body only", () => {
    expect(isTestCallbackBody({ test: true, source: "asanpay-admin", at: "x" })).toBe(true);
    expect(isTestCallbackBody({ test: "true", source: "asanpay-admin" })).toBe(false);
    expect(isTestCallbackBody({ test: true, source: "someone" })).toBe(false);
    expect(isTestCallbackBody(null)).toBe(false);
  });
});

describe("wrong-key alert threshold", () => {
  const t0 = NOW.getTime();
  const burst = (n: number, ip = "1.2.3.4", start = t0): RejectEvent[] =>
    Array.from({ length: n }, (_, i) => ({ at: start + i * 1000, ip }));

  it("alerts at 10 rejections inside 10 minutes", () => {
    const now = t0 + 20_000;
    expect(evaluateRejectAlert(burst(9), now, null).send).toBe(false);
    const d = evaluateRejectAlert(burst(10), now, null);
    expect(d.send).toBe(true);
    expect(d.count).toBe(10);
    expect(d.topIps).toEqual([{ ip: "1.2.3.4", count: 10 }]);
  });

  it("ignores events older than the window", () => {
    const old = burst(10, "9.9.9.9", t0 - REJECT_ALERT_WINDOW_MS - 60_000);
    const d = evaluateRejectAlert([...old, ...burst(3)], t0 + 10_000, null);
    expect(d.send).toBe(false);
    expect(d.recent).toHaveLength(3);
  });

  it("sends at most once per hour per provider", () => {
    const now = t0 + 20_000;
    expect(evaluateRejectAlert(burst(12), now, now - 5 * 60_000).send).toBe(false);
    expect(evaluateRejectAlert(burst(12), now, now - REJECT_ALERT_COOLDOWN_MS).send).toBe(true);
  });

  it("ranks top IPs by count", () => {
    const events: RejectEvent[] = [...burst(3, "a"), ...burst(5, "b"), ...burst(1, "c"), { at: t0, ip: null }];
    expect(topIps(events, 2)).toEqual([
      { ip: "b", count: 5 },
      { ip: "a", count: 3 },
    ]);
  });
});

describe("serverEnvironment", () => {
  it("is dev outside production", () => {
    expect(serverEnvironment("development", "https://app.asanpay.in")).toBe("dev");
  });
  it("is dev in production while the agent portal is a dev address or unset", () => {
    expect(serverEnvironment("production", "https://dev.asanpay.in")).toBe("dev");
    expect(serverEnvironment("production", undefined)).toBe("dev");
  });
  it("is live in production with a non-dev agent portal", () => {
    expect(serverEnvironment("production", "https://app.asanpay.in")).toBe("live");
  });
});

describe("providerHealthStatus", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  it("is not_set without any key", () => {
    expect(providerHealthStatus({ hasKey: false, rejectedLastHour: 0, lastAcceptedAt: hoursAgo(1), now })).toBe("not_set");
  });
  it("alerts on many rejections even with recent callbacks", () => {
    expect(providerHealthStatus({ hasKey: true, rejectedLastHour: 10, lastAcceptedAt: hoursAgo(1), now })).toBe("alert");
  });
  it("is quiet when nothing was accepted for over a day", () => {
    expect(providerHealthStatus({ hasKey: true, rejectedLastHour: 0, lastAcceptedAt: hoursAgo(25), now })).toBe("quiet");
    expect(providerHealthStatus({ hasKey: true, rejectedLastHour: 0, lastAcceptedAt: null, now })).toBe("quiet");
  });
  it("is ok with a recent accepted callback", () => {
    expect(providerHealthStatus({ hasKey: true, rejectedLastHour: 2, lastAcceptedAt: hoursAgo(3), now })).toBe("ok");
  });
});

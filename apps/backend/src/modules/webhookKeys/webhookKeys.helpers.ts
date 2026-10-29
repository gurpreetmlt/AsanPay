import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Pure helpers for webhook keys — no DB / env access so they stay unit-testable. */

export const WEBHOOK_PROVIDERS = ["noble", "vyaparapi", "telegram", "whatsapp"] as const;
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];

export const WEBHOOK_KEY_SOURCES = ["generated", "pasted"] as const;
export type WebhookKeySource = (typeof WEBHOOK_KEY_SOURCES)[number];

export const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PUBLIC_API_URL = "https://api.asanpay.in";
export const PASTED_SECRET_MIN = 16;
export const PASTED_SECRET_MAX = 200;
const MASK = "••••";

export function isWebhookProvider(value: unknown): value is WebhookProvider {
  return typeof value === "string" && (WEBHOOK_PROVIDERS as readonly string[]).includes(value);
}

/** 24 random bytes → 48 hex characters (also valid as a Telegram secret_token). */
export function generateWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

export function secretLast4(secret: string): string {
  return secret.slice(-4);
}

export function maskSecret(last4: string): string {
  return `${MASK}${last4}`;
}

export interface WebhookKeyState {
  status: string;
  expiresAt: Date | null;
}

export function isKeyUsable(key: WebhookKeyState, now: Date = new Date()): boolean {
  if (key.status !== "active") return false;
  return key.expiresAt == null || key.expiresAt.getTime() > now.getTime();
}

export interface WebhookKeyCandidate extends WebhookKeyState {
  id: string;
  secret: string;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Returns the id of the usable key that equals `token`, or null. Every usable candidate is
 * compared (no early exit) so timing does not reveal which key, or how many, exist.
 */
export function matchWebhookToken(
  token: string | null | undefined,
  candidates: readonly WebhookKeyCandidate[],
  now: Date = new Date(),
): string | null {
  const got = typeof token === "string" ? token.trim() : "";
  if (!got) return null;
  const gotDigest = digest(got);
  let matched: string | null = null;
  for (const c of candidates) {
    if (!c.secret || !isKeyUsable(c, now)) continue;
    if (timingSafeEqual(gotDigest, digest(c.secret)) && matched == null) matched = c.id;
  }
  return matched;
}

export function callbackPath(provider: WebhookProvider): string | null {
  if (provider === "noble") return "/api/webhooks/noble/callback";
  if (provider === "vyaparapi") return "/api/webhooks/vyaparapi/callback";
  return null;
}

const ENDPOINT_PATHS: Record<WebhookProvider, string> = {
  noble: "/api/webhooks/noble/callback",
  vyaparapi: "/api/webhooks/vyaparapi/callback",
  telegram: "/api/webhooks/telegram",
  whatsapp: "/api/whatsapp/webhook",
};

/** Endpoint URL without any token — what the provider is configured to call. */
export function endpointUrl(provider: WebhookProvider, base: string | null | undefined): string {
  return `${normalizeBaseUrl(base)}${ENDPOINT_PATHS[provider]}`;
}

export function normalizeBaseUrl(base: string | null | undefined): string {
  const trimmed = (base ?? "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_PUBLIC_API_URL;
}

/** Full callback URL including the token. Null for providers configured without a URL token. */
export function buildCallbackUrl(provider: WebhookProvider, base: string | null | undefined, token: string): string | null {
  const path = callbackPath(provider);
  if (!path) return null;
  return `${normalizeBaseUrl(base)}${path}?token=${encodeURIComponent(token)}`;
}

export function maskedCallbackUrl(provider: WebhookProvider, base: string | null | undefined, last4: string): string | null {
  const path = callbackPath(provider);
  if (!path) return null;
  return `${normalizeBaseUrl(base)}${path}?token=${maskSecret(last4)}`;
}

/** Shown instead of a callback URL for providers that take the key somewhere else. */
export function callbackNote(provider: WebhookProvider): string | null {
  if (provider === "telegram") return "Set as Telegram secret_token";
  if (provider === "whatsapp") return "Paste the Meta App Secret (used to verify X-Hub-Signature-256)";
  return null;
}

// ---------------------------------------------------------------------------
// Services, suggested names and provider messages
// ---------------------------------------------------------------------------

export const PROVIDER_LABELS: Record<WebhookProvider, string> = {
  noble: "Noble",
  vyaparapi: "VyaparAPI",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

export const WEBHOOK_SERVICES: Record<WebhookProvider, readonly string[]> = {
  noble: ["UPI QR", "Recharge", "CMS"],
  vyaparapi: ["Recharge"],
  telegram: ["Bot updates"],
  whatsapp: ["Support inbox"],
};

export type ServicesCheck = { ok: true; services: string[] } | { ok: false; message: string };

/** Dedupes and returns the services in the provider's canonical order. */
export function validateServices(provider: WebhookProvider, services: readonly unknown[] | null | undefined): ServicesCheck {
  const allowed = WEBHOOK_SERVICES[provider];
  const picked = new Set<string>();
  for (const s of services ?? []) {
    const value = typeof s === "string" ? s.trim() : "";
    if (!allowed.includes(value)) {
      return {
        ok: false,
        message: `"${String(s)}" is not a ${PROVIDER_LABELS[provider]} service. Choose from: ${allowed.join(", ")}`,
      };
    }
    picked.add(value);
  }
  if (picked.size === 0) return { ok: false, message: "Select at least one service for this key" };
  return { ok: true, services: allowed.filter((s) => picked.has(s)) };
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function suggestKeyName(provider: WebhookProvider, services: readonly string[]): string {
  if (provider === "noble") {
    const picked = WEBHOOK_SERVICES.noble.filter((s) => services.includes(s));
    return `Noble callbacks for ${joinList(picked.length ? picked : WEBHOOK_SERVICES.noble)}`;
  }
  if (provider === "vyaparapi") return "VyaparAPI recharge callbacks";
  if (provider === "telegram") return "Telegram bot webhook";
  return "WhatsApp webhook signature (Meta App Secret)";
}

/** Plain text the admin can send to the provider (or keep for setup). Contains the secret. */
export function buildProviderMessage(input: {
  provider: WebhookProvider;
  services: readonly string[];
  secret: string;
  base: string | null | undefined;
}): string {
  const { provider, secret, base } = input;
  const services = input.services.length ? input.services : WEBHOOK_SERVICES[provider];
  const label = PROVIDER_LABELS[provider];
  const servicesLine = `Services: ${services.join(", ")}`;
  if (provider === "telegram") {
    return [
      "Webhook details for AsanPay (Telegram)",
      servicesLine,
      `Webhook URL: ${endpointUrl(provider, base)}`,
      `Secret token: ${secret}`,
      "Set this as secret_token when calling setWebhook. Telegram sends it back in the X-Telegram-Bot-Api-Secret-Token header.",
    ].join("\n");
  }
  if (provider === "whatsapp") {
    return [
      "Webhook details for AsanPay (WhatsApp)",
      servicesLine,
      `Callback URL: ${endpointUrl(provider, base)}`,
      `App Secret: ${secret}`,
      "This must be the App Secret of the Meta app. Meta signs every event with it in the X-Hub-Signature-256 header.",
    ].join("\n");
  }
  return [
    `Callback details for AsanPay (${label})`,
    servicesLine,
    `Callback URL: ${buildCallbackUrl(provider, base, secret)}`,
    `Token: ${secret}`,
    "Please send callbacks as POST to the URL above. The token is also accepted in the X-Callback-Token header.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Callback deliveries
// ---------------------------------------------------------------------------

export const DELIVERY_RESULTS = ["ok", "bad_token", "no_token", "error", "test"] as const;
export type DeliveryResult = (typeof DELIVERY_RESULTS)[number];
export const TEST_CALLBACK_SOURCE = "asanpay-admin";
export const DELIVERY_KEEP_PER_PROVIDER = 500;

export function classifyDelivery(input: {
  token: string | null | undefined;
  matchedKeyId: string | null;
  isTest?: boolean;
}): DeliveryResult {
  if (!(typeof input.token === "string" && input.token.trim())) return "no_token";
  if (!input.matchedKeyId) return "bad_token";
  return input.isTest ? "test" : "ok";
}

export function isRejectedDelivery(result: string): boolean {
  return result === "bad_token" || result === "no_token";
}

/** Only checked after the token matched — an outsider cannot use it to skip auth. */
export function isTestCallbackBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.test === true && b.source === TEST_CALLBACK_SOURCE;
}

// ---------------------------------------------------------------------------
// Wrong-key alert
// ---------------------------------------------------------------------------

export const REJECT_ALERT_THRESHOLD = 10;
export const REJECT_ALERT_WINDOW_MS = 10 * 60 * 1000;
export const REJECT_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export interface RejectEvent {
  at: number;
  ip: string | null;
}

export interface RejectAlertDecision {
  send: boolean;
  count: number;
  topIps: { ip: string; count: number }[];
  /** Events still inside the window — keep these for the next check. */
  recent: RejectEvent[];
}

export function topIps(events: readonly RejectEvent[], limit = 3): { ip: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const ip = e.ip || "unknown";
    counts.set(ip, (counts.get(ip) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count || a.ip.localeCompare(b.ip))
    .slice(0, limit);
}

export function evaluateRejectAlert(
  events: readonly RejectEvent[],
  now: number,
  lastAlertAt: number | null,
): RejectAlertDecision {
  const recent = events.filter((e) => now - e.at < REJECT_ALERT_WINDOW_MS);
  const cooledDown = lastAlertAt == null || now - lastAlertAt >= REJECT_ALERT_COOLDOWN_MS;
  const send = recent.length >= REJECT_ALERT_THRESHOLD && cooledDown;
  return { send, count: recent.length, topIps: send ? topIps(recent) : [], recent };
}

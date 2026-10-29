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

function callbackPath(provider: WebhookProvider): string | null {
  if (provider === "noble") return "/api/webhooks/noble/callback";
  if (provider === "vyaparapi") return "/api/webhooks/vyaparapi/callback";
  return null;
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

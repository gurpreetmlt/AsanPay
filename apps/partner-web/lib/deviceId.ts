/**
 * Persistent per-browser device identifier for the "trusted device" login flow (skip OTP,
 * MPIN-only, within a rolling window — see DEVICE_TRUST_WINDOW_MS in the backend's
 * auth.service.ts). Not a secret by itself: the backend only trusts it alongside a recent
 * successful auth on that same deviceId row, so reading/copying this value alone grants nothing.
 * Clearing browser storage (or a different browser/profile) generates a new id, which is what
 * makes the trust revoke-on-reset behaviour work without any extra code.
 */

const DEVICE_ID_KEY = "asanpay.deviceId.v1";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `web_${crypto.randomUUID()}`;
  }
  return `web_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = randomId();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    // localStorage unavailable (private mode, disabled storage) — fall back to a per-load id.
    return randomId();
  }
}

/** Best-effort human-readable label for the Trusted Devices list. */
export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Web browser";
  const ua = navigator.userAgent;
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return "Chrome browser";
  if (/firefox/i.test(ua)) return "Firefox browser";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari browser";
  if (/edg/i.test(ua)) return "Edge browser";
  return "Web browser";
}

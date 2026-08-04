/**
 * Remembers the last agent who logged in on this browser so the login page can offer a fast
 * MPIN "welcome back" unlock (skip OTP) on a trusted device, instead of forcing OTP every time.
 * Survives logout on purpose — device trust is what gates MPIN login server-side (rolling
 * window; see DEVICE_TRUST_WINDOW_MS in the backend, currently 12h). Logout only kills JWT refresh tokens;
 * it must not revoke device trust, otherwise Welcome-back MPIN always fails after logout.
 * Cleared when the user picks "use a different number".
 */

const KEY = "asanpay.lastLogin.v1";

export interface RememberedLogin {
  mobile: string;
  name: string;
}

export function getRememberedLogin(): RememberedLogin | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedLogin;
    return parsed.mobile ? parsed : null;
  } catch {
    return null;
  }
}

export function setRememberedLogin(value: RememberedLogin): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — welcome-back just won't persist */
  }
}

export function clearRememberedLogin(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

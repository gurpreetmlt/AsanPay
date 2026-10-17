import { createAppStorage } from "./appStorage";
import type { LoginRoleChip } from "../screens/LoginScreen";

/**
 * Remembers the last agent who logged in on this phone so LoginScreen can go straight to the
 * MPIN "welcome back" unlock (skipping the OTP request entirely) on a trusted device, instead of
 * firing an OTP every time the number is entered. Trust is still enforced server-side (rolling
 * window; see DEVICE_TRUST_WINDOW_MS in the backend) — this is only a UX hint about who to greet
 * and which flow to open first. Cleared on "use a different number".
 */

const storage = createAppStorage();
const KEY = "adhikari.lastLogin.v1";

export interface RememberedLogin {
  mobile: string;
  role: LoginRoleChip;
  /** Display name for lock-screen greeting (optional — older installs may not have it). */
  name?: string;
  /** epoch ms of the last successful OTP/password/MPIN auth — local mirror of the backend's
   * rolling device-trust window (DEVICE_TRUST_WINDOW_MS), so the app can skip straight to full
   * login instead of showing PIN first and then bouncing off a DEVICE_NOT_TRUSTED response. */
  lastAuthAt?: number;
}

/** Must match DEVICE_TRUST_WINDOW_MS in the backend's auth.service.ts. */
export const DEVICE_TRUST_WINDOW_MS = 12 * 60 * 60 * 1000;

export async function getRememberedLogin(): Promise<RememberedLogin | null> {
  try {
    const raw = await storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedLogin;
    return parsed.mobile ? parsed : null;
  } catch {
    return null;
  }
}

/** True once the local mirror of the trust window has lapsed — skip PIN, go straight to login. */
export function isTrustWindowExpired(remembered: RememberedLogin): boolean {
  if (!remembered.lastAuthAt) return false; // unknown = don't guess, let the server be the judge
  return Date.now() - remembered.lastAuthAt >= DEVICE_TRUST_WINDOW_MS;
}

export async function setRememberedLogin(value: RememberedLogin): Promise<void> {
  try {
    await storage.setItem(KEY, JSON.stringify({ ...value, lastAuthAt: value.lastAuthAt ?? Date.now() }));
  } catch {
    /* storage unavailable — welcome-back just won't persist */
  }
}

/** Bump the local trust-window timestamp after a successful MPIN/biometric unlock. */
export async function touchRememberedLoginAuth(): Promise<void> {
  const existing = await getRememberedLogin();
  if (!existing) return;
  await setRememberedLogin({ ...existing, lastAuthAt: Date.now() });
}

/**
 * Keep mobile / role / display name in sync while a session is active so cold-start
 * "Welcome back {Name}" works even if an older install saved login without `name`.
 */
export async function syncRememberedLoginProfile(input: {
  mobile: string;
  role: LoginRoleChip;
  name?: string | null;
  /** When true, refresh the local trust-window clock (successful auth). */
  touchAuth?: boolean;
}): Promise<void> {
  const existing = await getRememberedLogin();
  const name = (input.name?.trim() || existing?.name?.trim() || undefined);
  await setRememberedLogin({
    mobile: input.mobile,
    role: input.role,
    ...(name ? { name } : {}),
    lastAuthAt: input.touchAuth ? Date.now() : (existing?.lastAuthAt ?? Date.now()),
  });
}

export async function clearRememberedLogin(): Promise<void> {
  try {
    await storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

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
}

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

export async function setRememberedLogin(value: RememberedLogin): Promise<void> {
  try {
    await storage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — welcome-back just won't persist */
  }
}

export async function clearRememberedLogin(): Promise<void> {
  try {
    await storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

import { Platform } from "react-native";
import { createAppStorage } from "./appStorage";

/**
 * Persistent per-install device identifier for the "trusted device" login flow (skip OTP,
 * MPIN-only, within a rolling window — see DEVICE_TRUST_WINDOW_MS in the backend's
 * auth.service.ts). Not a secret by itself: the backend only trusts it alongside a recent
 * successful auth on that same deviceId row, so reading/copying this value alone grants nothing.
 * A fresh app install (or "Clear data") generates a new id, which is what makes the trust
 * revoke-on-reinstall behaviour work without any extra code.
 */

const storage = createAppStorage();
const DEVICE_ID_KEY = "adhikari.deviceId.v1";

function randomId(): string {
  // Not cryptographically significant — just needs to be unique per install.
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `dev_${rand}`;
}

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await storage.getItem(DEVICE_ID_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const created = randomId();
  await storage.setItem(DEVICE_ID_KEY, created);
  cached = created;
  return created;
}

/** Best-effort human-readable label for the Trusted Devices list — no extra native module. */
export function getDeviceLabel(): string {
  const os = Platform.OS === "ios" ? "iOS" : "Android";
  return `${os} ${Platform.Version}`;
}

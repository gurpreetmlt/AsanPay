import { NativeModules } from "react-native";
import { showAlert } from "../components/AppAlert";
import { createAppStorage } from "./appStorage";
import {
  getSecureRefreshToken,
  setSecureRefreshToken,
  clearSecureRefreshToken,
} from "./secureStorage";
import type { LoginRoleChip } from "../screens/LoginScreen";

const storage = createAppStorage();
/**
 * Biometric unlock: mobile/role/enabled (not sensitive) stay in plain app storage; refreshToken
 * goes to Android Keystore / iOS Keychain (see secureStorage.ts) — hardware-encrypted, doesn't
 * survive a rooted-device or adb-backup extraction the way plain AsyncStorage does. If the native
 * keychain module isn't linked yet (dev build before rebuild), falls back to app storage for the
 * token too, so the feature degrades instead of breaking; upgrades to Keystore automatically once
 * the app is rebuilt with react-native-keychain linked.
 * Logout MUST call disableBioUnlock().
 */
const BIO_META_KEY = "adhikari.bioUnlock.meta.v1";
const BIO_FALLBACK_TOKEN_KEY = "adhikari.bioUnlock.fallbackToken.v1";
// Pre-Keystore format: refreshToken lived inline in this record. Migrated on first read.
const BIO_LEGACY_KEY = "adhikari.bioUnlock.v1";

export type BioUnlockRecord = {
  mobile: string;
  role: LoginRoleChip;
  refreshToken: string;
  enabled: boolean;
};

type BioMeta = { mobile: string; role: LoginRoleChip; enabled: boolean };

async function readMeta(): Promise<BioMeta | null> {
  try {
    const raw = await storage.getItem(BIO_META_KEY);
    if (raw) return JSON.parse(raw) as BioMeta;
  } catch {
    /* fall through to legacy migration */
  }

  try {
    const legacyRaw = await storage.getItem(BIO_LEGACY_KEY);
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw) as BioUnlockRecord;
    if (!legacy.enabled) {
      await storage.removeItem(BIO_LEGACY_KEY);
      return null;
    }
    const stored = await storeRefreshToken(legacy.refreshToken);
    const meta: BioMeta = { mobile: legacy.mobile, role: legacy.role, enabled: stored };
    await storage.setItem(BIO_META_KEY, JSON.stringify(meta));
    await storage.removeItem(BIO_LEGACY_KEY);
    return stored ? meta : null;
  } catch {
    return null;
  }
}

async function storeRefreshToken(refreshToken: string): Promise<boolean> {
  const storedSecurely = await setSecureRefreshToken(refreshToken);
  if (storedSecurely) {
    await storage.removeItem(BIO_FALLBACK_TOKEN_KEY);
    return true;
  }

  // Production must never persist refresh tokens in plain app storage.
  if (!__DEV__) {
    await storage.removeItem(BIO_FALLBACK_TOKEN_KEY);
    return false;
  }

  try {
    await storage.setItem(BIO_FALLBACK_TOKEN_KEY, refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function getBioUnlock(): Promise<BioUnlockRecord | null> {
  const meta = await readMeta();
  if (!meta?.enabled) return null;
  const fallbackToken = __DEV__ ? await storage.getItem(BIO_FALLBACK_TOKEN_KEY) : null;
  const refreshToken = (await getSecureRefreshToken()) ?? fallbackToken;
  if (!refreshToken) return null;
  return { ...meta, refreshToken };
}

export async function enableBioUnlock(input: {
  mobile: string;
  role: LoginRoleChip;
  refreshToken: string;
}): Promise<void> {
  const stored = await storeRefreshToken(input.refreshToken);
  const meta: BioMeta = { mobile: input.mobile, role: input.role, enabled: stored };
  await storage.setItem(BIO_META_KEY, JSON.stringify(meta));
}

export async function disableBioUnlock(): Promise<void> {
  await storage.removeItem(BIO_META_KEY);
  await storage.removeItem(BIO_FALLBACK_TOKEN_KEY);
  await storage.removeItem(BIO_LEGACY_KEY);
  await clearSecureRefreshToken();
}

export async function updateBioRefreshToken(refreshToken: string): Promise<void> {
  const meta = await readMeta();
  if (!meta?.enabled) return;
  const stored = await storeRefreshToken(refreshToken);
  if (!stored) {
    await storage.setItem(BIO_META_KEY, JSON.stringify({ ...meta, enabled: false }));
  }
}

export type BioPromptResult = "success" | "cancel" | "unavailable";

type BiometricsCtor = new (opts?: { allowDeviceCredentials?: boolean }) => {
  isSensorAvailable: () => Promise<{ available: boolean }>;
  simplePrompt: (opts: { promptMessage: string }) => Promise<{ success: boolean }>;
};

function nativeBiometricsPresent(): boolean {
  const mods = NativeModules as Record<string, unknown>;
  return Boolean(mods.ReactNativeBiometrics || mods.RNBiometrics);
}

/**
 * Soft prompt when the native biometric module is not linked / not installed.
 * Never `require()` a missing package — Metro throws "Requiring unknown module undefined".
 */
function softDevPrompt(promptMessage: string): Promise<BioPromptResult> {
  if (!__DEV__) return Promise.resolve("unavailable");
  return new Promise((resolve) => {
    showAlert(promptMessage, "Native biometric module not linked yet. Simulate unlock?", [
      { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
      { text: "Simulate OK", style: "primary", onPress: () => resolve("success") },
    ]);
  });
}

/**
 * Phone fingerprint / face unlock.
 * Requires: `npm i react-native-biometrics` + Android rebuild (Mac Terminal).
 */
export async function promptDeviceBiometric(
  promptMessage = "Unlock AsanPay",
): Promise<BioPromptResult> {
  if (!nativeBiometricsPresent()) {
    return softDevPrompt(promptMessage);
  }

  try {
    // Native module exists → JS package must be installed too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-biometrics") as { default?: BiometricsCtor } & BiometricsCtor;
    const ReactNativeBiometrics = (mod.default ?? mod) as BiometricsCtor;
    // false: on fingerprint failure/cancel, fall through to our own PIN screen instead of
    // Android's native device-credential (phone lock PIN/pattern) prompt, which is a different,
    // confusing "password" screen unrelated to the AsanPay PIN.
    const rnBiometrics = new ReactNativeBiometrics({ allowDeviceCredentials: false });
    const { available } = await rnBiometrics.isSensorAvailable();
    if (!available) return softDevPrompt(promptMessage);
    const { success } = await rnBiometrics.simplePrompt({ promptMessage });
    return success ? "success" : "cancel";
  } catch {
    return softDevPrompt(promptMessage);
  }
}

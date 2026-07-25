/**
 * Hardware-backed storage (Android Keystore / iOS Keychain via `react-native-keychain`) for the
 * single most sensitive value kept on-device: the biometric-unlock refresh token. AsyncStorage
 * (used everywhere else in this app) is plain-text on disk — extractable from a rooted device or
 * an adb backup. Keystore/Keychain entries are hardware-encrypted and don't survive either path.
 *
 * Soft-import, same pattern as promptDeviceBiometric in bioUnlock.ts: never `require()`
 * unconditionally, or Metro throws "Requiring unknown module" before the native module is linked
 * and the app is rebuilt. Callers get `false`/`null` back and degrade gracefully instead of
 * crashing — see bioUnlock.ts's fallback-to-app-storage path.
 */

type KeychainModule = {
  setGenericPassword: (
    username: string,
    password: string,
    options?: { service?: string },
  ) => Promise<false | { service: string; storage: string }>;
  getGenericPassword: (options?: { service?: string }) => Promise<false | { username: string; password: string }>;
  resetGenericPassword: (options?: { service?: string }) => Promise<boolean>;
};

function loadKeychain(): KeychainModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-keychain") as KeychainModule;
  } catch {
    return null;
  }
}

const SERVICE = "com.asanpay.bioRefreshToken";

export function isSecureStorageAvailable(): boolean {
  return loadKeychain() !== null;
}

export async function setSecureRefreshToken(token: string): Promise<boolean> {
  const kc = loadKeychain();
  if (!kc) return false;
  try {
    const result = await kc.setGenericPassword("bioRefreshToken", token, { service: SERVICE });
    return result !== false;
  } catch {
    return false;
  }
}

export async function getSecureRefreshToken(): Promise<string | null> {
  const kc = loadKeychain();
  if (!kc) return null;
  try {
    const result = await kc.getGenericPassword({ service: SERVICE });
    return result ? result.password : null;
  } catch {
    return null;
  }
}

export async function clearSecureRefreshToken(): Promise<void> {
  const kc = loadKeychain();
  if (!kc) return;
  try {
    await kc.resetGenericPassword({ service: SERVICE });
  } catch {
    /* ignore */
  }
}

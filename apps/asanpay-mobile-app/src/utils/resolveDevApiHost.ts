import { NativeModules, Platform } from "react-native";

type PlatformDeviceConstants = {
  Model?: string;
  Fingerprint?: string;
};

/**
 * Mac Wi‑Fi IP — only for physical Android WITHOUT USB/adb reverse.
 * Update if Mac IP changes: `ipconfig getifaddr en0`
 */
export const DEV_API_LAN_HOST = "192.168.1.6";

/**
 * Manual override. Prefer `null` + USB:
 *   adb reverse tcp:4000 tcp:4000
 *   adb reverse tcp:8081 tcp:8081
 * Set to LAN IP only when testing over Wi‑Fi without reverse.
 */
export const DEV_API_HOST_OVERRIDE: string | null = null;

/** Use LAN instead of localhost when Metro is not on localhost/USB. */
export const DEV_API_PREFER_LAN = false;

function metroBundlerHost(): string | null {
  try {
    const sourceCode = NativeModules.SourceCode as
      | { scriptURL?: string; getConstants?: () => { scriptURL?: string } }
      | undefined;
    const scriptURL: string | undefined =
      sourceCode?.scriptURL ?? sourceCode?.getConstants?.()?.scriptURL;
    if (!scriptURL) return null;
    const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
    const host = match?.[1];
    if (!host || host === "localhost" || host === "127.0.0.1") return null;
    return host;
  } catch {
    return null;
  }
}

function isAndroidEmulator(): boolean {
  const constants = Platform.constants as PlatformDeviceConstants;
  const model = String(constants.Model ?? "");
  const fingerprint = String(constants.Fingerprint ?? "");
  return (
    fingerprint.includes("generic") ||
    model.toLowerCase().includes("sdk") ||
    model.toLowerCase().includes("emulator")
  );
}

export function resolveDevApiHost(): string {
  if (DEV_API_HOST_OVERRIDE) return DEV_API_HOST_OVERRIDE;

  const fromMetro = metroBundlerHost();
  if (fromMetro) return fromMetro;

  if (Platform.OS === "android") {
    if (isAndroidEmulator()) return "10.0.2.2";
    // USB debugging: Metro is often localhost → API must be localhost + adb reverse :4000
    if (DEV_API_PREFER_LAN) return DEV_API_LAN_HOST;
    return "localhost";
  }

  return "localhost";
}

import { NativeModules, Platform } from "react-native";
import Geolocation from "@react-native-community/geolocation";

const { MockLocation } = NativeModules as {
  MockLocation?: { isMockLocation(): Promise<boolean | null> };
};

export interface AepsGeoTag {
  latitude: string;
  longitude: string;
  accuracyMeters?: number;
  /**
   * From the native `MockLocation` module (Android only), which reads
   * `Location.isFromMockProvider()` off the last known fix — a flag
   * @react-native-community/geolocation does not expose through its JS bridge. `undefined` means
   * "unknown" (no native module, iOS, no permission, or no cached fix yet), not "confirmed
   * genuine" — left unset rather than sending a fabricated `false`, since log-only findings only
   * mean something if what they log is real.
   */
  isMockLocation?: boolean;
}

export async function detectMockLocation(): Promise<boolean | undefined> {
  if (Platform.OS !== "android" || !MockLocation) return undefined;
  try {
    const result = await MockLocation.isMockLocation();
    return result ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Best-effort location for the risk signals in modules/risk/riskSignal.service.ts (task #15).
 * Deliberately non-blocking and never throws: a location failure must never stop an AePS
 * transaction, matching the "GPS off -> allow, log, soft limit, never block" policy already
 * documented for this feature. Callers get `null` on any failure or timeout and proceed as if
 * no location was captured — which is exactly what already happens today.
 */
export function getAepsGeoTag(): Promise<AepsGeoTag | null> {
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      async (pos) => {
        resolve({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
          accuracyMeters:
            typeof pos.coords.accuracy === "number" ? Math.round(pos.coords.accuracy) : undefined,
          isMockLocation: await detectMockLocation(),
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 },
    );
  });
}

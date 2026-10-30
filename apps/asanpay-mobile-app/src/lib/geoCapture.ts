import { NativeModules, PermissionsAndroid, Platform, TurboModuleRegistry } from "react-native";
import Geolocation, { type GeolocationResponse } from "@react-native-community/geolocation";
import type { SignupGeoFix } from "./signupDraft";

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

type JailMonkeyApi = { isJailBroken(): boolean; canMockLocation(): boolean };

/** jail-monkey only when its native module is linked — requiring it without the APK rebuild would crash. */
function jailMonkey(): JailMonkeyApi | null {
  if (!TurboModuleRegistry.get("JailMonkey") && !(NativeModules as Record<string, unknown>).JailMonkey) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("jail-monkey") as { default?: JailMonkeyApi } & JailMonkeyApi;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

export const SIGNUP_GEO_MAX_ACCURACY_M = 150;
export const SIGNUP_GEO_LOW_ACCURACY_MESSAGE =
  "Location is not accurate enough. Turn on GPS, go near a window and try again.";

const GOOD_ACCURACY_M = 30;
const WATCH_MS = 15_000;

/** Recent cached fix (fused keeps one from Wi-Fi / cell even when GPS has no sky view). */
function cachedFix(): Promise<GeolocationResponse> {
  return new Promise((resolve, reject) =>
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 6000,
      maximumAge: 120_000,
    }),
  );
}

/**
 * Best high-accuracy fix within WATCH_MS (stops early once it is good). Fused reports
 * "location not available" before its first fix indoors, so only a permission error ends
 * the watch early; anything else keeps waiting until the window closes.
 */
export function bestFix(windowMs: number = WATCH_MS): Promise<GeolocationResponse> {
  const watch = new Promise<GeolocationResponse>((resolve, reject) => {
    let best: GeolocationResponse | null = null;
    let lastErr: { code?: number } | undefined;
    let settled = false;
    let watchId: number | null = null;
    const finish = (pos: GeolocationResponse | null) => {
      if (settled) return;
      settled = true;
      if (watchId != null) Geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (pos) resolve(pos);
      else reject(lastErr ?? { code: 3 });
    };
    const timer = setTimeout(() => finish(best), windowMs);
    watchId = Geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= GOOD_ACCURACY_M) finish(pos);
      },
      (err) => {
        lastErr = err;
        if (err?.code === 1) finish(null);
      },
      { enableHighAccuracy: true, distanceFilter: 0, interval: 1000, fastestInterval: 500, maximumAge: 0, timeout: windowMs + 5000 },
    );
  });
  return watch.catch(async (err: { code?: number }) => {
    if (err?.code === 1) throw err;
    try {
      return await cachedFix();
    } catch {
      throw err;
    }
  });
}

/**
 * Signup shop / home location: permission → high-accuracy GPS → mock check (native module +
 * jail-monkey) → ±150 m rule. Throws an English, agent-readable message on any failure.
 */
export async function captureSignupLocation(place: "shop" | "home"): Promise<SignupGeoFix> {
  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
      title: "Location permission",
      message: `AsanPay needs your exact location to save your ${place} location.`,
      buttonPositive: "Allow",
    });
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("Location permission is off. Allow location for AsanPay in Settings, then tap Fetch location again.");
    }
  }
  let pos: GeolocationResponse;
  try {
    pos = await bestFix();
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 1) throw new Error("Location permission is off. Allow location for AsanPay in Settings, then tap Fetch location again.");
    if (code === 2) {
      throw new Error(
        "Could not get your location. Check Location is on in quick settings, go near a window or step outside, then tap Fetch location again.",
      );
    }
    throw new Error(SIGNUP_GEO_LOW_ACCURACY_MESSAGE);
  }
  const jm = jailMonkey();
  let jmMock = false;
  try {
    jmMock = Boolean(jm?.canMockLocation());
  } catch {
    /* treat as unknown */
  }
  if ((await detectMockLocation()) || jmMock) {
    throw new Error("Turn off mock / fake location apps on your phone, then tap Fetch location again.");
  }
  const accuracy = Math.round(pos.coords.accuracy);
  if (!Number.isFinite(accuracy) || accuracy > SIGNUP_GEO_MAX_ACCURACY_M) {
    throw new Error(SIGNUP_GEO_LOW_ACCURACY_MESSAGE);
  }
  let isRooted: boolean | undefined;
  try {
    isRooted = jm ? Boolean(jm.isJailBroken()) : undefined;
  } catch {
    isRooted = undefined;
  }
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyMeters: accuracy,
    capturedAt: new Date().toISOString(),
    ...(isRooted != null ? { isRooted } : {}),
  };
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

import { PermissionsAndroid, Platform } from "react-native";
import { bestFix, detectMockLocation, getAepsGeoTag, type AepsGeoTag } from "./geoCapture";

export const LOCATION_REQUIRED_MESSAGE = "Allow location access before continuing";
export const LOCATION_UNAVAILABLE_MESSAGE =
  "Could not get your live location. Turn on Location (GPS), then try again.";

/**
 * Live GPS for money transactions (DMT transfer, AePS withdrawal / deposit, Aadhaar Pay).
 * Throws an Error with an agent-readable message when permission is denied or no fix arrives.
 */
export async function requireTxnLocation(): Promise<AepsGeoTag> {
  if (Platform.OS === "android") {
    const perm = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    if (!(await PermissionsAndroid.check(perm))) {
      const granted = await PermissionsAndroid.request(perm, {
        title: "Location permission",
        message: "AsanPay needs your live location for money transactions.",
        buttonPositive: "Allow",
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error(LOCATION_REQUIRED_MESSAGE);
    }
  }
  const quick = await getAepsGeoTag();
  if (quick) return quick;
  try {
    const pos = await bestFix(8000);
    return {
      latitude: pos.coords.latitude.toFixed(6),
      longitude: pos.coords.longitude.toFixed(6),
      accuracyMeters: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : undefined,
      isMockLocation: await detectMockLocation(),
    };
  } catch (err) {
    if ((err as { code?: number })?.code === 1) throw new Error(LOCATION_REQUIRED_MESSAGE);
    throw new Error(LOCATION_UNAVAILABLE_MESSAGE);
  }
}

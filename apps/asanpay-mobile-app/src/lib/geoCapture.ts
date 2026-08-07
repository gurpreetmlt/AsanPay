import Geolocation from "@react-native-community/geolocation";

export interface AepsGeoTag {
  latitude: string;
  longitude: string;
  accuracyMeters?: number;
  /**
   * NOT populated by this helper — @react-native-community/geolocation does not expose
   * Android's `Location.isFromMockProvider()` through its JS bridge. Real mock detection needs
   * a small native module reading that flag off the raw Location object, which does not exist
   * in this codebase yet (task #21 follow-up). Left undefined here rather than sending a
   * fabricated `false`, which would read to the backend as "confirmed genuine" when it is
   * really "unknown" — those are different things, and log-only findings only mean something
   * if what they log is real.
   */
  isMockLocation?: boolean;
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
      (pos) => {
        resolve({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
          accuracyMeters:
            typeof pos.coords.accuracy === "number" ? Math.round(pos.coords.accuracy) : undefined,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 },
    );
  });
}

import { PermissionsAndroid, Platform } from "react-native";
import { api } from "./api";
import { getDeviceId } from "./deviceId";
import { bestFix, detectMockLocation, getAepsGeoTag } from "./geoCapture";

export interface PendingLoginApproval {
  id: string;
  browser: string | null;
  ip: string | null;
  city: string | null;
  loginMethod: string;
  /** Three 2-digit numbers; one matches the number on the web screen. */
  choices: number[];
  createdAt: string;
  expiresAt: string;
}

export interface LoginFix {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  isMockLocation?: boolean;
}

export interface QrScanResult {
  approvalId: string;
  browser: string | null;
  ip: string | null;
  city: string | null;
  distanceKm: number | null;
  /** ok ≤ 5 km · near ≤ 50 km · far > 50 km · unknown (no shop GPS / weak fix). */
  locationStatus: "ok" | "near" | "far" | "unknown" | "mock";
  sameNetwork: boolean | null;
  expiresAt: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Push arrived / was tapped — the host re-fetches pending web login requests. */
export function notifyLoginApprovalPush(): void {
  listeners.forEach((l) => l());
}

export function onLoginApprovalPush(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isLoginApprovalMessage(data: Record<string, unknown> | undefined): boolean {
  return data?.type === "login_approval";
}

const LOCATION_OFF = "Location permission is off. Allow location for AsanPay in Settings, then try again.";

/** GPS for approving a web login (distance to the registered shop + fake-GPS check). */
export async function captureLoginLocation(): Promise<LoginFix> {
  if (Platform.OS === "android") {
    const perm = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    if (!(await PermissionsAndroid.check(perm))) {
      const granted = await PermissionsAndroid.request(perm, {
        title: "Location permission",
        message: "AsanPay checks your phone's location to confirm web logins near your shop.",
        buttonPositive: "Allow",
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error(LOCATION_OFF);
    }
  }
  const quick = await getAepsGeoTag();
  if (quick) {
    return {
      latitude: Number(quick.latitude),
      longitude: Number(quick.longitude),
      accuracyMeters: quick.accuracyMeters,
      isMockLocation: quick.isMockLocation,
    };
  }
  try {
    const pos = await bestFix(10_000);
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyMeters: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : undefined,
      isMockLocation: await detectMockLocation(),
    };
  } catch (err) {
    if ((err as { code?: number })?.code === 1) throw new Error(LOCATION_OFF);
    throw new Error("Could not get your location. Turn on Location (GPS), step near a window, then try again.");
  }
}

export async function fetchPendingLoginApprovals(): Promise<PendingLoginApproval[]> {
  const { data } = await api.get<{ data: { approvals: PendingLoginApproval[] } }>("/auth/login-approvals/pending");
  return data.data.approvals ?? [];
}

export async function decideLoginApproval(
  id: string,
  input: { decision: "approve" | "deny"; matchNumber?: number; location?: LoginFix; confirmFar?: boolean },
): Promise<"approved" | "denied"> {
  const deviceId = await getDeviceId();
  const { data } = await api.post<{ data: { status: "approved" | "denied" } }>(
    `/auth/login-approval/${id}/decide`,
    { ...input, deviceId },
  );
  return data.data.status;
}

export async function scanQrLogin(qr: string, fix: LoginFix): Promise<QrScanResult> {
  const deviceId = await getDeviceId();
  const { data } = await api.post<{ data: QrScanResult }>("/auth/qr-login/scan", { qr, deviceId, ...fix });
  return data.data;
}

/** "about 12 km from your shop" / "near your shop" for the confirm screens. */
export function describeDistance(distanceKm: number | null, status: QrScanResult["locationStatus"]): string {
  if (status === "unknown" || distanceKm == null) return "Shop distance unknown";
  if (status === "ok") return distanceKm < 1 ? "At your shop" : `${distanceKm} km from your shop`;
  return `About ${Math.round(distanceKm)} km from your shop`;
}

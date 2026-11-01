import { PermissionsAndroid, Platform } from "react-native";
import axios from "axios";
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging";
import { showAlert } from "../components/AppAlert";
import { useAuthStore } from "../store/auth";
import { API_BASE, api } from "./api";
import { getDeviceId } from "./deviceId";

/**
 * Must run at module load (index.js), before AppRegistry. Notification messages are drawn by the
 * system while the app is in the background; this handler only keeps data-only pushes from warning.
 */
export function registerBackgroundPushHandler(): void {
  setBackgroundMessageHandler(getMessaging(), async () => {});
}

/** Android 13+ needs a runtime grant; older versions allow notifications by default. */
export async function ensurePushPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (Number(Platform.Version) < 33) return true;
  const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(perm)) return true;
  const result = await PermissionsAndroid.request(perm);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * FCM does not show a system notification while the app is open, so foreground pushes are shown
 * as an in-app alert. Returns the unsubscribe function.
 */
export function startPushListeners(): () => void {
  const messaging = getMessaging();
  const unsubscribe = onMessage(messaging, (message) => {
    const title = message.notification?.title?.trim() || "AsanPay";
    const body = message.notification?.body?.trim();
    showAlert(title, body);
  });

  if (__DEV__) {
    getToken(messaging)
      .then((token) => console.log("[push] FCM token (Firebase console → Send test message):", token))
      .catch((e) => console.warn("[push] getToken failed", e));
  }

  return unsubscribe;
}

/** `${userId}:${token}` last saved on the backend — skips repeat posts for the same session. */
let registeredKey: string | null = null;

async function registerPushToken(token?: string): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;
  const fcmToken = token ?? (await getToken(getMessaging()));
  const key = `${userId}:${fcmToken}`;
  if (registeredKey === key) return;
  const deviceId = await getDeviceId();
  await api.post("/push/token", { deviceId, token: fcmToken, platform: Platform.OS });
  registeredKey = key;
}

/**
 * Keeps the backend's push token for this install current: after any sign-in (password, OTP,
 * MPIN, signup) and whenever FCM rotates the token. Failures are silent — push is best effort.
 */
export function startPushTokenSync(): () => void {
  const sync = (token?: string) => {
    registerPushToken(token).catch((e) => {
      if (__DEV__) console.warn("[push] token register failed", e?.message ?? e);
    });
  };

  sync();
  const unsubAuth = useAuthStore.subscribe((state, prev) => {
    if (state.user?.id && state.user.id !== prev.user?.id) sync();
  });
  const unsubRefresh = onTokenRefresh(getMessaging(), (token) => sync(token));

  return () => {
    unsubAuth();
    unsubRefresh();
  };
}

/** Call before the session is revoked — the delete needs a valid access token. */
export async function unregisterPushToken(accessToken: string | null): Promise<void> {
  registeredKey = null;
  if (!accessToken) return;
  try {
    const deviceId = await getDeviceId();
    await axios.delete(`${API_BASE}/push/token`, {
      data: { deviceId },
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 5000,
    });
  } catch {
    /* logout must not wait on push cleanup */
  }
}

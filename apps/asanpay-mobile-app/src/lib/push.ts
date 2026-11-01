import { PermissionsAndroid, Platform } from "react-native";
import {
  getMessaging,
  getToken,
  onMessage,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging";
import { showAlert } from "../components/AppAlert";

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

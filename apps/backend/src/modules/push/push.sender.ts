import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { deletePushTokensById, listPushTokens } from "./push.service";

/** Must match the channel the mobile app creates (`firebase.json`). */
const ANDROID_CHANNEL_ID = "asanpay_alerts";

/** FCM error codes that mean the token will never work again. */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

let app: App | null | undefined;

function firebaseApp(): App | null {
  if (app !== undefined) return app;
  const b64 = env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) {
    app = null;
    return app;
  }
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    app = getApps()[0] ?? initializeApp({ credential: cert(json) });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "FIREBASE_SERVICE_ACCOUNT_B64 is not a valid base64 service account JSON — push disabled",
    );
    app = null;
  }
  return app;
}

export function isPushConfigured(): boolean {
  return firebaseApp() !== null;
}

export interface PushMessage {
  title?: string;
  body?: string;
  /** FCM data values must be strings. */
  data?: Record<string, string>;
}

export interface PushResult {
  configured: boolean;
  tokens: number;
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Sends to every registered install of the user. Tokens FCM reports as dead are deleted.
 * Never throws for delivery problems — callers decide what to do when `sent` is 0.
 */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<PushResult> {
  const fb = firebaseApp();
  const rows = await listPushTokens(userId);
  const result: PushResult = { configured: fb !== null, tokens: rows.length, sent: 0, failed: 0, removed: 0 };
  if (!fb || rows.length === 0) return result;

  const notification =
    message.title || message.body ? { title: message.title, body: message.body } : undefined;

  const res = await getMessaging(fb).sendEachForMulticast({
    tokens: rows.map((r) => r.token),
    notification,
    data: message.data,
    android: {
      priority: "high",
      notification: notification ? { channelId: ANDROID_CHANNEL_ID } : undefined,
    },
  });

  const dead: string[] = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code ?? "unknown";
    const row = rows[i];
    if (row && DEAD_TOKEN_CODES.has(code)) dead.push(row.id);
    else logger.warn({ userId, code }, "FCM send failed");
  });
  await deletePushTokensById(dead);

  result.sent = res.successCount;
  result.failed = res.failureCount;
  result.removed = dead.length;
  return result;
}

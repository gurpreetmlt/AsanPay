import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../db/postgres";
import { pushTokens } from "../../db/postgres/schema";

export type PushPlatform = "android" | "ios";

export async function upsertPushToken(input: {
  userId: string;
  deviceId: string;
  token: string;
  platform: PushPlatform;
}): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    // Account switch on the same phone: the token must only reach the user signed in now.
    await tx
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, input.token), ne(pushTokens.userId, input.userId)));
    await tx
      .insert(pushTokens)
      .values({ ...input, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [pushTokens.userId, pushTokens.deviceId],
        set: { token: input.token, platform: input.platform, updatedAt: now },
      });
  });
}

export async function deletePushToken(userId: string, deviceId: string): Promise<void> {
  await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.userId, userId), eq(pushTokens.deviceId, deviceId)));
}

export async function listPushTokens(userId: string): Promise<{ id: string; token: string }[]> {
  return db
    .select({ id: pushTokens.id, token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));
}

export async function deletePushTokensById(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(pushTokens).where(inArray(pushTokens.id, ids));
}

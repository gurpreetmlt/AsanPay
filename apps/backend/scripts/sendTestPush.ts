import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { users } from "../src/db/postgres/schema";
import { isPushConfigured, sendPushToUser } from "../src/modules/push/push.sender";

/**
 * Sends one test notification to every registered install of a user (end-to-end push check).
 * Run: PUSH_TEST_MOBILE=9xxxxxxxxx npm run push:test -w @asanpay/backend
 */
async function main() {
  const mobile = (process.env.PUSH_TEST_MOBILE ?? "").trim();
  if (!/^\d{10}$/.test(mobile)) {
    throw new Error("PUSH_TEST_MOBILE must be a valid 10-digit mobile");
  }
  if (!isPushConfigured()) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_B64 is not set or invalid — push sending is off");
  }

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.mobile, mobile))
    .limit(1);
  if (!user) throw new Error("No user with this mobile");

  const result = await sendPushToUser(user.id, {
    title: "AsanPay test notification",
    body: "Push notifications are working on this phone.",
    data: { type: "test" },
  });
  console.log(`User role: ${user.role}`);
  console.log(
    `tokens=${result.tokens} sent=${result.sent} failed=${result.failed} removed=${result.removed}`,
  );
  if (result.tokens === 0) {
    console.log("No push token registered — log in on the app once, then retry.");
  }
  await pgPool.end();
}

main().catch(async (err) => {
  console.error("Test push failed:", err instanceof Error ? err.message : err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});

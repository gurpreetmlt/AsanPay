import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { users } from "../src/db/postgres/schema";
import { hashPassword } from "../src/utils/password";
import { assertStrongPin } from "../src/utils/weakPin";

/** Dev demo mobiles (LOGIN.md) — only these are seeded; never auto-fill all agents. */
const SEED_MOBILES = ["9111111111", "9222222222", "9333333333"] as const;

/**
 * Sets login MPIN for seed agents only. Requires SEED_LOGIN_MPIN (strong 4-digit).
 * Run: SEED_LOGIN_MPIN=.... npm run seed:mpin -w @asanpay/backend
 */
async function main() {
  const mpin = process.env.SEED_LOGIN_MPIN;
  if (!mpin) {
    throw new Error("SEED_LOGIN_MPIN env is required. No default MPIN.");
  }
  assertStrongPin(mpin, "SEED_LOGIN_MPIN");

  const loginMpinHash = await hashPassword(mpin);

  const seeded = await db
    .update(users)
    .set({ loginMpinHash, updatedAt: new Date() })
    .where(inArray(users.mobile, [...SEED_MOBILES]))
    .returning({ mobile: users.mobile, role: users.role });

  console.log("Login MPIN set for seed mobiles only (value not printed).");
  console.log(
    `Updated:`,
    seeded.map((r) => `${r.mobile} (${r.role})`).join(", ") || "(none found)",
  );
  await pgPool.end();
}

main().catch((err) => {
  console.error("Seeding login MPIN failed:", err);
  process.exit(1);
});

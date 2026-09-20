import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { users, userHierarchy } from "../src/db/postgres/schema";
import { provisionWalletsForUser } from "../src/modules/wallet/wallet.service";
import { hashPassword } from "../src/utils/password";
import { allocateUid } from "../src/utils/uid";

/** Fixed admin portal credentials — username `admin` (not mobile). OTP disabled for admin. */
const ADMIN_LOGIN_USER = "admin";

// Creates or resets the single root admin. Run: npm run seed:admin -w @asanpay/backend
// Requires SEED_ADMIN_PASSWORD (min 12 chars). No hardcoded password in source.
async function main() {
  const mobile = process.env.SEED_ADMIN_MOBILE ?? "9999999999";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD env is required (min 12 characters). No default password.");
  }
  const passwordHash = await hashPassword(password);

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.parentId)))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        name: "AsanPay Admin",
        isActive: true,
        kycStatus: "verified",
      })
      .where(eq(users.id, existing.id));

    console.log(
      `Root admin updated — login username: ${ADMIN_LOGIN_USER} (password from SEED_ADMIN_PASSWORD; not printed)`,
    );
    await pgPool.end();
    return;
  }

  await db.transaction(async (tx) => {
    const uid = await allocateUid("admin", tx);
    const [admin] = await tx
      .insert(users)
      .values({
        uid,
        parentId: null,
        role: "admin",
        name: "AsanPay Admin",
        mobile,
        passwordHash,
        kycStatus: "verified",
      })
      .returning();

    if (!admin) throw new Error("Failed to create admin");

    await tx.insert(userHierarchy).values({ ancestorId: admin.id, descendantId: admin.id, depth: 0 });
    await provisionWalletsForUser(tx, admin.id, admin.role, { isRootAdmin: true });
  });

  console.log(`Root admin created — login username: ${ADMIN_LOGIN_USER} (password from env; not printed)`);
  await pgPool.end();
}

main().catch((err) => {
  console.error("Seeding admin failed:", err);
  process.exit(1);
});

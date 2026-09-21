import "dotenv/config";
import { db, pgPool } from "../src/db/postgres";
import { remapAllAgentUids } from "../src/utils/uid";

/**
 * Remap all users to ASPRT / ASPD / ASPSD / ASPAD + sequential from 100001.
 * Run once after deploy (EC2 backend container): npm run remap:uids
 */
async function main() {
  const result = await db.transaction(async (tx) => remapAllAgentUids(tx));
  console.log("UID remap done:", result);
  await pgPool.end();
}

main().catch((err) => {
  console.error("UID remap failed:", err);
  process.exit(1);
});

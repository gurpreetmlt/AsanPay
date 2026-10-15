/**
 * Rewrite `wallets.balance` from the ledger for every agent whose mirror has drifted
 * (e.g. fund requests credited before the credit path refreshed the mirror).
 *
 * DRY RUN BY DEFAULT.
 *
 *   npm run wallet:resync              # list wallets that differ from the ledger
 *   npm run wallet:resync -- --apply   # fix them (adds passbook rows for the difference)
 *
 * The ledger is the source of truth and is never written here.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { resolveTenantId } from "../src/modules/fund-requests/tenant";
import { syncWalletsAfterJournal } from "../src/modules/wallet/wallet.ledger";

const APPLY = process.argv.includes("--apply");

async function main() {
  const tenantId = await resolveTenantId();
  const res = await db.execute<{
    user_id: string;
    name: string | null;
    wallet_type: string;
    wallet_balance: string;
    ledger_balance: string;
  }>(sql`
    SELECT w.user_id, u.name, w.wallet_type,
      w.balance::text AS wallet_balance,
      (CASE WHEN w.wallet_type = 'aeps' THEN b.settleable ELSE b.balance - b.settleable END / 100.0)::numeric(14,2)::text
        AS ledger_balance
    FROM wallets w
    JOIN users u ON u.id = w.user_id
    JOIN accounts a ON a.user_id = w.user_id AND a.tenant_id = ${tenantId}
    JOIN account_balances b ON b.account_id = a.id
    WHERE w.wallet_kind <> 'aggregator'
      AND w.balance <> (CASE WHEN w.wallet_type = 'aeps' THEN b.settleable ELSE b.balance - b.settleable END / 100.0)::numeric(14,2)
    ORDER BY u.name`);

  if (res.rows.length === 0) {
    console.log("All wallets already match the ledger. Nothing to do.");
    await pgPool.end();
    return;
  }

  console.log("Wallets that differ from the ledger:\n");
  for (const r of res.rows) {
    console.log(`  ${r.name ?? r.user_id}  ${r.wallet_type}  shown ₹${r.wallet_balance}  →  ledger ₹${r.ledger_balance}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to fix.");
    await pgPool.end();
    return;
  }

  const userIds = [...new Set(res.rows.map((r) => r.user_id))];
  await db.transaction(async (tx) => {
    await syncWalletsAfterJournal(tx, tenantId, userIds, {
      referenceType: "wallet_resync",
      description: "Wallet balance resynced from ledger",
    });
  });
  console.log(`\nDone — ${userIds.length} agent wallet(s) resynced.`);
  await pgPool.end();
}

main().catch(async (err) => {
  console.error("wallet:resync failed:", err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});

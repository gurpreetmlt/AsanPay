/**
 * Remove the retired Eko (dummy AEPS) provider from the database.
 *
 * DRY RUN BY DEFAULT.
 *
 *   npm run cleanup:eko              # report what would change
 *   npm run cleanup:eko -- --apply   # apply in one transaction
 *
 * Deletes: float routes to Eko, provider_services / commission rules / service charges for Eko,
 * then the `providers` row (transactions keep their history; their provider_id becomes NULL).
 * Ledger: TREASURY_FLOAT_EKO is CLOSED, never deleted (journals are append-only). Aborts if that
 * account still holds a balance, or if a float transfer / bank entry references Eko.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";

const APPLY = process.argv.includes("--apply");
const FLOAT_CODE = "TREASURY_FLOAT_EKO";

async function one<T extends Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T | undefined> {
  const res = await db.execute<T>(q);
  return res.rows[0] as T | undefined;
}

async function n(q: ReturnType<typeof sql>): Promise<number> {
  return Number((await one<{ n: number }>(q))?.n ?? 0);
}

async function main() {
  const provider = await one<{ id: string; name: string; is_active: boolean }>(
    sql`SELECT id, name, is_active FROM providers WHERE code = 'eko' LIMIT 1`,
  );
  const floatAcc = await one<{ id: string; status: string; balance: string; entries: number }>(sql`
    SELECT a.id, a.status, COALESCE(b.balance, 0)::text AS balance,
      (SELECT COUNT(*)::int FROM ledger_entries e WHERE e.account_id = a.id) AS entries
    FROM accounts a LEFT JOIN account_balances b ON b.account_id = a.id
    WHERE a.code = ${FLOAT_CODE} LIMIT 1`);

  if (!provider && !floatAcc) {
    console.log("Eko provider and its float account are already gone. Nothing to do.");
    await pgPool.end();
    return;
  }

  const pid = provider?.id ?? null;
  const routes = pid ? await n(sql`SELECT COUNT(*)::int AS n FROM float_routes WHERE to_provider_id = ${pid}`) : 0;
  const transfers = pid
    ? await n(sql`SELECT COUNT(*)::int AS n FROM float_transfers t
        JOIN float_routes r ON r.id = t.route_id WHERE r.to_provider_id = ${pid}`)
    : 0;
  const bankEntries = pid ? await n(sql`SELECT COUNT(*)::int AS n FROM bank_entries WHERE provider_id = ${pid}`) : 0;
  const psRows = pid
    ? (
        await db.execute<{ code: string; is_active: boolean; others: number }>(sql`
          SELECT s.code, ps.is_active,
            (SELECT COUNT(*)::int FROM provider_services o
              WHERE o.service_id = ps.service_id AND o.provider_id <> ps.provider_id AND o.is_active) AS others
          FROM provider_services ps JOIN services s ON s.id = ps.service_id
          WHERE ps.provider_id = ${pid} ORDER BY s.code`)
      ).rows
    : [];
  const commissionRules = pid
    ? await n(sql`SELECT COUNT(*)::int AS n FROM commission_rules WHERE provider_id = ${pid}`)
    : 0;
  const serviceCharges = pid
    ? await n(sql`SELECT COUNT(*)::int AS n FROM service_charges WHERE provider_id = ${pid}`)
    : 0;
  const txns = pid ? await n(sql`SELECT COUNT(*)::int AS n FROM transactions WHERE provider_id = ${pid}`) : 0;

  console.log("Eko (dummy AEPS) cleanup\n");
  console.log(`  provider row          ${provider ? `${provider.name} (active=${provider.is_active})` : "already gone"}`);
  console.log(`  float routes          ${routes}`);
  console.log(`  float transfers       ${transfers}`);
  console.log(`  bank entries          ${bankEntries}`);
  console.log(`  provider_services     ${psRows.length}`);
  const orphaned = psRows.filter((r) => r.is_active && r.others === 0);
  if (orphaned.length) {
    console.log(`    !! ${orphaned.length} service(s) will have NO active provider after this (they will show unavailable):`);
    for (const r of orphaned) console.log(`       - ${r.code}`);
  }
  console.log(`  commission rules      ${commissionRules}`);
  console.log(`  service charges       ${serviceCharges}`);
  console.log(`  transactions          ${txns} (history kept, provider link cleared)`);
  console.log(
    `  ledger ${FLOAT_CODE}  ${
      floatAcc ? `status=${floatAcc.status} balance=${floatAcc.balance} paise entries=${floatAcc.entries}` : "not found"
    }`,
  );

  const blockers: string[] = [];
  if (transfers > 0) blockers.push(`${transfers} float transfer(s) reference Eko routes`);
  if (bankEntries > 0) blockers.push(`${bankEntries} bank entr(ies) reference Eko`);
  if (floatAcc && BigInt(floatAcc.balance) !== 0n) blockers.push(`${FLOAT_CODE} still holds a balance`);
  if (blockers.length) {
    console.log("\n!! Cannot clean up automatically:");
    for (const b of blockers) console.log(`   - ${b}`);
    await pgPool.end();
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to remove Eko.");
    await pgPool.end();
    return;
  }

  await db.transaction(async (tx) => {
    if (pid) {
      await tx.execute(sql`DELETE FROM float_routes WHERE to_provider_id = ${pid}`);
      await tx.execute(sql`DELETE FROM provider_services WHERE provider_id = ${pid}`);
      await tx.execute(sql`DELETE FROM commission_rules WHERE provider_id = ${pid}`);
      await tx.execute(sql`DELETE FROM service_charges WHERE provider_id = ${pid}`);
      await tx.execute(sql`UPDATE transactions SET provider_id = NULL WHERE provider_id = ${pid}`);
      await tx.execute(sql`DELETE FROM providers WHERE id = ${pid}`);
    }
    if (floatAcc && floatAcc.status !== "closed") {
      await tx.execute(sql`UPDATE accounts SET status = 'closed' WHERE id = ${floatAcc.id}`);
    }
  });

  console.log("\nDone — Eko removed. Refresh Developer Options → Providers and Float management.");
  await pgPool.end();
}

main().catch(async (err) => {
  console.error("cleanup:eko failed:", err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});

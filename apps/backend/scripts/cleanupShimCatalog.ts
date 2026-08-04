/**
 * Remove verify:shim harness catalogue debris from the global `services` /
 * `service_categories` tables (no tenant_id — leftovers sit alongside product catalog).
 *
 * DRY RUN BY DEFAULT (same pattern as provision:float).
 *
 *   npm run cleanup:shim              # report what would be deleted
 *   npm run cleanup:shim -- --apply   # delete in one transaction
 *
 * Strict pattern: only rows whose `code` matches SQL `SHIM%` (ILIKE 'SHIM%').
 * Never touches journals/ledger_entries/accounts (append-only / LEDGERTEST).
 */
import { ilike, inArray, sql } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import {
  services,
  serviceCategories,
  transactions,
  walletLedgerGroups,
  walletLedgerEntries,
  commissionLedger,
} from "../src/db/postgres/schema";

const APPLY = process.argv.includes("--apply");

async function main() {
  const shimServices = await db
    .select({ id: services.id, code: services.code, name: services.name, isActive: services.isActive })
    .from(services)
    .where(ilike(services.code, "SHIM%"));

  const shimCategories = await db
    .select({
      id: serviceCategories.id,
      code: serviceCategories.code,
      name: serviceCategories.name,
      isActive: serviceCategories.isActive,
    })
    .from(serviceCategories)
    .where(ilike(serviceCategories.code, "SHIM%"));

  const serviceIds = shimServices.map((s) => s.id);

  let txnRows: Array<{ id: string; txnRef: string }> = [];
  if (serviceIds.length > 0) {
    txnRows = await db
      .select({ id: transactions.id, txnRef: transactions.txnRef })
      .from(transactions)
      .where(inArray(transactions.serviceId, serviceIds));
  }
  const txnIds = txnRows.map((t) => t.id);

  let groupRows: Array<{ id: string }> = [];
  if (txnIds.length > 0) {
    groupRows = await db
      .select({ id: walletLedgerGroups.id })
      .from(walletLedgerGroups)
      .where(inArray(walletLedgerGroups.referenceId, txnIds));
  }
  const groupIds = groupRows.map((g) => g.id);

  let entryCount = 0;
  if (groupIds.length > 0) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(walletLedgerEntries)
      .where(inArray(walletLedgerEntries.groupId, groupIds));
    entryCount = Number(row?.n ?? 0);
  }

  let commissionCount = 0;
  if (txnIds.length > 0) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(commissionLedger)
      .where(inArray(commissionLedger.transactionId, txnIds));
    commissionCount = Number(row?.n ?? 0);
  }

  console.log("verify:shim catalog cleanup (pattern code ILIKE 'SHIM%')\n");
  console.log(`  services               ${shimServices.length}`);
  for (const s of shimServices) {
    console.log(`    - ${s.code}  (${s.name}, active=${s.isActive})`);
  }
  console.log(`  service_categories     ${shimCategories.length}`);
  for (const c of shimCategories) {
    console.log(`    - ${c.code}  (${c.name}, active=${c.isActive})`);
  }
  console.log(`  transactions           ${txnRows.length}`);
  console.log(`  commission_ledger      ${commissionCount}`);
  console.log(`  wallet_ledger_groups   ${groupRows.length}`);
  console.log(`  wallet_ledger_entries  ${entryCount}`);
  console.log(
    "\n  skipped: journals, ledger_entries, accounts, wallets, users (intentionally)",
  );

  if (
    shimServices.length === 0 &&
    shimCategories.length === 0 &&
    txnRows.length === 0
  ) {
    console.log("\nNothing to clean.");
    await pgPool.end();
    return;
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to delete.");
    await pgPool.end();
    return;
  }

  await db.transaction(async (tx) => {
    if (groupIds.length > 0) {
      await tx
        .delete(walletLedgerEntries)
        .where(inArray(walletLedgerEntries.groupId, groupIds));
      await tx.delete(walletLedgerGroups).where(inArray(walletLedgerGroups.id, groupIds));
    }

    if (txnIds.length > 0) {
      // commission_ledger may FK to ledger groups — groups already gone; still clear by txn.
      await tx.delete(commissionLedger).where(inArray(commissionLedger.transactionId, txnIds));
      await tx.delete(transactions).where(inArray(transactions.id, txnIds));
    }

    if (serviceIds.length > 0) {
      // provider_services ON DELETE CASCADE from services
      await tx.delete(services).where(inArray(services.id, serviceIds));
    }

    if (shimCategories.length > 0) {
      await tx
        .delete(serviceCategories)
        .where(
          inArray(
            serviceCategories.id,
            shimCategories.map((c) => c.id),
          ),
        );
    }
  });

  console.log("\nDeleted SHIM% catalog harness + dependent projection rows.");
  await pgPool.end();
}

main().catch(async (err) => {
  console.error("cleanup:shim failed:", err);
  try {
    await pgPool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

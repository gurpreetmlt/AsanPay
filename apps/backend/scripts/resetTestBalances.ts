/**
 * Zero every agent wallet and the company balance so only real money remains (company bank
 * accounts + provider float). Used once to clear demo/test funding before going live.
 *
 * DRY RUN BY DEFAULT.
 *
 *   npm run reset:test-balances              # report what would be zeroed
 *   npm run reset:test-balances -- --apply   # post the adjustments in one transaction
 *
 * Nothing is deleted. Each non-zero balance gets a RECON_ADJUSTMENT journal (reason + root admin
 * as operator), so the history stays auditable:
 *   agent (SD / Distributor / Retailer)  Dr agent  / Cr COMPANY_001
 *   company balance (after the above)    Dr COMPANY_001 / Cr TREASURY_FLOAT_CONTROL
 * Bank, transit and provider float accounts are never touched.
 */
import "dotenv/config";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { accountBalances, accounts, tenants, users } from "../src/db/postgres/schema";
import { postJournal } from "../src/core/ledger";
import { paiseToRupees, type Paise } from "../src/core/money";
import { legacyTenantCode, mirrorBalances } from "../src/modules/wallet/wallet.ledger";
import { insertAuditLog } from "../src/db/postgres/repositories/auditLog";

const APPLY = process.argv.includes("--apply");
const COMPANY = "COMPANY_001";
const FLOAT_CONTROL = "TREASURY_FLOAT_CONTROL";
const HIERARCHY = ["sd", "distributor", "retailer"] as const;
const REASON = "Pre-launch reset: clear demo/test balances, keep only real bank and provider money";

async function count(q: ReturnType<typeof sql>): Promise<number> {
  const res = await db.execute<{ n: number }>(q);
  return Number(res.rows[0]?.n ?? 0);
}

async function main() {
  const [tenant] = await db
    .select({ id: tenants.id, code: tenants.code })
    .from(tenants)
    .where(eq(tenants.code, legacyTenantCode()))
    .limit(1);
  if (!tenant) throw new Error(`Tenant ${legacyTenantCode()} not found`);

  const [admin] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!admin) throw new Error("No active admin user found to record as the operator");

  const agentRows = await db
    .select({
      code: accounts.code,
      userId: accounts.userId,
      type: accounts.accountType,
      status: accounts.status,
      balance: accountBalances.balance,
      settleable: accountBalances.settleable,
      name: users.name,
      mobile: users.mobile,
    })
    .from(accounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .leftJoin(users, eq(users.id, accounts.userId))
    .where(
      and(
        eq(accounts.tenantId, tenant.id),
        inArray(accounts.accountType, [...HIERARCHY]),
        ne(accountBalances.balance, 0n),
      ),
    )
    .orderBy(accounts.code);

  const [company] = await db
    .select({ balance: accountBalances.balance })
    .from(accounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(and(eq(accounts.tenantId, tenant.id), eq(accounts.code, COMPANY)))
    .limit(1);
  if (!company) throw new Error("COMPANY_001 account is missing");

  const positive = agentRows.filter((r) => r.balance > 0n && r.status === "active");
  const negative = agentRows.filter((r) => r.balance < 0n);
  const notActive = agentRows.filter((r) => r.balance > 0n && r.status !== "active");
  const agentTotal = positive.reduce((s, r) => s + r.balance, 0n);
  const companyAfter = company.balance + agentTotal;

  console.log(`Tenant ${tenant.code} · operator ${admin.name}\n`);
  console.log(`Agent wallets to zero: ${positive.length}`);
  for (const r of positive) {
    const earned = r.settleable > 0n ? ` (earned/AePS ₹${paiseToRupees(r.settleable as Paise)})` : "";
    console.log(
      `  ${r.code.padEnd(24)} ${r.type.padEnd(12)} ₹${paiseToRupees(r.balance as Paise).padStart(12)}${earned}  ${r.name ?? ""} ${r.mobile ?? ""}`,
    );
  }
  console.log(`  -> total ₹${paiseToRupees(agentTotal as Paise)} goes back to the company balance first`);
  if (negative.length) {
    console.log(`\n!! ${negative.length} agent account(s) are NEGATIVE — left untouched, check manually:`);
    for (const r of negative) console.log(`  ${r.code} ₹${paiseToRupees(r.balance as Paise)}`);
  }
  if (notActive.length) {
    console.log(`\n!! ${notActive.length} ledger account(s) are not active — skipped, check manually:`);
    for (const r of notActive) {
      console.log(`  ${r.code} status=${r.status} ₹${paiseToRupees(r.balance as Paise)}  ${r.name ?? ""}`);
    }
  }

  console.log(`\nCompany balance now ₹${paiseToRupees(company.balance as Paise)}`);
  console.log(`Company balance after agent reset ₹${paiseToRupees(companyAfter as Paise)} -> will be set to ₹0`);
  if (companyAfter < 0n) {
    console.log("!! Company balance would be negative — aborting, check manually");
    await pgPool.end();
    process.exit(1);
  }

  const openSettlements = await count(sql`
    SELECT COUNT(*)::int AS n FROM settlement_requests
    WHERE status NOT IN ('completed', 'rejected', 'failed', 'cancelled')`).catch(() => -1);
  const openFundRequests = await count(sql`
    SELECT COUNT(*)::int AS n FROM fund_requests
    WHERE status NOT IN ('credited', 'rejected', 'cancelled')`).catch(() => -1);
  console.log(`\nOpen settlement requests: ${openSettlements < 0 ? "n/a" : openSettlements}`);
  console.log(`Open fund requests:       ${openFundRequests < 0 ? "n/a" : openFundRequests}`);
  if (openSettlements > 0 || openFundRequests > 0) {
    console.log("  (reject / cancel these in the admin portal after the reset — they reference old balances)");
  }
  console.log("\nNot touched: company bank accounts, transit, provider float (Treasury real money).");

  if (positive.length === 0 && companyAfter === 0n) {
    console.log("\nNothing to reset.");
    await pgPool.end();
    return;
  }
  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to post the adjustments.");
    await pgPool.end();
    return;
  }

  const stamp = Date.now();
  const journalIds = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const r of positive) {
      const j = await postJournal(tx, {
        tenantId: tenant.id,
        txnType: "RECON_ADJUSTMENT",
        idemKey: `RESET_TEST:${stamp}:${r.code}`,
        performedBy: admin.id,
        reason: REASON,
        entries: [
          { code: r.code, dir: "DR", amount: r.balance as Paise },
          { code: COMPANY, dir: "CR", amount: r.balance as Paise },
        ],
      });
      ids.push(String(j.id));
    }
    if (companyAfter > 0n) {
      const j = await postJournal(tx, {
        tenantId: tenant.id,
        txnType: "RECON_ADJUSTMENT",
        idemKey: `RESET_TEST:${stamp}:${COMPANY}`,
        performedBy: admin.id,
        reason: REASON,
        entries: [
          { code: COMPANY, dir: "DR", amount: companyAfter as Paise },
          { code: FLOAT_CONTROL, dir: "CR", amount: companyAfter as Paise },
        ],
      });
      ids.push(String(j.id));
    }
    const userIds = positive.map((r) => r.userId).filter((id): id is string => Boolean(id));
    await mirrorBalances(tx, tenant.id, userIds, true);
    return ids;
  });

  await insertAuditLog({
    userId: admin.id,
    action: "admin.reset_test_balances",
    entityType: "ledger",
    metadata: {
      reason: REASON,
      agentAccounts: positive.length,
      agentTotalPaise: agentTotal.toString(),
      companyZeroedPaise: companyAfter.toString(),
      journalIds,
    },
  });

  console.log(`\nDone — ${journalIds.length} adjustment journal(s) posted. All agent wallets and company balance are ₹0.`);
  await pgPool.end();
}

main().catch(async (err) => {
  console.error("reset:test-balances failed:", err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});

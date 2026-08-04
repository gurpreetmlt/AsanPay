/**
 * Step 16 — concurrent money load against the real cut-over paths under LEDGERTEST.
 *
 *   1) 500 concurrent DMT debits via executeServiceTxn (row-lock / no double-spend)
 *   2) 200 concurrent fundWallet external funds on a second agent wallet
 *   3) Trial balance + settleable + non-negative agent balances on LEDGERTEST
 *
 * tsx (not vitest) so it runs inside the Coolify API image:
 *
 *   sudo docker exec $API sh -c 'cd /app/apps/backend && npm run verify:load'
 *
 * Env:
 *   LOAD_DEBIT_N   — concurrent debits (default 500, max 500)
 *   LOAD_FUND_N    — concurrent fundWallet calls (default 200, max 200)
 *   LOAD_UNIT      — per-debit rupees (default 10.00)
 */
import { eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { tenants, transactions } from "../src/db/postgres/schema";
import { createWorld } from "../test/helpers/world";
import { fundWallet } from "../src/modules/wallet/wallet.ledger";
import {
  checkLedgerVsBalance,
  checkTrialBalance,
  checkSettleable,
  checkNegativeAgentBalance,
} from "../src/modules/reconciliation/checks";
import { paiseToRupees, rupeesToPaise } from "../src/core/money";

const DEBIT_N = Math.min(Math.max(Number(process.env.LOAD_DEBIT_N || 500), 1), 500);
const FUND_N = Math.min(Math.max(Number(process.env.LOAD_FUND_N || 200), 1), 200);
const UNIT = process.env.LOAD_UNIT || "10.00";

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err instanceof Error ? err.message : String(err)}`);
    failed += 1;
  }
}

function expectEq(actual: unknown, expected: unknown, what: string): void {
  const a = typeof actual === "bigint" ? actual.toString() : String(actual);
  const e = typeof expected === "bigint" ? expected.toString() : String(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

async function ledgerTenantId(): Promise<string> {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, "LEDGERTEST")).limit(1);
  if (!t) throw new Error("LEDGERTEST tenant missing");
  return t.id;
}

async function main() {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`LEDGER LOAD VERIFICATION — debits=${DEBIT_N} fundWallet=${FUND_N} unit=${UNIT}`);
  console.log("=".repeat(72));

  process.env.LEDGER_TENANT_CODE = "LEDGERTEST";
  const suffix = `ld${Date.now().toString(36)}`;
  const w = await createWorld(suffix);
  await w.addService("dmt");
  const tenantId = await ledgerTenantId();
  console.log(`Tenant: LEDGERTEST (${tenantId}) world=${suffix}\n`);

  await check(
    `${DEBIT_N} concurrent debits, fund for half: exactly half fulfill, balance never negative`,
    async () => {
      const affordable = Math.floor(DEBIT_N / 2);
      const fundRupees = (affordable * Number(UNIT)).toFixed(2);
      await w.setBalance(w.retailerMainWalletId, fundRupees);
      await db.delete(transactions).where(eq(transactions.userId, w.retailerId));

      const results = await Promise.allSettled(
        Array.from({ length: DEBIT_N }, (_, i) => w.runDmt(UNIT, `load-half-${suffix}-${i}`)),
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      expectEq(fulfilled, affordable, "fulfilled count");
      if (Number(await w.getBalance(w.retailerMainWalletId)) < 0) {
        throw new Error("retailer main balance went negative");
      }
      expectEq(await w.getHoldBalance(w.retailerMainWalletId), "0.00", "hold after half run");
    },
  );

  await check(
    `${DEBIT_N} concurrent debits, fund for all: all fulfill, balance and hold end at 0`,
    async () => {
      const fundRupees = (DEBIT_N * Number(UNIT)).toFixed(2);
      await w.setBalance(w.retailerMainWalletId, fundRupees);
      await db.delete(transactions).where(eq(transactions.userId, w.retailerId));

      const results = await Promise.allSettled(
        Array.from({ length: DEBIT_N }, (_, i) => w.runDmt(UNIT, `load-all-${suffix}-${i}`)),
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      expectEq(fulfilled, DEBIT_N, "fulfilled count");
      expectEq(await w.getBalance(w.retailerMainWalletId), "0.00", "balance zero");
      expectEq(await w.getHoldBalance(w.retailerMainWalletId), "0.00", "hold zero");
    },
  );

  await check(
    `${FUND_N} concurrent fundWallet to distributor: balance rises by sum`,
    async () => {
      const unit = "1.00";
      const before = await w.getBalance(w.distMainWalletId);
      const beforeP = rupeesToPaise(before);

      const results = await Promise.allSettled(
        Array.from({ length: FUND_N }, (_, i) =>
          fundWallet({
            walletId: w.distMainWalletId,
            amount: unit,
            description: `load-fund-${suffix}-${i}`,
          }),
        ),
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      expectEq(fulfilled, FUND_N, "fundWallet fulfilled");
      const after = await w.getBalance(w.distMainWalletId);
      expectEq(rupeesToPaise(after) - beforeP, rupeesToPaise(unit) * BigInt(FUND_N), "dist +fund total");
      // Compact proof amount string for logging
      void paiseToRupees(rupeesToPaise(unit) * BigInt(FUND_N));
    },
  );

  await check("LEDGERTEST recon clean after load (trial / ledger / settleable / non-negative)", async () => {
    expectEq((await checkTrialBalance(tenantId)).length, 0, "trial balance");
    expectEq((await checkLedgerVsBalance(tenantId)).length, 0, "ledger vs balance");
    expectEq((await checkSettleable(tenantId)).length, 0, "settleable");
    expectEq((await checkNegativeAgentBalance(tenantId)).length, 0, "negative agents");
  });

  try {
    await w.destroy();
  } catch (err) {
    console.log(`  WARN  destroy: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`\n${"-".repeat(72)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log("-".repeat(72));
  console.log(
    failed === 0
      ? "\nLOAD VERIFIED — concurrent DMT debits + fundWallet + LEDGERTEST recon clean.\n" +
          "ASANPAY production money was not used (LEDGER_TENANT_CODE=LEDGERTEST).\n"
      : "\nLOAD NOT VERIFIED — investigate failures before raising prod concurrency.\n",
  );

  await pgPool.end();
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(async (err) => {
  console.error("Load harness crashed:", err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});

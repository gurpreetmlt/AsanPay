/**
 * Step 16 — concurrent money load against the real cut-over paths under LEDGERTEST.
 *
 *   1) 500 concurrent service_txn DEBITs via transferBetweenWallets (row-lock / no double-spend)
 *   2) 200 concurrent fundWallet external funds on a second agent wallet
 *   3) Trial balance + settleable + non-negative agent balances on LEDGERTEST
 *
 * Deliberately does NOT call executeServiceTxn / stub providers — those need ALLOW_STUB_PROVIDERS
 * and catalog service aliases; this harness stresses the ledger cut-over (journals + mirror)
 * which is what Step 16 was for. Money posts as DMT journals (catalog MONEY_TRANSFER service).
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
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import {
  tenants,
  transactions,
  services,
  wallets,
} from "../src/db/postgres/schema";
import { createWorld } from "../test/helpers/world";
import { fundWallet, transferBetweenWallets } from "../src/modules/wallet/wallet.ledger";
import {
  checkLedgerVsBalance,
  checkTrialBalance,
  checkSettleable,
  checkNegativeAgentBalance,
} from "../src/modules/reconciliation/checks";
import { paiseToRupees, rupeesToPaise } from "../src/core/money";
import { HttpError } from "../src/utils/httpError";

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

function sampleRejections(results: PromiseSettledResult<unknown>[], max = 3): string {
  const notes: string[] = [];
  for (const r of results) {
    if (r.status !== "rejected") continue;
    const reason = r.reason;
    if (reason instanceof HttpError) {
      notes.push(`${reason.code}: ${reason.message}`);
    } else if (reason instanceof Error) {
      notes.push(reason.message);
    } else {
      notes.push(String(reason));
    }
    if (notes.length >= max) break;
  }
  return notes.length ? ` sample: ${notes.join(" | ")}` : "";
}

async function ledgerTenantId(): Promise<string> {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, "LEDGERTEST")).limit(1);
  if (!t) throw new Error("LEDGERTEST tenant missing");
  return t.id;
}

async function aggregatorWalletId(): Promise<string> {
  const [row] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.walletKind, "aggregator"), eq(wallets.walletType, "main")))
    .limit(1);
  if (!row) throw new Error("aggregator wallet missing");
  return row.id;
}

async function moneyTransferServiceId(): Promise<string> {
  const [row] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.code, "MONEY_TRANSFER"))
    .limit(1);
  if (!row) throw new Error("MONEY_TRANSFER service missing — seed catalog first");
  return row.id;
}

/**
 * Concurrent service journal debits. Inserts a transactions row (catalog MONEY_TRANSFER + load
 * provider) then posts transferBetweenWallets referenceType service_txn — same cut-over path
 * as product, without a provider network/stub hop.
 */
function makeDebitRunner(ctx: {
  retailerId: string;
  retailerMainWalletId: string;
  aggregatorId: string;
  serviceId: string;
  providerId: string;
  tag: string;
}) {
  return async (i: number): Promise<void> => {
    const id = randomUUID();
    await db.insert(transactions).values({
      id,
      txnRef: `LOAD${ctx.tag}${i}`.slice(0, 40),
      idempotencyKey: `load-${ctx.tag}-${i}-${id.slice(0, 8)}`.slice(0, 100),
      userId: ctx.retailerId,
      serviceId: ctx.serviceId,
      providerId: ctx.providerId,
      amount: UNIT,
      customerFee: "0",
      status: "success",
      walletType: "main",
    });
    await transferBetweenWallets({
      fromWalletId: ctx.retailerMainWalletId,
      toWalletId: ctx.aggregatorId,
      amount: UNIT,
      referenceType: "service_txn",
      referenceId: id,
      description: `verify:load debit ${ctx.tag}#${i}`,
    });
  };
}

async function main() {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`LEDGER LOAD VERIFICATION — debits=${DEBIT_N} fundWallet=${FUND_N} unit=${UNIT}`);
  console.log(`path=transferBetweenWallets(service_txn)  (no stub / executeServiceTxn)`);
  console.log("=".repeat(72));

  process.env.LEDGER_TENANT_CODE = "LEDGERTEST";
  const suffix = `ld${Date.now().toString(36)}`;
  // Wallets + LEDGERTEST isolation. createWorld also inserts a throwaway test_mock provider id we
  // attach to load txns so service journals have a float account (auto-provisioned).
  const w = await createWorld(suffix);
  const tenantId = await ledgerTenantId();
  const serviceId = await moneyTransferServiceId();
  const aggregatorId = await aggregatorWalletId();
  console.log(`Tenant: LEDGERTEST (${tenantId}) world=${suffix}`);
  console.log(`Service: MONEY_TRANSFER  aggregator=${aggregatorId}\n`);

  const debit = makeDebitRunner({
    retailerId: w.retailerId,
    retailerMainWalletId: w.retailerMainWalletId,
    aggregatorId,
    serviceId,
    providerId: w.providerId,
    tag: suffix,
  });

  await check(
    `${DEBIT_N} concurrent service_txn debits, fund for half: exactly half fulfill, balance never negative`,
    async () => {
      const affordable = Math.floor(DEBIT_N / 2);
      const fundRupees = (affordable * Number(UNIT)).toFixed(2);
      await w.setBalance(w.retailerMainWalletId, fundRupees);
      await db.delete(transactions).where(eq(transactions.userId, w.retailerId));

      const results = await Promise.allSettled(
        Array.from({ length: DEBIT_N }, (_, i) => debit(i)),
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      if (fulfilled !== affordable) {
        throw new Error(
          `fulfilled count: expected ${affordable}, got ${fulfilled}${sampleRejections(results)}`,
        );
      }
      if (Number(await w.getBalance(w.retailerMainWalletId)) < 0) {
        throw new Error("retailer main balance went negative");
      }
      // Fully spent usable: half * unit left zero.
      expectEq(await w.getBalance(w.retailerMainWalletId), "0.00", "balance after half run");
    },
  );

  await check(
    `${DEBIT_N} concurrent service_txn debits, fund for all: all fulfill, balance ends at 0`,
    async () => {
      const fundRupees = (DEBIT_N * Number(UNIT)).toFixed(2);
      await w.setBalance(w.retailerMainWalletId, fundRupees);
      await db.delete(transactions).where(eq(transactions.userId, w.retailerId));

      const results = await Promise.allSettled(
        Array.from({ length: DEBIT_N }, (_, i) => debit(i + DEBIT_N)),
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      if (fulfilled !== DEBIT_N) {
        throw new Error(
          `fulfilled count: expected ${DEBIT_N}, got ${fulfilled}${sampleRejections(results)}`,
        );
      }
      expectEq(await w.getBalance(w.retailerMainWalletId), "0.00", "balance zero");
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
      ? "\nLOAD VERIFIED — concurrent service_txn debits + fundWallet + LEDGERTEST recon clean.\n" +
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

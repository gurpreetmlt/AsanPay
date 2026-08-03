/**
 * End-to-end exercise of the ledger engine against a real Postgres, covering the flows the
 * cut-over will switch: hierarchy transfer, a three-leg DMT, an AePS credit, idempotent
 * replay, the no-overdraft rule, flow-matrix rejection and reversal.
 *
 * Written as a tsx script rather than a vitest test on purpose: the production image is built
 * with `npm install --omit=optional`, which strips vitest's native rolldown binding. Changing
 * the production image just to run a test is the wrong trade — tsx already runs in there.
 *
 *   sudo docker exec $API npm run verify:ledger
 *
 * Runs under its own tenant (`LEDGERTEST`), so nothing here can touch ASANPAY's money. The
 * ledger is append-only, so these rows are permanent — fine, they are isolated by tenant_id
 * and every reconciliation check is tenant-scoped.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { accounts, accountBalances, tenants } from "../src/db/postgres/schema";
import { postJournal, reverseJournal, clearAccountCache } from "../src/core/ledger";
import { seedSystemAccounts } from "../src/modules/bootstrap/systemAccounts";
import { rupeesToPaise, paiseToRupees } from "../src/core/money";
import {
  checkLedgerVsBalance,
  checkTrialBalance,
  checkSettleable,
  checkNegativeAgentBalance,
} from "../src/modules/reconciliation/checks";

const RUN = randomUUID().slice(0, 8);
const key = (name: string) => `TEST:${RUN}:${name}`;

let tenantId: string;
let RTL: string;
let DIST: string;
let FLOAT: string;

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

async function expectRejects(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!pattern.test(msg)) {
      throw new Error(`rejected, but with "${msg}" (wanted ${pattern})`, { cause: err });
    }
    return;
  }
  throw new Error(`expected a rejection matching ${pattern}, but it succeeded`);
}

async function balanceOf(code: string): Promise<{ balance: bigint; settleable: bigint }> {
  const [row] = await db
    .select({ balance: accountBalances.balance, settleable: accountBalances.settleable })
    .from(accounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)));
  if (!row) throw new Error(`No balance row for ${code}`);
  return row;
}

async function makeAccount(
  code: string,
  accountType: "distributor" | "retailer" | "float",
  accountClass: "liability" | "asset",
): Promise<string> {
  await db
    .insert(accounts)
    .values({
      tenantId,
      code,
      name: code,
      accountType,
      accountClass,
      requiresBalanceCheck: accountClass === "liability",
    })
    .onConflictDoNothing({ target: [accounts.tenantId, accounts.code] });

  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)));

  if (!row) throw new Error(`Could not create ${code}`);

  await db
    .insert(accountBalances)
    .values({ accountId: row.id })
    .onConflictDoNothing({ target: accountBalances.accountId });

  return code;
}

async function main() {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`LEDGER ENGINE VERIFICATION — run ${RUN}`);
  console.log("=".repeat(72));

  const [existing] = await db.select().from(tenants).where(eq(tenants.code, "LEDGERTEST")).limit(1);
  const tenant =
    existing ??
    (await db.insert(tenants).values({ code: "LEDGERTEST", name: "Ledger Engine Test" }).returning())[0];

  tenantId = (tenant as { id: string }).id;
  console.log(`Tenant: LEDGERTEST (${tenantId})\n`);

  await seedSystemAccounts(tenantId);
  clearAccountCache();

  RTL = await makeAccount(`RTL_T${RUN}`, "retailer", "liability");
  DIST = await makeAccount(`DIST_T${RUN}`, "distributor", "liability");
  FLOAT = await makeAccount(`TREASURY_FLOAT_T${RUN}`, "float", "asset");

  await check("opens a distributor and funds a retailer down the hierarchy", async () => {
    await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "OPENING_BALANCE",
        idemKey: key("open-dist"),
        entries: [
          { code: "TREASURY_FLOAT_CONTROL", dir: "DR", amount: rupeesToPaise("100000") },
          { code: DIST, dir: "CR", amount: rupeesToPaise("100000") },
        ],
      }),
    );

    await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "WALLET_TRANSFER",
        idemKey: key("dist-to-rtl"),
        entries: [
          { code: DIST, dir: "DR", amount: rupeesToPaise("50000") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("50000") },
        ],
      }),
    );

    expectEq(paiseToRupees((await balanceOf(DIST)).balance), "50000.00", "distributor balance");
    expectEq(paiseToRupees((await balanceOf(RTL)).balance), "50000.00", "retailer balance");
  });

  await check("posts a three-leg DMT with commission income (spec §4.5)", async () => {
    // COMMISSION_INCOME is a shared system account that accumulates across runs, unlike the
    // per-run RTL/DIST/FLOAT accounts. Assert the delta, never the absolute balance.
    const commissionBefore = (await balanceOf("COMMISSION_INCOME")).balance;

    await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "DMT",
        idemKey: key("dmt"),
        entries: [
          { code: RTL, dir: "DR", amount: rupeesToPaise("5025") },
          { code: FLOAT, dir: "CR", amount: rupeesToPaise("5010") },
          { code: "COMMISSION_INCOME", dir: "CR", amount: rupeesToPaise("15") },
        ],
      }),
    );

    expectEq(paiseToRupees((await balanceOf(RTL)).balance), "44975.00", "retailer after DMT");
    // FLOAT is an asset and was credited, so it falls — money left us for the beneficiary.
    expectEq(paiseToRupees((await balanceOf(FLOAT)).balance), "-5010.00", "float after DMT");
    const commissionAfter = (await balanceOf("COMMISSION_INCOME")).balance;
    expectEq(commissionAfter - commissionBefore, rupeesToPaise("15"), "commission earned");
  });

  await check("an AePS credit raises balance AND settleable earning", async () => {
    const before = await balanceOf(RTL);

    await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "AEPS_WITHDRAWAL",
        idemKey: key("aeps"),
        entries: [
          { code: FLOAT, dir: "DR", amount: rupeesToPaise("2000") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("2000") },
        ],
      }),
    );

    const after = await balanceOf(RTL);
    expectEq(after.balance - before.balance, rupeesToPaise("2000"), "balance delta");
    // The agent's own money — they paid the customer from their cash drawer.
    expectEq(after.settleable - before.settleable, rupeesToPaise("2000"), "settleable delta");
  });

  await check("a downline top-up creates NO settleable earning", async () => {
    const before = await balanceOf(RTL);

    await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "WALLET_TRANSFER",
        idemKey: key("topup"),
        entries: [
          { code: DIST, dir: "DR", amount: rupeesToPaise("1000") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("1000") },
        ],
      }),
    );

    const after = await balanceOf(RTL);
    expectEq(after.balance - before.balance, rupeesToPaise("1000"), "balance delta");
    // A deposited advance is spendable but never withdrawable — spec §6.1 and §9.3.
    expectEq(after.settleable, before.settleable, "settleable unchanged");
  });

  await check("replays an idempotency key instead of posting twice", async () => {
    const before = await balanceOf(RTL);

    const replay = await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "WALLET_TRANSFER",
        idemKey: key("topup"), // same key as the previous check
        entries: [
          { code: DIST, dir: "DR", amount: rupeesToPaise("1000") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("1000") },
        ],
      }),
    );

    expectEq(replay.replayed, true, "replayed flag");
    expectEq((await balanceOf(RTL)).balance, before.balance, "balance unchanged on replay");
  });

  await check("refuses to overdraw an agent wallet", async () => {
    const { balance } = await balanceOf(RTL);

    await expectRejects(
      () =>
        db.transaction((tx) =>
          postJournal(tx, {
            tenantId,
            txnType: "DMT",
            idemKey: key("overdraw"),
            entries: [
              { code: RTL, dir: "DR", amount: balance + rupeesToPaise("1") },
              { code: FLOAT, dir: "CR", amount: balance + rupeesToPaise("1") },
            ],
          }),
        ),
      /INSUFFICIENT_BALANCE|Insufficient/,
    );

    expectEq((await balanceOf(RTL)).balance, balance, "balance untouched after refusal");
  });

  await check("rejects an unbalanced journal before it reaches the database", async () => {
    await expectRejects(
      () =>
        db.transaction((tx) =>
          postJournal(tx, {
            tenantId,
            txnType: "WALLET_TRANSFER",
            idemKey: key("unbalanced"),
            entries: [
              { code: DIST, dir: "DR", amount: rupeesToPaise("100") },
              { code: RTL, dir: "CR", amount: rupeesToPaise("99") },
            ],
          }),
        ),
      /Unbalanced/,
    );
  });

  await check("rejects an agent-to-agent peer transfer", async () => {
    // A compliance boundary, not a preference — see spec §9.3.
    await expectRejects(
      () =>
        db.transaction((tx) =>
          postJournal(tx, {
            tenantId,
            txnType: "WALLET_TRANSFER",
            idemKey: key("peer"),
            entries: [
              { code: RTL, dir: "DR", amount: rupeesToPaise("10") },
              { code: DIST, dir: "CR", amount: rupeesToPaise("10") },
            ],
          }),
        ),
      /Flow not permitted/,
    );
  });

  await check("reverses a journal by mirroring it, and refuses to reverse twice", async () => {
    const posted = await db.transaction((tx) =>
      postJournal(tx, {
        tenantId,
        txnType: "WALLET_TRANSFER",
        idemKey: key("to-reverse"),
        entries: [
          { code: DIST, dir: "DR", amount: rupeesToPaise("700") },
          { code: RTL, dir: "CR", amount: rupeesToPaise("700") },
        ],
      }),
    );

    const before = await balanceOf(RTL);

    await db.transaction((tx) =>
      reverseJournal(tx, {
        tenantId,
        journalId: posted.id,
        idemKey: key("reversal"),
        reason: "ledger engine verification",
      }),
    );

    expectEq(before.balance - (await balanceOf(RTL)).balance, rupeesToPaise("700"), "reversal delta");

    await expectRejects(
      () =>
        db.transaction((tx) =>
          reverseJournal(tx, {
            tenantId,
            journalId: posted.id,
            idemKey: key("reversal-2"),
            reason: "should fail",
          }),
        ),
      /already reversed/i,
    );
  });

  await check("leaves every reconciliation check clean", async () => {
    // The real proof: after all of the above, the ledger still agrees with itself.
    expectEq((await checkTrialBalance(tenantId)).length, 0, "trial balance exceptions");
    expectEq((await checkLedgerVsBalance(tenantId)).length, 0, "ledger vs balance exceptions");
    expectEq((await checkSettleable(tenantId)).length, 0, "settleable exceptions");
    expectEq((await checkNegativeAgentBalance(tenantId)).length, 0, "negative balance exceptions");
  });

  console.log(`\n${"-".repeat(72)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log("-".repeat(72));
  console.log(
    failed === 0
      ? "\nENGINE VERIFIED — safe to proceed with the cut-over.\n"
      : "\nENGINE NOT VERIFIED — do not switch live money paths until these pass.\n",
  );

  await pgPool.end();
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(async (err) => {
  console.error("Verification harness crashed:", err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});

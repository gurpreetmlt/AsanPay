/**
 * One-time backfill: give every rupee that predates the ledger a ledger origin.
 *
 *   OPENING_BALANCE   Dr TREASURY_FLOAT_CONTROL / Cr <account>
 *
 * Until this runs, the ledger is empty while the legacy `wallets.balance` column holds the
 * real money — two sources of truth that disagree. After it runs, every balance is
 * reconstructible from journals, which is the whole point of the engine.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *
 *   npm run backfill:opening              # report only
 *   npm run backfill:opening -- --apply   # actually post the journals
 *
 * Run it on a database copy first and confirm the trial balance is zero before touching
 * production. This is the single riskiest step in the migration.
 */
import { eq, sql } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { accounts, accountBalances, tenants, users, wallets } from "../src/db/postgres/schema";
import { postJournal, clearAccountCache } from "../src/core/ledger";
import { ensureHierarchyAccount } from "../src/modules/wallet/ledgerAccounts";
import { rupeesToPaise, paiseToRupees, formatINR, type Paise } from "../src/core/money";

const FLOAT_CONTROL = "TREASURY_FLOAT_CONTROL";
const COMPANY = "COMPANY_001";

const APPLY = process.argv.includes("--apply");

interface Plan {
  userId: string;
  uid: string;
  name: string;
  role: string;
  /** Sum of the user's legacy wallets. See the note below on why these are merged. */
  totalPaise: Paise;
  /**
   * The slice that came from the legacy `aeps` wallet. That wallet holds AePS reimbursements —
   * money the retailer earned by paying out cash from their own drawer — so it opens as
   * SETTLEABLE (withdrawable to their bank), not as a prepaid advance.
   */
  earnedPaise: Paise;
  /** Everything else: deposits and upline transfers. Spendable on services, never withdrawable. */
  advancePaise: Paise;
  breakdown: { walletType: string; walletKind: string; rupees: string }[];
  targetCode: string | null;
}

async function main() {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.code, "ASANPAY")).limit(1);
  if (!tenant) throw new Error("Tenant ASANPAY not found — run migrations first.");

  // Refuse to run twice. Re-posting opening balances would double every agent's money, and
  // the ledger is append-only so there is no clean undo.
  const [already] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(sql`journals`)
    .where(sql`tenant_id = ${tenant.id} AND txn_type LIKE 'OPENING_BALANCE%'`);

  if (Number(already?.n ?? 0) > 0) {
    console.log(
      `\n${already?.n} OPENING_BALANCE journals already exist for this tenant.\n` +
        `Backfill has already run. Nothing to do — exiting without changes.\n`,
    );
    await pgPool.end();
    return;
  }

  const rows = await db
    .select({
      userId: users.id,
      uid: users.uid,
      name: users.name,
      role: users.role,
      walletType: wallets.walletType,
      walletKind: wallets.walletKind,
      balance: wallets.balance,
    })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId));

  const byUser = new Map<string, Plan>();
  for (const row of rows) {
    const paise = rupeesToPaise(row.balance);
    let plan = byUser.get(row.userId);
    if (!plan) {
      plan = {
        userId: row.userId,
        uid: row.uid,
        name: row.name,
        role: row.role,
        totalPaise: 0n,
        earnedPaise: 0n,
        advancePaise: 0n,
        breakdown: [],
        targetCode: null,
      };
      byUser.set(row.userId, plan);
    }
    plan.totalPaise += paise;
    if (row.walletType === "aeps") plan.earnedPaise += paise;
    else plan.advancePaise += paise;
    plan.breakdown.push({
      walletType: row.walletType,
      walletKind: row.walletKind,
      rupees: row.balance,
    });
  }

  const plans = [...byUser.values()].filter((p) => p.totalPaise !== 0n);

  // The aggregator wallet is the platform's own float, not an agent's money — it opens on
  // COMPANY_001, not on a hierarchy account.
  for (const plan of plans) {
    const isAggregator = plan.breakdown.some((b) => b.walletKind === "aggregator");
    if (isAggregator || plan.role === "admin") {
      plan.targetCode = COMPANY;
      // COMPANY_001 is the platform's own float, not an agent's earnings — "settleable" has no
      // meaning there and the flow matrix does not permit an EARNED opening into it.
      plan.advancePaise = plan.totalPaise;
      plan.earnedPaise = 0n;
    } else if (["master_distributor", "distributor", "retailer"].includes(plan.role)) {
      plan.targetCode = null; // resolved per-user below, creates the account if missing
    } else {
      plan.targetCode = "SKIP";
    }
  }

  const skipped = plans.filter((p) => p.targetCode === "SKIP");
  const actionable = plans.filter((p) => p.targetCode !== "SKIP");
  const total = actionable.reduce<Paise>((acc, p) => acc + p.totalPaise, 0n);
  const merged = actionable.filter((p) => p.breakdown.length > 1);
  const negative = actionable.filter((p) => p.totalPaise < 0n);

  console.log(`\n${"=".repeat(72)}`);
  console.log(`OPENING BALANCE BACKFILL — ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("=".repeat(72));
  console.log(`Tenant            : ${tenant.code} (${tenant.id})`);
  console.log(`Wallet rows       : ${rows.length}`);
  console.log(`Users with money  : ${actionable.length}`);
  console.log(`Total to open     : ${formatINR(total)}`);
  console.log(`Skipped (no role) : ${skipped.length}`);

  const totalEarned = actionable.reduce<Paise>((acc, p) => acc + p.earnedPaise, 0n);
  console.log(`  of which earned : ${formatINR(totalEarned)} (settleable — agent may withdraw)`);
  console.log(`  of which advance: ${formatINR(total - totalEarned)} (spendable, not withdrawable)`);

  if (merged.length > 0) {
    // The ledger holds ONE account per agent, while the legacy schema splits main and aeps.
    // Merging into one balance is correct for the ledger model, but the earned/advance split
    // is preserved as `settleable` — otherwise migration would quietly convert an agent's own
    // AePS earnings into money they can spend but never withdraw.
    console.log(`\n!! ${merged.length} user(s) have more than one legacy wallet.`);
    console.log(`   Balances merge into one ledger account; the aeps slice opens as settleable:`);
    for (const p of merged.slice(0, 10)) {
      const parts = p.breakdown.map((b) => `${b.walletType}=${b.rupees}`).join(" + ");
      console.log(
        `   ${p.uid.padEnd(16)} ${parts}  ->  ${paiseToRupees(p.totalPaise)} ` +
          `(settleable ${paiseToRupees(p.earnedPaise)})`,
      );
    }
    if (merged.length > 10) console.log(`   ... and ${merged.length - 10} more`);
  }

  if (negative.length > 0) {
    // A liability account cannot open negative — the trigger would reject it, and a negative
    // agent balance means the legacy data is already inconsistent. Stop and investigate.
    console.log(`\n!! ${negative.length} user(s) have a NEGATIVE total balance. Cannot proceed:`);
    for (const p of negative) console.log(`   ${p.uid}  ${paiseToRupees(p.totalPaise)}`);
    console.log(`\nFix these in the legacy data first. Aborting.\n`);
    await pgPool.end();
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing was written.`);
    console.log(`Re-run with --apply to post ${actionable.length} OPENING_BALANCE journals.\n`);
    await pgPool.end();
    return;
  }

  console.log(`\nPosting ${actionable.length} journals...`);
  let posted = 0;

  for (const plan of actionable) {
    await db.transaction(async (tx) => {
      const code =
        plan.targetCode ?? (await ensureHierarchyAccount(tx, tenant.id, plan.userId));

      const legacy = plan.breakdown.map((b) => `${b.walletType}=${b.rupees}`).join(", ");

      // Two journals where the agent has both kinds of money, so `settleable` lands correctly.
      // Idempotency keys are per-user AND per-slice, so a re-run after a partial failure
      // resumes rather than doubling anything.
      if (plan.advancePaise > 0n) {
        await postJournal(tx, {
          tenantId: tenant.id,
          txnType: "OPENING_BALANCE",
          idemKey: `OPENING:${plan.userId}:ADVANCE`,
          performedBy: null,
          reason: `Opening advance migrated from legacy wallets (${legacy})`,
          referenceId: plan.userId,
          entries: [
            { code: FLOAT_CONTROL, dir: "DR", amount: plan.advancePaise },
            { code, dir: "CR", amount: plan.advancePaise },
          ],
        });
      }

      if (plan.earnedPaise > 0n) {
        await postJournal(tx, {
          tenantId: tenant.id,
          txnType: "OPENING_BALANCE_EARNED",
          idemKey: `OPENING:${plan.userId}:EARNED`,
          performedBy: null,
          reason: `Opening AePS earnings migrated from legacy aeps wallet (${legacy})`,
          referenceId: plan.userId,
          entries: [
            { code: FLOAT_CONTROL, dir: "DR", amount: plan.earnedPaise },
            { code, dir: "CR", amount: plan.earnedPaise },
          ],
        });
      }
    });
    posted += 1;
    if (posted % 25 === 0) console.log(`  ... ${posted}/${actionable.length}`);
  }

  clearAccountCache();
  console.log(`Posted ${posted} journals.`);

  await verify(tenant.id, total);
  await pgPool.end();
}

/**
 * Confirm the ledger now agrees with itself AND with the legacy column it was built from.
 * If either check fails, the backfill is wrong and must be investigated before anything is
 * switched over to the new engine.
 */
async function verify(tenantId: string, expectedTotal: Paise): Promise<void> {
  console.log(`\n${"-".repeat(72)}\nVERIFICATION\n${"-".repeat(72)}`);

  const [tb] = await db
    .select({
      dr: sql<string>`COALESCE(SUM(CASE WHEN direction='DR' THEN amount ELSE 0 END),0)`,
      cr: sql<string>`COALESCE(SUM(CASE WHEN direction='CR' THEN amount ELSE 0 END),0)`,
    })
    .from(sql`ledger_entries`);

  const dr = BigInt(tb?.dr ?? "0");
  const cr = BigInt(tb?.cr ?? "0");
  console.log(`Trial balance     : DR ${paiseToRupees(dr)} / CR ${paiseToRupees(cr)}`);
  console.log(`  ${dr === cr ? "PASS — balanced" : "FAIL — LEDGER DOES NOT BALANCE"}`);

  const [control] = await db
    .select({ balance: accountBalances.balance })
    .from(accounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(eq(accounts.code, FLOAT_CONTROL));

  // FLOAT_CONTROL is credit-normal and was debited for every opening, so it should sit at
  // exactly minus the total issued.
  const controlBalance = control?.balance ?? 0n;
  console.log(`Float control     : ${paiseToRupees(controlBalance)} (expect ${paiseToRupees(-expectedTotal)})`);
  console.log(`  ${controlBalance === -expectedTotal ? "PASS" : "FAIL — control account does not match"}`);

  const drift = await db.execute<{ code: string; ledger: string; legacy: string }>(sql`
    SELECT a.code,
           ab.balance::text AS ledger,
           (SUM(w.balance) * 100)::bigint::text AS legacy
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    JOIN wallets w ON w.user_id = a.user_id
    WHERE a.tenant_id = ${tenantId} AND a.user_id IS NOT NULL
    GROUP BY a.code, ab.balance
    HAVING ab.balance <> (SUM(w.balance) * 100)::bigint
  `);

  const settle = await db.execute<{ code: string; settleable: string; legacy_aeps: string }>(sql`
    SELECT a.code,
           ab.settleable::text,
           COALESCE((SELECT (w.balance * 100)::bigint FROM wallets w
                     WHERE w.user_id = a.user_id AND w.wallet_type = 'aeps'), 0)::text AS legacy_aeps
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    WHERE a.tenant_id = ${tenantId} AND a.user_id IS NOT NULL
      AND ab.settleable <> COALESCE((SELECT (w.balance * 100)::bigint FROM wallets w
                     WHERE w.user_id = a.user_id AND w.wallet_type = 'aeps'), 0)
  `);

  console.log(`Settleable split  : ${settle.rows.length} mismatch(es)`);
  for (const row of settle.rows.slice(0, 10)) {
    console.log(`  ${row.code}: settleable=${row.settleable} legacy aeps=${row.legacy_aeps}`);
  }
  console.log(
    `  ${settle.rows.length === 0 ? "PASS — earned money stayed withdrawable" : "FAIL — an agent's earnings were mis-classified"}`,
  );

  console.log(`Ledger vs legacy  : ${drift.rows.length} mismatch(es)`);
  for (const row of drift.rows.slice(0, 10)) {
    console.log(`  ${row.code}: ledger=${row.ledger} legacy=${row.legacy}`);
  }
  console.log(`  ${drift.rows.length === 0 ? "PASS — every agent matches" : "FAIL — investigate before switching over"}\n`);
}

main().catch((err) => {
  console.error("Opening balance backfill failed:", err);
  process.exit(1);
});

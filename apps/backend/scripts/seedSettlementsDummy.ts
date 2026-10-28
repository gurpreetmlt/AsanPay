import { refuseInProduction } from "./_guard";
refuseInProduction("seed:settlements-dummy");

/**
 * Staging dummy for admin Settlements UI (open payouts + optional pending bank).
 *
 * Gives a known seed retailer settleable balance, active bank, and open settlement request(s).
 * Safe to re-run: uses fixed idempotency keys; skips if open requests already exist.
 *
 * EC2 (backend container):
 *   npm run seed:settlements-dummy
 *
 * Or from monorepo:
 *   npm run seed:settlements-dummy -w @asanpay/backend
 */
import "dotenv/config";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import {
  agentSettlementAccounts,
  settlementRequests,
  tenants,
  users,
} from "../src/db/postgres/schema";
import { postJournal } from "../src/core/ledger";
import { ensureHierarchyAccount } from "../src/modules/wallet/ledgerAccounts";
import { encryptPII } from "../src/utils/aes";
import { requestSettlement } from "../src/modules/settlements/settlement.service";

const FLOAT_CONTROL = "TREASURY_FLOAT_CONTROL";
const DEMO_MOBILE = process.env.SEED_SETTLEMENT_MOBILE || "9333333333";
const EARNED_PAISE = 500_00n; // ₹500 settleable for demos
const SETTLE_AMOUNT = "250.00"; // open payout row

async function main() {
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.code, "ASANPAY"))
    .limit(1);
  if (!tenant) throw new Error("Tenant ASANPAY not found — run bootstrap/migrations first");

  const [agent] = await db
    .select({ id: users.id, name: users.name, uid: users.uid, mobile: users.mobile })
    .from(users)
    .where(and(eq(users.mobile, DEMO_MOBILE), eq(users.role, "retailer")))
    .limit(1);

  if (!agent) {
    throw new Error(
      `Retailer ${DEMO_MOBILE} not found — run seed:network first (demo Suresh Yadav)`,
    );
  }

  const openCount = await db
    .select({ n: sql<string>`count(*)` })
    .from(settlementRequests)
    .where(
      and(
        eq(settlementRequests.tenantId, tenant.id),
        inArray(settlementRequests.status, ["requested", "queued", "processing"]),
      ),
    );
  if (Number(openCount[0]?.n ?? 0) > 0) {
    console.log(
      `Already ${openCount[0]?.n} open settlement(s) — admin Settlements is not empty. No-op.`,
    );
    return;
  }

  await db.transaction(async (tx) => {
    const code = await ensureHierarchyAccount(tx, tenant.id, agent.id);
    await postJournal(tx, {
      tenantId: tenant.id,
      txnType: "OPENING_BALANCE_EARNED",
      idemKey: `SEED_SETTLE_EARNED:${agent.id}`,
      performedBy: null,
      reason: "Dummy settleable for admin Settlements UI demo",
      referenceId: agent.id,
      entries: [
        { code: FLOAT_CONTROL, dir: "DR", amount: EARNED_PAISE },
        { code, dir: "CR", amount: EARNED_PAISE },
      ],
    });
  });
  console.log(`Credited ₹${Number(EARNED_PAISE) / 100} settleable to ${agent.name} (${agent.mobile})`);

  // Active verified bank (admin already approved) — skips pending queue.
  let bankId: bigint | undefined;
  const [activeBank] = await db
    .select({ id: agentSettlementAccounts.id })
    .from(agentSettlementAccounts)
    .where(
      and(
        eq(agentSettlementAccounts.userId, agent.id),
        eq(agentSettlementAccounts.isActive, true),
      ),
    )
    .limit(1);

  if (activeBank) {
    bankId = activeBank.id;
    console.log("Using existing active settlement bank");
  } else {
    const digits = "123456789012";
    // Maker-checker: createdBy = agent, approvedBy = another user (admin if present)
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    if (!admin) throw new Error("No admin user to approve settlement bank (maker-checker)");

    const [bank] = await db
      .insert(agentSettlementAccounts)
      .values({
        tenantId: tenant.id,
        userId: agent.id,
        accountNumberEnc: encryptPII(digits),
        accountNumberLast4: digits.slice(-4),
        ifsc: "SBIN0001234",
        holderName: agent.name,
        verifiedAt: new Date(),
        verificationRef: "SEED-PENNYDROP-STUB",
        isActive: true,
        effectiveFrom: new Date(),
        createdBy: agent.id,
        approvedBy: admin.id,
      })
      .returning({ id: agentSettlementAccounts.id });
    bankId = bank?.id;
    console.log("Created active settlement bank ****" + digits.slice(-4));
  }

  if (!bankId) throw new Error("Could not resolve settlement bank");

  // One optional pending bank for Pending banks tab (different agent if exists)
  const [other] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, "retailer"), ne(users.id, agent.id)))
    .limit(1);
  if (other) {
    const [pending] = await db
      .select({ id: agentSettlementAccounts.id })
      .from(agentSettlementAccounts)
      .where(
        and(eq(agentSettlementAccounts.userId, other.id), isNull(agentSettlementAccounts.verifiedAt)),
      )
      .limit(1);
    if (!pending) {
      await db.insert(agentSettlementAccounts).values({
        tenantId: tenant.id,
        userId: other.id,
        accountNumberEnc: encryptPII("998877665544"),
        accountNumberLast4: "5544",
        ifsc: "HDFC0004321",
        holderName: other.name,
        isActive: false,
        createdBy: other.id,
      });
      console.log(`Pending bank queued for ${other.name} (Pending banks tab)`);
    }
  }

  const result = await requestSettlement({
    tenantId: tenant.id,
    userId: agent.id,
    amount: BigInt(Math.round(parseFloat(SETTLE_AMOUNT) * 100)),
    mode: "imps",
    idempotencyKey: `seed-settle-open-${agent.id}`,
  });

  console.log(
    `Open settlement request ${result.requestId} status=${result.status} amount=₹${SETTLE_AMOUNT}`,
  );
  console.log("Admin → Settlements → Open payouts should show 1 row.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });

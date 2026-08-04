import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import {
  users,
  wallets,
  services,
  serviceCategories,
  transactions,
  userHierarchy,
  commissionRules,
  commissionLedger,
  walletLedgerEntries,
  walletLedgerGroups,
} from "../src/db/postgres/schema";
import { distributeCommissionForTxn } from "../src/modules/commission/commission.service";

// Regression: commission fans out to ONE wallet_ledger_groups row per beneficiary, all sharing
// the same (referenceType="commission", referenceId=txn.id) — that is by design, not a bug. A
// unique index on (reference_type, reference_id) that does NOT exclude "commission" would let
// the FIRST beneficiary's ledger-group insert succeed and every subsequent beneficiary's insert
// throw a unique-violation, which commission.service's catch-and-log treats as an already-paid
// duplicate — silently dropping every beneficiary above the first in the chain. This test fails
// loudly if that exclusion is ever removed, by asserting BOTH levels actually got paid.

const SUFFIX = Date.now().toString(36);
const SYSTEM_FLOAT = "1000000.00";

let adminId: string;
let adminWalletId: string;
let masterDistId: string;
let masterDistWalletId: string;
let distId: string;
let distWalletId: string;
let retailerId: string;
let serviceId: string;
let categoryId: string;
let txnId: string;

beforeAll(async () => {
  const [existingAdmin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  adminId = existingAdmin!.id;
  const [adminWallet] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, adminId), eq(wallets.walletType, "main")));
  adminWalletId = adminWallet!.id;
  await db.update(wallets).set({ balance: SYSTEM_FLOAT }).where(eq(wallets.id, adminWalletId));

  const [md] = await db
    .insert(users)
    .values({
      uid: `MD${SUFFIX}`,
      role: "super_distributor",
      name: "Sec Test MasterDist",
      mobile: `5${SUFFIX.slice(-9).padStart(9, "0")}`,
      passwordHash: "x",
      parentId: adminId,
    })
    .returning();
  masterDistId = md!.id;
  const [mdw] = await db.insert(wallets).values({ userId: masterDistId, walletType: "main", balance: "0" }).returning();
  masterDistWalletId = mdw!.id;

  const [d] = await db
    .insert(users)
    .values({
      uid: `DS${SUFFIX}`,
      role: "distributor",
      name: "Sec Test Dist",
      mobile: `4${SUFFIX.slice(-9).padStart(9, "0")}`,
      passwordHash: "x",
      parentId: masterDistId,
    })
    .returning();
  distId = d!.id;
  const [dw] = await db.insert(wallets).values({ userId: distId, walletType: "main", balance: "0" }).returning();
  distWalletId = dw!.id;

  const [r] = await db
    .insert(users)
    .values({
      uid: `RT${SUFFIX}`,
      role: "retailer",
      name: "Sec Test Retailer",
      mobile: `3${SUFFIX.slice(-9).padStart(9, "0")}`,
      passwordHash: "x",
      parentId: distId,
      kycStatus: "verified",
    })
    .returning();
  retailerId = r!.id;

  await db.insert(userHierarchy).values([
    { ancestorId: masterDistId, descendantId: masterDistId, depth: 0 },
    { ancestorId: distId, descendantId: distId, depth: 0 },
    { ancestorId: distId, descendantId: retailerId, depth: 0 },
    { ancestorId: retailerId, descendantId: retailerId, depth: 0 },
    { ancestorId: masterDistId, descendantId: distId, depth: 1 },
    { ancestorId: distId, descendantId: retailerId, depth: 1 },
    { ancestorId: masterDistId, descendantId: retailerId, depth: 2 },
    { ancestorId: adminId, descendantId: retailerId, depth: 3 },
    { ancestorId: adminId, descendantId: distId, depth: 2 },
    { ancestorId: adminId, descendantId: masterDistId, depth: 1 },
  ]);

  const [cat] = await db.insert(serviceCategories).values({ code: `secml_${SUFFIX}`, name: "Sec Test Multi" }).returning();
  categoryId = cat!.id;
  const [svc] = await db.insert(services).values({ categoryId, code: `sectest_ml_${SUFFIX}`, name: "Sec Test Multi Comm" }).returning();
  serviceId = svc!.id;

  // Both levels get a commission rule on this service — the realistic fan-out case.
  await db.insert(commissionRules).values([
    { serviceId, role: "distributor", ruleType: "flat", value: "10.00" },
    { serviceId, role: "super_distributor", ruleType: "flat", value: "5.00" },
  ]);

  const [txn] = await db
    .insert(transactions)
    .values({
      txnRef: `SECML-${SUFFIX}`,
      idempotencyKey: `secml-${SUFFIX}`,
      userId: retailerId,
      serviceId,
      amount: "5000.00",
      status: "success",
      walletType: "main",
    })
    .returning();
  txnId = txn!.id;
});

afterAll(async () => {
  const groups = await db.select({ id: walletLedgerGroups.id }).from(walletLedgerGroups).where(eq(walletLedgerGroups.referenceId, txnId));
  for (const g of groups) await db.delete(walletLedgerEntries).where(eq(walletLedgerEntries.groupId, g.id));
  await db.delete(commissionLedger).where(eq(commissionLedger.transactionId, txnId));
  await db.delete(walletLedgerGroups).where(eq(walletLedgerGroups.referenceId, txnId));
  await db.delete(transactions).where(eq(transactions.id, txnId));
  await db.delete(commissionRules).where(eq(commissionRules.serviceId, serviceId));
  await db.delete(services).where(eq(services.id, serviceId));
  await db.delete(serviceCategories).where(eq(serviceCategories.id, categoryId));
  await db.delete(userHierarchy).where(eq(userHierarchy.descendantId, retailerId));
  await db.delete(userHierarchy).where(eq(userHierarchy.descendantId, distId));
  await db.delete(userHierarchy).where(eq(userHierarchy.descendantId, masterDistId));
  await db.delete(wallets).where(eq(wallets.userId, retailerId));
  await db.delete(wallets).where(eq(wallets.userId, distId));
  await db.delete(wallets).where(eq(wallets.userId, masterDistId));
  await db.delete(users).where(eq(users.id, retailerId));
  await db.delete(users).where(eq(users.id, distId));
  await db.delete(users).where(eq(users.id, masterDistId));
  await pgPool.end();
});

describe("commission multi-level fan-out (regression: ledger-group ref uniqueness)", () => {
  it("pays every level in the chain, not just the first to insert its ledger group", async () => {
    await distributeCommissionForTxn(txnId);

    const ledgerRows = await db
      .select({ beneficiaryUserId: commissionLedger.beneficiaryUserId, amount: commissionLedger.amount })
      .from(commissionLedger)
      .where(eq(commissionLedger.transactionId, txnId));
    expect(ledgerRows).toHaveLength(2);

    const distRow = ledgerRows.find((r) => r.beneficiaryUserId === distId);
    const mdRow = ledgerRows.find((r) => r.beneficiaryUserId === masterDistId);
    expect(distRow?.amount).toBe("10.00");
    expect(mdRow?.amount).toBe("5.00");

    const [distWallet] = await db.select().from(wallets).where(eq(wallets.id, distWalletId));
    const [mdWallet] = await db.select().from(wallets).where(eq(wallets.id, masterDistWalletId));
    expect(distWallet!.balance).toBe("10.00");
    expect(mdWallet!.balance).toBe("5.00");

    const groups = await db
      .select()
      .from(walletLedgerGroups)
      .where(and(eq(walletLedgerGroups.referenceType, "commission"), eq(walletLedgerGroups.referenceId, txnId)));
    expect(groups).toHaveLength(2);
  });
});

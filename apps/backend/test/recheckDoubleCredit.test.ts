import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import {
  users,
  wallets,
  services,
  serviceCategories,
  providers,
  providerServices,
  transactions,
  userHierarchy,
  walletLedgerGroups,
  walletLedgerEntries,
} from "../src/db/postgres/schema";
import { recheckTxnStatus } from "../src/modules/transactions/txn.service";
import { TEST_PROVIDER_CODE } from "./helpers/mockProvider";

// Critical-1 regression: a pending AEPS credit must settle EXACTLY ONCE even when a retailer
// fires many concurrent /recheck calls for the same txn. Before the fix (no txn-row lock +
// status re-check inside finalize), each racing recheck moved system->retailer money again,
// minting balance the retailer never earned. This drives the real recheckTxnStatus path.

const SUFFIX = Date.now().toString(36);
const AMOUNT = "5000.00";
const CONCURRENCY = 10;
const SYSTEM_FLOAT = "1000000.00";

let adminId: string;
let adminWalletId: string;
let retailerId: string;
let retailerAepsWalletId: string;
let serviceId: string;
let categoryId: string;
let providerId: string;
let txnId: string;
let txnRef: string;

beforeAll(async () => {
  // Root admin = system settlement counterparty. Reuse the existing one if present.
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "admin")))
    .limit(1);

  if (existingAdmin) {
    adminId = existingAdmin.id;
  } else {
    const [a] = await db
      .insert(users)
      .values({ uid: `ADM${SUFFIX}`, role: "admin", name: "Sec Test Admin", mobile: `9${SUFFIX.slice(-9).padStart(9, "0")}`, passwordHash: "x", parentId: null })
      .returning();
    adminId = a!.id;
  }

  // Ensure the admin has a funded main wallet (the system float credits come from here).
  const [adminWallet] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, adminId), eq(wallets.walletType, "main")));
  if (adminWallet) {
    adminWalletId = adminWallet.id;
    await db.update(wallets).set({ balance: SYSTEM_FLOAT }).where(eq(wallets.id, adminWalletId));
  } else {
    const [w] = await db.insert(wallets).values({ userId: adminId, walletType: "main", balance: SYSTEM_FLOAT }).returning();
    adminWalletId = w!.id;
  }

  // Fresh retailer with a zero-balance AEPS wallet.
  const [r] = await db
    .insert(users)
    .values({ uid: `RT${SUFFIX}`, role: "retailer", name: "Sec Test Retailer", mobile: `8${SUFFIX.slice(-9).padStart(9, "0")}`, passwordHash: "x", parentId: adminId, kycStatus: "verified" })
    .returning();
  retailerId = r!.id;
  await db.insert(userHierarchy).values({ ancestorId: retailerId, descendantId: retailerId, depth: 0 });
  const [aepsWallet] = await db.insert(wallets).values({ userId: retailerId, walletType: "aeps", balance: "0" }).returning();
  retailerAepsWalletId = aepsWallet!.id;

  // AEPS service (code must start with "aeps_" so recheck infers a credit direction).
  const [cat] = await db.insert(serviceCategories).values({ code: `sec_${SUFFIX}`, name: "Sec Test" }).returning();
  categoryId = cat!.id;
  const [svc] = await db
    .insert(services)
    .values({ categoryId, code: `aeps_sectest_${SUFFIX}`, name: "Sec Test AEPS Withdraw" })
    .returning();
  serviceId = svc!.id;

  // The test_mock provider resolves to the mock adapter (checkStatus -> success).
  const [existingMock] = await db.select().from(providers).where(eq(providers.code, TEST_PROVIDER_CODE)).limit(1);
  const prov =
    existingMock ??
    (await db.insert(providers).values({ code: TEST_PROVIDER_CODE, name: "Test mock" }).returning())[0];
  providerId = prov!.id;
  await db
    .insert(providerServices)
    .values({ serviceId, providerId, providerServiceCode: `${TEST_PROVIDER_CODE}-aeps`, isPrimary: true });

  // A pending AEPS withdrawal awaiting settlement.
  txnRef = `SECTEST-${SUFFIX}`;
  const [txn] = await db
    .insert(transactions)
    .values({
      txnRef,
      idempotencyKey: `sec-${SUFFIX}`,
      userId: retailerId,
      serviceId,
      providerId,
      amount: AMOUNT,
      status: "pending",
      walletType: "aeps",
    })
    .returning();
  txnId = txn!.id;
});

afterAll(async () => {
  // Unwind everything this test created, in FK-safe order.
  await db.delete(walletLedgerEntries).where(eq(walletLedgerEntries.walletId, retailerAepsWalletId));
  const groups = await db.select({ id: walletLedgerGroups.id }).from(walletLedgerGroups).where(eq(walletLedgerGroups.referenceId, txnId));
  for (const g of groups) {
    await db.delete(walletLedgerEntries).where(eq(walletLedgerEntries.groupId, g.id));
  }
  await db.delete(walletLedgerGroups).where(eq(walletLedgerGroups.referenceId, txnId));
  await db.delete(transactions).where(eq(transactions.id, txnId));
  await db.delete(providerServices).where(eq(providerServices.serviceId, serviceId));
  await db.delete(providers).where(eq(providers.id, providerId));
  await db.delete(services).where(eq(services.id, serviceId));
  await db.delete(serviceCategories).where(eq(serviceCategories.id, categoryId));
  await db.delete(userHierarchy).where(eq(userHierarchy.descendantId, retailerId));
  await db.delete(wallets).where(eq(wallets.userId, retailerId));
  await db.delete(users).where(eq(users.id, retailerId));
  await pgPool.end();
});

describe("recheck settlement idempotency (Critical-1)", () => {
  it("credits a pending AEPS txn exactly once under concurrent rechecks", async () => {
    const actor = { id: retailerId, role: "retailer" as const };

    // Fire N concurrent rechecks for the same pending txn.
    await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        recheckTxnStatus(actor, txnRef).catch(() => undefined),
      ),
    );

    // The retailer's AEPS wallet must have been credited exactly one AMOUNT — not N.
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, retailerAepsWalletId));
    expect(wallet!.balance).toBe(AMOUNT);

    // And exactly one settlement ledger group must reference this txn.
    const settlementGroups = await db
      .select({ id: walletLedgerGroups.id })
      .from(walletLedgerGroups)
      .where(and(eq(walletLedgerGroups.referenceType, "service_txn"), eq(walletLedgerGroups.referenceId, txnId)));
    expect(settlementGroups.length).toBe(1);

    // Txn ends terminal-success.
    const [txn] = await db.select().from(transactions).where(eq(transactions.id, txnId));
    expect(txn!.status).toBe("success");
  });
});

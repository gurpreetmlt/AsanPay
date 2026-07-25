import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/postgres";
import {
  users,
  wallets,
  services,
  serviceCategories,
  providers,
  providerServices,
  transactions,
  userHierarchy,
  commissionRules,
  commissionLedger,
  walletLedgerEntries,
  walletLedgerGroups,
} from "../../src/db/postgres/schema";
import { executeServiceTxn, type TxnOutcome } from "../../src/modules/transactions/txn.service";

// Shared money-core test world: a funded system admin, a distributor, and a retailer (under the
// distributor) with main + aeps wallets. Services/providers/rules are added per-test. Everything
// is namespaced by `suffix` and torn down by destroy(). Faithful to the real endpoints — tests
// drive executeServiceTxn, not the ledger directly, so they exercise the true credit/debit paths.

export interface World {
  suffix: string;
  adminId: string;
  adminWalletId: string;
  distId: string;
  distMainWalletId: string;
  retailerId: string;
  retailerMainWalletId: string;
  retailerAepsWalletId: string;
  categoryId: string;
  providerId: string;
  serviceIds: string[];
  addService: (code: string, opts?: { maxAmount?: string }) => Promise<string>;
  setBalance: (walletId: string, amount: string) => Promise<void>;
  getBalance: (walletId: string) => Promise<string>;
  getHoldBalance: (walletId: string) => Promise<string>;
  runDmt: (amount: string, idempotencyKey: string) => Promise<TxnOutcome>;
  runAeps: (amount: string, idempotencyKey: string) => Promise<TxnOutcome>;
  destroy: () => Promise<void>;
}

const SYSTEM_FLOAT = "10000000.00";

export async function createWorld(suffix: string): Promise<World> {
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  const adminId = admin!.id;
  const [aw] = await db.select().from(wallets).where(and(eq(wallets.userId, adminId), eq(wallets.walletType, "main")));
  const adminWalletId = aw!.id;
  await db.update(wallets).set({ balance: SYSTEM_FLOAT }).where(eq(wallets.id, adminWalletId));

  const [dist] = await db
    .insert(users)
    .values({ uid: `DS${suffix}`, role: "distributor", name: "W Dist", mobile: `71${suffix.slice(-8).padStart(8, "0")}`, passwordHash: "x", parentId: adminId, kycStatus: "verified" })
    .returning();
  const distId = dist!.id;
  const [dw] = await db.insert(wallets).values({ userId: distId, walletType: "main", balance: "0" }).returning();
  const distMainWalletId = dw!.id;
  await db.insert(userHierarchy).values({ ancestorId: distId, descendantId: distId, depth: 0 });

  const [retailer] = await db
    .insert(users)
    .values({ uid: `RT${suffix}`, role: "retailer", name: "W Retailer", mobile: `61${suffix.slice(-8).padStart(8, "0")}`, passwordHash: "x", parentId: distId, kycStatus: "verified" })
    .returning();
  const retailerId = retailer!.id;
  const [rMain] = await db.insert(wallets).values({ userId: retailerId, walletType: "main", balance: "0" }).returning();
  const [rAeps] = await db.insert(wallets).values({ userId: retailerId, walletType: "aeps", balance: "0" }).returning();
  await db.insert(userHierarchy).values([
    { ancestorId: retailerId, descendantId: retailerId, depth: 0 },
    { ancestorId: distId, descendantId: retailerId, depth: 1 },
    { ancestorId: adminId, descendantId: retailerId, depth: 2 },
  ]);

  const [cat] = await db.insert(serviceCategories).values({ code: `w_${suffix}`, name: "W Cat" }).returning();
  const categoryId = cat!.id;

  await db.delete(providers).where(eq(providers.code, "eko"));
  const [prov] = await db.insert(providers).values({ code: "eko", name: "Eko (mock)" }).returning();
  const providerId = prov!.id;

  const serviceIds: string[] = [];

  async function addService(code: string, opts?: { maxAmount?: string }): Promise<string> {
    // maxAmount is mandatory server-side (executeServiceTxn refuses to run without one) — default
    // to a large sane ceiling so tests that aren't specifically about the cap don't need to set it.
    const [svc] = await db
      .insert(services)
      .values({ categoryId, code: `${code}_${suffix}`, name: code, maxAmount: opts?.maxAmount ?? "10000000.00" })
      .returning();
    await db.insert(providerServices).values({ serviceId: svc!.id, providerId, providerServiceCode: "eko", isPrimary: true });
    serviceIds.push(svc!.id);
    return svc!.id;
  }

  async function setBalance(walletId: string, amount: string) {
    await db.update(wallets).set({ balance: amount }).where(eq(wallets.id, walletId));
  }
  async function getBalance(walletId: string): Promise<string> {
    const [w] = await db.select().from(wallets).where(eq(wallets.id, walletId));
    return w!.balance;
  }
  async function getHoldBalance(walletId: string): Promise<string> {
    const [w] = await db.select().from(wallets).where(eq(wallets.id, walletId));
    return w!.holdBalance;
  }

  async function runDmt(amount: string, idempotencyKey: string): Promise<TxnOutcome> {
    return executeServiceTxn({
      actor: { id: retailerId, role: "retailer" },
      serviceCode: `dmt_${suffix}`,
      amount,
      idempotencyKey,
      operation: "dmt_transfer",
      direction: "debit",
      walletType: "main",
      metadata: {},
      invoke: (routed, txnRef) =>
        routed.adapter.dmtTransfer({ retailerUserId: retailerId, customerMobile: "9999999999", beneficiaryId: `BEN-${txnRef}`, amount, mode: "imps" }),
    });
  }

  async function runAeps(amount: string, idempotencyKey: string): Promise<TxnOutcome> {
    return executeServiceTxn({
      actor: { id: retailerId, role: "retailer" },
      serviceCode: `aeps_${suffix}`,
      amount,
      idempotencyKey,
      operation: "aeps_withdraw",
      direction: "credit",
      walletType: "aeps",
      metadata: {},
      invoke: (routed) =>
        routed.adapter.aepsWithdraw({ retailerUserId: retailerId, aadhaarNumber: "123456789012", bankIin: "SBI000", mobile: "9999999999", biometricPayload: "x", amount }),
    });
  }

  async function destroy() {
    // Delete money rows tied to this world's retailer/dist wallets, then structural rows.
    for (const wid of [retailerMainWalletId(), retailerAepsWalletId(), distMainWalletId]) {
      await db.delete(walletLedgerEntries).where(eq(walletLedgerEntries.walletId, wid));
    }
    const txns = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, retailerId));
    for (const t of txns) {
      await db.delete(commissionLedger).where(eq(commissionLedger.transactionId, t.id));
      const groups = await db.select({ id: walletLedgerGroups.id }).from(walletLedgerGroups).where(eq(walletLedgerGroups.referenceId, t.id));
      for (const g of groups) await db.delete(walletLedgerEntries).where(eq(walletLedgerEntries.groupId, g.id));
      await db.delete(walletLedgerGroups).where(eq(walletLedgerGroups.referenceId, t.id));
    }
    await db.delete(transactions).where(eq(transactions.userId, retailerId));
    for (const sid of serviceIds) {
      await db.delete(commissionRules).where(eq(commissionRules.serviceId, sid));
      await db.delete(providerServices).where(eq(providerServices.serviceId, sid));
      await db.delete(services).where(eq(services.id, sid));
    }
    await db.delete(providers).where(eq(providers.id, providerId));
    await db.delete(serviceCategories).where(eq(serviceCategories.id, categoryId));
    await db.delete(userHierarchy).where(eq(userHierarchy.descendantId, retailerId));
    await db.delete(userHierarchy).where(eq(userHierarchy.descendantId, distId));
    await db.delete(wallets).where(eq(wallets.userId, retailerId));
    await db.delete(wallets).where(eq(wallets.userId, distId));
    await db.delete(users).where(eq(users.id, retailerId));
    await db.delete(users).where(eq(users.id, distId));
  }

  // captured ids used by destroy()
  function retailerMainWalletId() {
    return rMain!.id;
  }
  function retailerAepsWalletId() {
    return rAeps!.id;
  }

  return {
    suffix,
    adminId,
    adminWalletId,
    distId,
    distMainWalletId,
    retailerId,
    retailerMainWalletId: rMain!.id,
    retailerAepsWalletId: rAeps!.id,
    categoryId,
    providerId,
    serviceIds,
    addService,
    setBalance,
    getBalance,
    getHoldBalance,
    runDmt,
    runAeps,
    destroy,
  };
}

import { randomUUID } from "node:crypto";
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
  tenants,
  accounts,
  accountBalances,
} from "../../src/db/postgres/schema";
import { executeServiceTxn, type TxnOutcome } from "../../src/modules/transactions/txn.service";
import { postJournal, clearAccountCache } from "../../src/core/ledger";
import { rupeesToPaise } from "../../src/core/money";
import { seedSystemAccounts } from "../../src/modules/bootstrap/systemAccounts";
import { ensureHierarchyAccount } from "../../src/modules/wallet/ledgerAccounts";
import {
  clearTenantCache,
  legacyTenantCode,
  mirrorBalances,
} from "../../src/modules/wallet/wallet.ledger";

// Shared money-core test world: a funded system admin, a distributor, and a retailer (under the
// distributor) with main + aeps wallets. Services/providers/rules are added per-test. Everything
// is namespaced by `suffix` and torn down by destroy(). Faithful to the real endpoints — tests
// drive executeServiceTxn, not the ledger directly, so they exercise the true credit/debit paths.
//
// Post cut-over: wallets.balance is a mirror. setBalance() posts journals under LEDGERTEST
// (LEDGER_TENANT_CODE); destroy() never DELETE users (accounts.user_id ON DELETE RESTRICT).

/** Isolation tenant for DB-backed money tests — never post into production ASANPAY. */
const TEST_LEDGER_TENANT = "LEDGERTEST";
const FLOAT_CONTROL = "TREASURY_FLOAT_CONTROL";

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

/**
 * Ensure LEDGERTEST exists, is active (wallet.ledger requires active), and has system accounts.
 * verify:ledger leaves this tenant inactive — tests re-activate it deliberately.
 */
async function ensureLedgerTestTenant(): Promise<string> {
  process.env.LEDGER_TENANT_CODE = TEST_LEDGER_TENANT;
  clearTenantCache();
  clearAccountCache();

  const [existing] = await db.select().from(tenants).where(eq(tenants.code, TEST_LEDGER_TENANT)).limit(1);
  let tenantId: string;
  // is_active = false, always — same rule as verifyLedgerEngine.ts. bootstrapLedger() and the
  // reconciliation sweep in server.ts both iterate ACTIVE tenants, so an active LEDGERTEST
  // would put throwaway test accounts into production's boot verification and recon logs.
  // currentTenantId() deliberately does not require an env-overridden tenant to be active.
  if (existing) {
    tenantId = existing.id;
    if (existing.isActive) {
      await db.update(tenants).set({ isActive: false }).where(eq(tenants.id, tenantId));
    }
  } else {
    const [created] = await db
      .insert(tenants)
      .values({ code: TEST_LEDGER_TENANT, name: "Ledger Engine Test", isActive: false })
      .returning({ id: tenants.id });
    tenantId = created!.id;
  }

  await seedSystemAccounts(tenantId);
  clearTenantCache();
  clearAccountCache();
  return tenantId;
}

export async function createWorld(suffix: string): Promise<World> {
  const tenantId = await ensureLedgerTestTenant();
  if (legacyTenantCode() !== TEST_LEDGER_TENANT) {
    throw new Error(`Test world requires LEDGER_TENANT_CODE=${TEST_LEDGER_TENANT}`);
  }

  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  const adminId = admin!.id;
  const [aw] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, adminId), eq(wallets.walletType, "main")));
  const adminWalletId = aw!.id;
  // Admin is not a hierarchy wallet — aggregator mirror only. Direct write is intentional
  // for the system counterparty display row; agent funding always goes through setBalance.
  await db.update(wallets).set({ balance: SYSTEM_FLOAT }).where(eq(wallets.id, adminWalletId));

  const [dist] = await db
    .insert(users)
    .values({
      uid: `DS${suffix}`,
      role: "distributor",
      name: "W Dist",
      mobile: `71${suffix.slice(-8).padStart(8, "0")}`,
      passwordHash: "x",
      parentId: adminId,
      kycStatus: "verified",
    })
    .returning();
  const distId = dist!.id;
  const [dw] = await db
    .insert(wallets)
    .values({ userId: distId, walletType: "main", balance: "0" })
    .returning();
  const distMainWalletId = dw!.id;
  await db.insert(userHierarchy).values({ ancestorId: distId, descendantId: distId, depth: 0 });

  const [retailer] = await db
    .insert(users)
    .values({
      uid: `RT${suffix}`,
      role: "retailer",
      name: "W Retailer",
      mobile: `61${suffix.slice(-8).padStart(8, "0")}`,
      passwordHash: "x",
      parentId: distId,
      kycStatus: "verified",
    })
    .returning();
  const retailerId = retailer!.id;
  const [rMain] = await db
    .insert(wallets)
    .values({ userId: retailerId, walletType: "main", balance: "0" })
    .returning();
  const [rAeps] = await db
    .insert(wallets)
    .values({ userId: retailerId, walletType: "aeps", balance: "0" })
    .returning();
  await db.insert(userHierarchy).values([
    { ancestorId: retailerId, descendantId: retailerId, depth: 0 },
    { ancestorId: distId, descendantId: retailerId, depth: 1 },
    { ancestorId: adminId, descendantId: retailerId, depth: 2 },
  ]);

  // Ledger accounts must exist before setBalance journals for these agents.
  await db.transaction(async (tx) => {
    await ensureHierarchyAccount(tx, tenantId, distId);
    await ensureHierarchyAccount(tx, tenantId, retailerId);
  });

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
      .values({
        categoryId,
        code: `${code}_${suffix}`,
        name: code,
        maxAmount: opts?.maxAmount ?? "10000000.00",
      })
      .returning();
    await db
      .insert(providerServices)
      .values({ serviceId: svc!.id, providerId, providerServiceCode: "eko", isPrimary: true });
    serviceIds.push(svc!.id);
    return svc!.id;
  }

  /**
   * Set one wallet component (main → usable, aeps → settleable) via journals.
   * The other component is preserved. Zeroes with RECON_ADJUSTMENT, then
   * OPENING_BALANCE / OPENING_BALANCE_EARNED, then re-mirrors wallets.balance.
   */
  async function setBalance(walletId: string, amount: string) {
    process.env.LEDGER_TENANT_CODE = TEST_LEDGER_TENANT;
    clearTenantCache();

    await db.transaction(async (tx) => {
      const [w] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update");
      if (!w) throw new Error(`Wallet ${walletId} not found`);
      if (w.walletType !== "main" && w.walletType !== "aeps") {
        throw new Error(`setBalance only supports main/aeps, got ${w.walletType}`);
      }

      const code = await ensureHierarchyAccount(tx, tenantId, w.userId);
      const [ledger] = await tx
        .select({
          balance: accountBalances.balance,
          settleable: accountBalances.settleable,
        })
        .from(accounts)
        .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
        .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)))
        .limit(1);

      const currBalance = ledger?.balance ?? 0n;
      const currSettleable = ledger?.settleable ?? 0n;
      const currUsable = currBalance - currSettleable;

      const target = rupeesToPaise(amount);
      const desiredUsable = w.walletType === "main" ? target : currUsable;
      const desiredSettleable = w.walletType === "aeps" ? target : currSettleable;

      if (desiredUsable < 0n || desiredSettleable < 0n) {
        throw new Error("setBalance targets must be non-negative");
      }

      const runTag = randomUUID().slice(0, 12);

      if (currBalance > 0n) {
        await postJournal(tx, {
          tenantId,
          txnType: "RECON_ADJUSTMENT",
          idemKey: `TEST:SETBAL:ZERO:${walletId}:${runTag}`,
          performedBy: adminId,
          reason: `test setBalance zero before re-fund (${walletId})`,
          entries: [
            { code, dir: "DR", amount: currBalance },
            { code: FLOAT_CONTROL, dir: "CR", amount: currBalance },
          ],
        });
      }

      if (desiredUsable > 0n) {
        await postJournal(tx, {
          tenantId,
          txnType: "OPENING_BALANCE",
          idemKey: `TEST:SETBAL:OPEN:${walletId}:${runTag}`,
          performedBy: null,
          reason: `test setBalance usable ${amount}`,
          referenceId: w.userId,
          entries: [
            { code: FLOAT_CONTROL, dir: "DR", amount: desiredUsable },
            { code, dir: "CR", amount: desiredUsable },
          ],
        });
      }

      if (desiredSettleable > 0n) {
        await postJournal(tx, {
          tenantId,
          txnType: "OPENING_BALANCE_EARNED",
          idemKey: `TEST:SETBAL:EARNED:${walletId}:${runTag}`,
          performedBy: null,
          reason: `test setBalance settleable ${amount}`,
          referenceId: w.userId,
          entries: [
            { code: FLOAT_CONTROL, dir: "DR", amount: desiredSettleable },
            { code, dir: "CR", amount: desiredSettleable },
          ],
        });
      }

      await mirrorBalances(tx, tenantId, [w.userId], false);
    });
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
    process.env.LEDGER_TENANT_CODE = TEST_LEDGER_TENANT;
    clearTenantCache();
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
        routed.adapter.dmtTransfer({
          retailerUserId: retailerId,
          customerMobile: "9999999999",
          accountNumber: "000123456789",
          ifsc: "HDFC0000001",
          amount,
          mode: "imps",
          otp: "123456",
          referenceKey: `REF-${txnRef}`,
        }),
    });
  }

  async function runAeps(amount: string, idempotencyKey: string): Promise<TxnOutcome> {
    process.env.LEDGER_TENANT_CODE = TEST_LEDGER_TENANT;
    clearTenantCache();
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
        routed.adapter.aepsWithdraw({
          retailerUserId: retailerId,
          aadhaarNumber: "123456789012",
          bankIin: "SBI000",
          mobile: "9999999999",
          biometricPayload: "x",
          amount,
        }),
    });
  }

  /**
   * Cleanup strategy (post cut-over):
   * - Ledger is append-only; accounts.user_id is ON DELETE RESTRICT → cannot DELETE users
   *   once they have a hierarchy account (and we always create one).
   * - Soft-retire dist/retailer: free mobile/uid uniqueness, mark inactive.
   * - Zero their LEDGERTEST balances (RECON) so the scratch tenant does not accumulate
   *   open liability forever, then re-mirror.
   * - Drop service graph + transactional rows that are not protected.
   * - Leave the permanent ledger journals under LEDGERTEST (tenant isolation).
   */
  async function destroy() {
    process.env.LEDGER_TENANT_CODE = TEST_LEDGER_TENANT;
    clearTenantCache();

    for (const wid of [rMain!.id, rAeps!.id, distMainWalletId]) {
      await db.delete(walletLedgerEntries).where(eq(walletLedgerEntries.walletId, wid));
    }
    const txns = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.userId, retailerId));
    for (const t of txns) {
      await db.delete(commissionLedger).where(eq(commissionLedger.transactionId, t.id));
      const groups = await db
        .select({ id: walletLedgerGroups.id })
        .from(walletLedgerGroups)
        .where(eq(walletLedgerGroups.referenceId, t.id));
      for (const g of groups) {
        await db.delete(walletLedgerEntries).where(eq(walletLedgerEntries.groupId, g.id));
      }
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

    // Zero agent ledger liabilities under LEDGERTEST, then soft-retire users.
    await db.transaction(async (tx) => {
      for (const userId of [retailerId, distId]) {
        const [acc] = await tx
          .select({
            code: accounts.code,
            balance: accountBalances.balance,
          })
          .from(accounts)
          .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
          .where(and(eq(accounts.tenantId, tenantId), eq(accounts.userId, userId)))
          .limit(1);
        if (acc && acc.balance > 0n) {
          await postJournal(tx, {
            tenantId,
            txnType: "RECON_ADJUSTMENT",
            idemKey: `TEST:DESTROY:ZERO:${userId}:${randomUUID().slice(0, 12)}`,
            performedBy: adminId,
            reason: `test world destroy zero for ${userId}`,
            entries: [
              { code: acc.code, dir: "DR", amount: acc.balance },
              { code: FLOAT_CONTROL, dir: "CR", amount: acc.balance },
            ],
          });
        }
      }
      await mirrorBalances(tx, tenantId, [retailerId, distId], false);
    });

    const retired = `${suffix}`.slice(-6);
    await db
      .update(users)
      .set({
        isActive: false,
        mobile: `90${retired}${Date.now().toString().slice(-6)}`.slice(0, 10),
        uid: `X${retired}${randomUUID().slice(0, 6)}`.slice(0, 20),
        name: `[torn-down] W Retailer`,
      })
      .where(eq(users.id, retailerId));
    await db
      .update(users)
      .set({
        isActive: false,
        mobile: `91${retired}${Date.now().toString().slice(-6)}`.slice(0, 10),
        uid: `Y${retired}${randomUUID().slice(0, 6)}`.slice(0, 20),
        name: `[torn-down] W Dist`,
      })
      .where(eq(users.id, distId));

    // Soft-retired users keep wallets (cascade would only apply on hard delete).
    await db
      .update(wallets)
      .set({ balance: "0", holdBalance: "0" })
      .where(eq(wallets.userId, retailerId));
    await db
      .update(wallets)
      .set({ balance: "0", holdBalance: "0" })
      .where(eq(wallets.userId, distId));
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

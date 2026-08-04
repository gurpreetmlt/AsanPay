/**
 * End-to-end exercise of the wallet LEDGER SHIM (`modules/wallet/wallet.ledger.ts`) against
 * a real Postgres: hierarchy transfers, service debit/credit, reversal, fundWallet, commission,
 * the referenceType → txnType mapping, the `wallets.balance` mirror, and the legacy passbook
 * projection (`wallet_ledger_groups` / `wallet_ledger_entries`).
 *
 * SCOPE — this calls the real cut-over API. It does NOT replace `verify:ledger` (bare
 * `postJournal()` only). Together they cover engine + shim.
 *
 *   sudo docker exec $API sh -c 'cd /app/apps/backend && npm run verify:shim'
 *
 * Isolation: always `LEDGER_TENANT_CODE=LEDGERTEST` with `is_active = false`. Never ASANPAY.
 * Throwaway MD / Dist / Retailer users; soft-retired at end (accounts.user_id RESTRICT).
 *
 * `wallet_ledger_groups.reference_id` is UUID — every transfer referenceId must be a real UUID.
 * `fundWallet` is safe under LEDGERTEST: aggregator mirror only runs for the default ASANPAY tenant.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import {
  users,
  wallets,
  tenants,
  accounts,
  accountBalances,
  journals,
  ledgerEntries,
  walletLedgerGroups,
  walletLedgerEntries,
  userHierarchy,
  services,
  serviceCategories,
  providers,
  transactions,
  serviceCharges,
  commissionLedger,
} from "../src/db/postgres/schema";
import { postJournal, clearAccountCache } from "../src/core/ledger";
import { seedSystemAccounts } from "../src/modules/bootstrap/systemAccounts";
import { rupeesToPaise, paiseToRupees } from "../src/core/money";
import { ensureHierarchyAccount, floatAccountCode } from "../src/modules/wallet/ledgerAccounts";
import {
  clearTenantCache,
  fundWallet,
  legacyTenantCode,
  mirrorBalances,
  transferBetweenWallets,
} from "../src/modules/wallet/wallet.ledger";
import {
  checkLedgerVsBalance,
  checkTrialBalance,
  checkSettleable,
  checkNegativeAgentBalance,
} from "../src/modules/reconciliation/checks";
import { resolveCustomerFee } from "../src/modules/service-charges/serviceCharge.service";
import { HttpError } from "../src/utils/httpError";

const RUN = randomUUID().slice(0, 8);
const TENANT_CODE = "LEDGERTEST";
const FLOAT_CONTROL = "TREASURY_FLOAT_CONTROL";
const BBPS_CATEGORY = "BILL_PAYMENT_BBPS";
const COMMISSION_INCOME = "COMMISSION_INCOME";
const COMPANY = "COMPANY_001";
/** Fixed harness catalog codes — reused across runs; never active; never product tiles. */
const SHIM_BANK = "SHIM_BANK";
const SHIM_OTH = "SHIM_OTH";
const SHIM_UNMAPPED = "SHIM_UNMAPPED";

// Set before any money path resolves the tenant.
process.env.LEDGER_TENANT_CODE = TENANT_CODE;

let tenantId: string;
let adminId: string;
let aggregatorWalletId: string;
/** Transaction ids created this run — scrubbed at end (FK order 1–4). Catalog stays. */
const runTxnIds: string[] = [];

let mdId: string;
let distId: string;
let retId: string;

let mdMainId: string;
let distMainId: string;
let retMainId: string;
let retAepsId: string;

let mdCode: string;
let distCode: string;
let retCode: string;

let providerId: string;
let providerCode: string;
let floatCode: string;

let passed = 0;
let failed = 0;
let mobileSeq = 0;
let uidSerialSeq = 0;

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

async function expectHttpCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HttpError && err.code === code) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(code)) return;
    throw new Error(`expected HttpError ${code}, got: ${msg}`, { cause: err });
  }
  throw new Error(`expected HttpError ${code}, but call succeeded`);
}

function nextMobile(): string {
  mobileSeq += 1;
  return `9${String(Date.now()).slice(-6)}${String(mobileSeq).padStart(3, "0")}`.slice(0, 10);
}

async function ledgerOf(
  userId: string,
): Promise<{ code: string; balance: bigint; settleable: bigint }> {
  const [row] = await db
    .select({
      code: accounts.code,
      balance: accountBalances.balance,
      settleable: accountBalances.settleable,
    })
    .from(accounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.userId, userId)))
    .limit(1);
  if (!row) throw new Error(`No LEDGERTEST account for user ${userId}`);
  return row;
}

async function walletBalance(walletId: string): Promise<string> {
  const [w] = await db
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(eq(wallets.id, walletId));
  if (!w) throw new Error(`Wallet ${walletId} missing`);
  return w.balance;
}

/** Assert wallets.balance mirror matches ledger for this agent. */
async function assertMirror(userId: string, label: string): Promise<void> {
  const ledger = await ledgerOf(userId);
  const rows = await db
    .select({ walletType: wallets.walletType, balance: wallets.balance })
    .from(wallets)
    .where(eq(wallets.userId, userId));

  const main = rows.find((r) => r.walletType === "main");
  if (!main) throw new Error(`${label}: missing main wallet`);
  expectEq(main.balance, paiseToRupees(ledger.balance - ledger.settleable), `${label} main mirror`);

  const aeps = rows.find((r) => r.walletType === "aeps");
  if (aeps) {
    expectEq(aeps.balance, paiseToRupees(ledger.settleable), `${label} aeps mirror`);
  }
}

async function journalByLegacyGroup(groupId: string): Promise<{ id: bigint; txnType: string }> {
  const [j] = await db
    .select({ id: journals.id, txnType: journals.txnType })
    .from(journals)
    .where(and(eq(journals.tenantId, tenantId), eq(journals.idemKey, `LEGACY:${groupId}`)))
    .limit(1);
  if (!j) throw new Error(`No journal for LEGACY:${groupId}`);
  return j;
}

async function journalByIdemKey(
  idemKey: string,
): Promise<{ id: bigint; txnType: string; reversesId: bigint | null }> {
  const [j] = await db
    .select({ id: journals.id, txnType: journals.txnType, reversesId: journals.reversesId })
    .from(journals)
    .where(and(eq(journals.tenantId, tenantId), eq(journals.idemKey, idemKey)))
    .limit(1);
  if (!j) throw new Error(`No journal for idemKey ${idemKey}`);
  return j;
}

async function journalHasFloatCredit(journalId: bigint, expectedFloatCode: string): Promise<void> {
  const rows = await db
    .select({
      code: accounts.code,
      direction: ledgerEntries.direction,
    })
    .from(ledgerEntries)
    .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
    .where(eq(ledgerEntries.journalId, journalId));
  const floatLeg = rows.find((r) => r.code === expectedFloatCode && r.direction === "CR");
  if (!floatLeg) {
    throw new Error(
      `journal ${journalId}: expected CR on ${expectedFloatCode}, legs=${JSON.stringify(rows)}`,
    );
  }
}

async function assertPassbook(groupId: string, minRows = 1): Promise<void> {
  const [group] = await db
    .select({ id: walletLedgerGroups.id })
    .from(walletLedgerGroups)
    .where(eq(walletLedgerGroups.id, groupId))
    .limit(1);
  if (!group) throw new Error(`Passbook group ${groupId} missing`);

  const entries = await db
    .select()
    .from(walletLedgerEntries)
    .where(eq(walletLedgerEntries.groupId, groupId));
  if (entries.length < minRows) {
    throw new Error(
      `Passbook group ${groupId}: expected ≥${minRows} entries, got ${entries.length}`,
    );
  }
}

async function openUsable(
  userId: string,
  accountCode: string,
  rupees: string,
  tag: string,
): Promise<void> {
  const amount = rupeesToPaise(rupees);
  if (amount <= 0n) return;
  await db.transaction(async (tx) => {
    await postJournal(tx, {
      tenantId,
      txnType: "OPENING_BALANCE",
      idemKey: `SHIM:${RUN}:${tag}:OPEN`,
      performedBy: null,
      reason: `verify:shim opening usable ${tag}`,
      referenceId: userId,
      entries: [
        { code: FLOAT_CONTROL, dir: "DR", amount },
        { code: accountCode, dir: "CR", amount },
      ],
    });
    await mirrorBalances(tx, tenantId, [userId], false);
  });
}

async function openEarned(
  userId: string,
  accountCode: string,
  rupees: string,
  tag: string,
): Promise<void> {
  const amount = rupeesToPaise(rupees);
  if (amount <= 0n) return;
  await db.transaction(async (tx) => {
    await postJournal(tx, {
      tenantId,
      txnType: "OPENING_BALANCE_EARNED",
      idemKey: `SHIM:${RUN}:${tag}:EARNED`,
      performedBy: null,
      reason: `verify:shim opening earned ${tag}`,
      referenceId: userId,
      entries: [
        { code: FLOAT_CONTROL, dir: "DR", amount },
        { code: accountCode, dir: "CR", amount },
      ],
    });
    await mirrorBalances(tx, tenantId, [userId], false);
  });
}

async function ensureLedgerTestTenant(): Promise<string> {
  process.env.LEDGER_TENANT_CODE = TENANT_CODE;
  clearTenantCache();
  clearAccountCache();

  const [existing] = await db.select().from(tenants).where(eq(tenants.code, TENANT_CODE)).limit(1);
  let id: string;
  if (existing) {
    id = existing.id;
    if (existing.isActive) {
      await db.update(tenants).set({ isActive: false }).where(eq(tenants.id, id));
      console.log("Marked LEDGERTEST inactive (must stay false).");
    }
  } else {
    const [created] = await db
      .insert(tenants)
      .values({ code: TENANT_CODE, name: "Ledger Engine Test", isActive: false })
      .returning({ id: tenants.id });
    id = created!.id;
  }

  await seedSystemAccounts(id);
  clearTenantCache();
  clearAccountCache();
  return id;
}

/**
 * Product UID scheme:
 *   ASNC###### → Company (system)
 *   ASNS###### → Super Distributor
 *   ASND###### → Distributor
 *   ASNR###### → Retailer
 * Throwaway verify runs use a high serial band derived from RUN so seed 000001-row users stay free.
 */
function asnUid(role: "S" | "D" | "R"): string {
  uidSerialSeq += 1;
  const base = Number.parseInt(RUN.replace(/\D/g, "").slice(0, 5) || "1", 10) % 9000;
  const serial = 900000 + base * 10 + uidSerialSeq;
  return `ASN${role}${String(serial).padStart(6, "0")}`.slice(0, 20);
}

async function createAgent(
  role: "super_distributor" | "distributor" | "retailer",
  parentId: string | null,
  name: string,
  uidRole: "S" | "D" | "R",
  extraAncestors: string[] = [],
): Promise<{ userId: string; mainId: string; aepsId: string; code: string }> {
  const uid = asnUid(uidRole);
  const mobile = nextMobile();

  const [u] = await db
    .insert(users)
    .values({
      uid,
      role,
      name,
      mobile,
      passwordHash: "shim-verify-no-login",
      parentId,
      kycStatus: "verified",
      isActive: true,
    })
    .returning({ id: users.id });

  const userId = u!.id;
  const [main] = await db
    .insert(wallets)
    .values({ userId, walletType: "main", balance: "0" })
    .returning({ id: wallets.id });

  let aepsId = "";
  if (role === "retailer") {
    const [aeps] = await db
      .insert(wallets)
      .values({ userId, walletType: "aeps", balance: "0" })
      .returning({ id: wallets.id });
    aepsId = aeps!.id;
  }

  const hierarchy: { ancestorId: string; descendantId: string; depth: number }[] = [
    { ancestorId: userId, descendantId: userId, depth: 0 },
  ];
  if (parentId) {
    hierarchy.push({ ancestorId: parentId, descendantId: userId, depth: 1 });
  }
  for (let i = 0; i < extraAncestors.length; i++) {
    hierarchy.push({
      ancestorId: extraAncestors[i]!,
      descendantId: userId,
      depth: i + 2,
    });
  }
  await db.insert(userHierarchy).values(hierarchy);

  const code = await db.transaction((tx) => ensureHierarchyAccount(tx, tenantId, userId));
  return { userId, mainId: main!.id, aepsId, code };
}

async function softRetire(userId: string, tag: string): Promise<void> {
  await db
    .update(users)
    .set({
      isActive: false,
      mobile: nextMobile(),
      uid: `X${tag}${RUN}${randomUUID().slice(0, 4)}`.slice(0, 20),
      name: `[shim-done] ${tag}`,
    })
    .where(eq(users.id, userId));
}

async function zeroAgent(userId: string): Promise<void> {
  const led = await ledgerOf(userId);
  if (led.balance <= 0n) return;
  await db.transaction(async (tx) => {
    await postJournal(tx, {
      tenantId,
      txnType: "RECON_ADJUSTMENT",
      idemKey: `SHIM:${RUN}:ZERO:${userId}`,
      performedBy: adminId,
      reason: "verify:shim cleanup zero",
      entries: [
        { code: led.code, dir: "DR", amount: led.balance },
        { code: FLOAT_CONTROL, dir: "CR", amount: led.balance },
      ],
    });
    await mirrorBalances(tx, tenantId, [userId], false);
  });
}

async function ensureCategory(code: string, name: string, isActive = true): Promise<string> {
  const [existing] = await db
    .select({ id: serviceCategories.id, isActive: serviceCategories.isActive })
    .from(serviceCategories)
    .where(eq(serviceCategories.code, code))
    .limit(1);
  if (existing) {
    if (existing.isActive !== isActive) {
      await db
        .update(serviceCategories)
        .set({ isActive })
        .where(eq(serviceCategories.id, existing.id));
    }
    return existing.id;
  }
  await db.insert(serviceCategories).values({ code, name, isActive }).onConflictDoNothing();
  const [row] = await db
    .select({ id: serviceCategories.id })
    .from(serviceCategories)
    .where(eq(serviceCategories.code, code))
    .limit(1);
  if (!row) throw new Error(`category ${code} missing after ensure`);
  return row.id;
}

/** Prefer existing global catalogue rows; SERVICE_TXN_TYPE keys are exact service codes. */
async function ensureService(
  code: string,
  name: string,
  categoryId: string,
  opts?: { isActive?: boolean },
): Promise<string> {
  const wantActive = opts?.isActive ?? true;
  const [existing] = await db
    .select({ id: services.id, isActive: services.isActive })
    .from(services)
    .where(eq(services.code, code))
    .limit(1);
  if (existing) {
    if (existing.isActive !== wantActive) {
      await db.update(services).set({ isActive: wantActive }).where(eq(services.id, existing.id));
    }
    return existing.id;
  }
  await db
    .insert(services)
    .values({
      categoryId,
      code,
      name,
      maxAmount: "10000000.00",
      isActive: wantActive,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.code, code))
    .limit(1);
  if (!row) throw new Error(`service ${code} missing after ensure`);
  return row.id;
}

async function insertTxn(params: {
  serviceId: string;
  providerId: string | null;
  amount: string;
  customerFee?: string;
  tag: string;
}): Promise<string> {
  const id = randomUUID();
  await db.insert(transactions).values({
    id,
    txnRef: `SHIM${RUN}${params.tag}`.slice(0, 40),
    idempotencyKey: `shim-${RUN}-${params.tag}-${id.slice(0, 8)}`.slice(0, 100),
    userId: retId,
    serviceId: params.serviceId,
    providerId: params.providerId,
    amount: params.amount,
    customerFee: params.customerFee ?? "0",
    status: "success",
    walletType: "main",
  });
  runTxnIds.push(id);
  return id;
}

/**
 * Drop this run's service transactions + wallet passbook projection (FK order 1–4).
 * Never touches journals / ledger_entries / accounts / fixed SHIM catalog rows.
 */
async function scrubRunTransactionsAndPassbook(): Promise<void> {
  if (runTxnIds.length === 0) return;

  await db.transaction(async (tx) => {
    const groups = await tx
      .select({ id: walletLedgerGroups.id })
      .from(walletLedgerGroups)
      .where(inArray(walletLedgerGroups.referenceId, runTxnIds));
    const groupIds = groups.map((g) => g.id);

    if (groupIds.length > 0) {
      await tx
        .delete(walletLedgerEntries)
        .where(inArray(walletLedgerEntries.groupId, groupIds));
      await tx.delete(walletLedgerGroups).where(inArray(walletLedgerGroups.id, groupIds));
    }

    await tx
      .delete(commissionLedger)
      .where(inArray(commissionLedger.transactionId, runTxnIds));
    await tx.delete(transactions).where(inArray(transactions.id, runTxnIds));
  });

  console.log(
    `Scrubbed ${runTxnIds.length} run transaction(s) + passbook projection (catalog kept).`,
  );
  runTxnIds.length = 0;
}

async function seedServiceCatalog(): Promise<void> {
  providerCode = `SHIM${RUN}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 40);
  floatCode = floatAccountCode(providerCode);

  const [prov] = await db
    .insert(providers)
    .values({ code: providerCode, name: `Shim provider ${RUN}` })
    .returning({ id: providers.id });
  providerId = prov!.id;

  // Fixed inactive harness categories (no RUN suffix — reuse every verify:shim).
  const bankingCat = await ensureCategory(SHIM_BANK, "Shim banking", false);
  await ensureCategory(SHIM_OTH, "Shim other", false);
  const bbpsCat = await ensureCategory(BBPS_CATEGORY, "BBPS");

  // Product service codes when missing; attach only at create time. Existing rows untouched.
  await ensureService("MONEY_TRANSFER", "Money Transfer", bankingCat);
  await ensureService("DTH", "DTH", bankingCat);
  await ensureService("CASH_DEPOSIT", "Cash Deposit", bankingCat);
  await ensureService("CASH_WITHDRAW", "Cash Withdraw", bankingCat);
  await ensureService("ELECTRICITY", "Electricity Bill", bbpsCat);

  // Fixed inactive stub for SERVICE_NOT_MAPPED (exact code; agent catalog filter).
  await ensureService(SHIM_UNMAPPED, "Shim unmapped service", bankingCat, { isActive: false });
}

async function main() {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`WALLET SHIM VERIFICATION — run ${RUN}`);
  console.log("=".repeat(72));

  if (legacyTenantCode() !== TENANT_CODE) {
    throw new Error(`LEDGER_TENANT_CODE must be ${TENANT_CODE}, got ${legacyTenantCode()}`);
  }

  tenantId = await ensureLedgerTestTenant();
  console.log(`Tenant: ${TENANT_CODE} (${tenantId}) is_active=false\n`);

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  if (!admin) throw new Error("No admin user for RECON performedBy");
  adminId = admin.id;

  const [agg] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.walletKind, "aggregator"), eq(wallets.walletType, "main")))
    .limit(1);
  if (!agg) throw new Error("No aggregator wallet — seed admin/system float first");
  aggregatorWalletId = agg.id;

  await seedServiceCatalog();

  const md = await createAgent("super_distributor", null, "Shim MD", "S");
  mdId = md.userId;
  mdMainId = md.mainId;
  mdCode = md.code;

  const dist = await createAgent("distributor", mdId, "Shim Dist", "D");
  distId = dist.userId;
  distMainId = dist.mainId;
  distCode = dist.code;

  const ret = await createAgent("retailer", distId, "Shim Retailer", "R", [mdId]);
  retId = ret.userId;
  retMainId = ret.mainId;
  retAepsId = ret.aepsId;
  retCode = ret.code;

  await openUsable(mdId, mdCode, "100000.00", "md");
  await assertMirror(mdId, "md after open");

  // ── Hierarchy / passbook (baseline) ──────────────────────────────────────

  await check(
    'transferBetweenWallets downline_transfer → WALLET_TRANSFER (MD→Dist)',
    async () => {
      const { groupId } = await transferBetweenWallets({
        fromWalletId: mdMainId,
        toWalletId: distMainId,
        amount: "25000.00",
        referenceType: "downline_transfer",
        referenceId: randomUUID(),
        description: "verify:shim MD to Dist",
      });
      const j = await journalByLegacyGroup(groupId);
      expectEq(j.txnType, "WALLET_TRANSFER", "txnType");
      await assertPassbook(groupId, 2);
      await assertMirror(mdId, "md after transfer");
      await assertMirror(distId, "dist after transfer");
      expectEq(await walletBalance(distMainId), "25000.00", "dist main after transfer");
      expectEq(await walletBalance(mdMainId), "75000.00", "md main after transfer");
    },
  );

  await check(
    'transferBetweenWallets downline_transfer → WALLET_TRANSFER (Dist→Retailer)',
    async () => {
      const { groupId } = await transferBetweenWallets({
        fromWalletId: distMainId,
        toWalletId: retMainId,
        amount: "10000.00",
        referenceType: "downline_transfer",
        referenceId: randomUUID(),
        description: "verify:shim Dist to Retailer",
      });
      const j = await journalByLegacyGroup(groupId);
      expectEq(j.txnType, "WALLET_TRANSFER", "txnType");
      await assertPassbook(groupId, 2);
      await assertMirror(distId, "dist");
      await assertMirror(retId, "retailer");
      expectEq(await walletBalance(retMainId), "10000.00", "retailer main");
    },
  );

  await check("OPENING_BALANCE_EARNED raises aeps mirror only (settleable)", async () => {
    await openEarned(retId, retCode, "500.00", "ret-earn");
    await assertMirror(retId, "ret after earned");
    expectEq(await walletBalance(retAepsId), "500.00", "aeps = settleable");
    expectEq(await walletBalance(retMainId), "10000.00", "main usable unchanged");
  });

  await check("upline_pull → UPLINE_PULL does not take settleable earnings", async () => {
    const { groupId } = await transferBetweenWallets({
      fromWalletId: retMainId,
      toWalletId: distMainId,
      amount: "2000.00",
      referenceType: "upline_pull",
      referenceId: randomUUID(),
      description: "verify:shim upline pull",
    });
    const j = await journalByLegacyGroup(groupId);
    expectEq(j.txnType, "UPLINE_PULL", "txnType");
    await assertPassbook(groupId, 1);
    await assertMirror(retId, "ret after pull");
    await assertMirror(distId, "dist after pull");
    expectEq(await walletBalance(retAepsId), "500.00", "earned untouched");
    expectEq(await walletBalance(retMainId), "8000.00", "usable after pull");
  });

  await check("funding child aeps wallet lands in usable (advance, not earned)", async () => {
    const beforeSettle = (await ledgerOf(retId)).settleable;
    const beforeMain = await walletBalance(retMainId);
    const { groupId } = await transferBetweenWallets({
      fromWalletId: distMainId,
      toWalletId: retAepsId,
      amount: "300.00",
      referenceType: "downline_transfer",
      referenceId: randomUUID(),
      description: "verify:shim fund via aeps wallet row",
    });
    const j = await journalByLegacyGroup(groupId);
    expectEq(j.txnType, "WALLET_TRANSFER", "txnType");
    await assertMirror(retId, "ret after aeps-path fund");
    expectEq((await ledgerOf(retId)).settleable, beforeSettle, "settleable unchanged");
    expectEq(await walletBalance(retAepsId), "500.00", "aeps still only settleable");
    expectEq(
      await walletBalance(retMainId),
      paiseToRupees(rupeesToPaise(beforeMain) + rupeesToPaise("300")),
      "main usable +300",
    );
  });

  await check("second downline_transfer keeps passbook balance_after aligned with mirrors", async () => {
    const beforeDist = await walletBalance(distMainId);
    const { groupId } = await transferBetweenWallets({
      fromWalletId: distMainId,
      toWalletId: retMainId,
      amount: "100.00",
      referenceType: "downline_transfer",
      referenceId: randomUUID(),
      description: "verify:shim small transfer passbook",
    });
    const j = await journalByLegacyGroup(groupId);
    expectEq(j.txnType, "WALLET_TRANSFER", "txnType");

    const entries = await db
      .select()
      .from(walletLedgerEntries)
      .where(eq(walletLedgerEntries.groupId, groupId));
    for (const e of entries) {
      const live = await walletBalance(e.walletId);
      expectEq(e.balanceAfter, live, `passbook balance_after matches live for ${e.walletId}`);
    }
    await assertMirror(distId, "dist after align transfer");
    await assertMirror(retId, "ret after align transfer");
    expectEq(
      await walletBalance(distMainId),
      paiseToRupees(rupeesToPaise(beforeDist) - rupeesToPaise("100")),
      "dist main -100",
    );
  });

  // ── service_txn DEBIT mapping (core) ─────────────────────────────────────

  const debitCases: { serviceCode: string; expectedTxn: string; amount: string; tag: string }[] = [
    { serviceCode: "MONEY_TRANSFER", expectedTxn: "DMT", amount: "50.00", tag: "dmt" },
    { serviceCode: "DTH", expectedTxn: "RECHARGE", amount: "40.00", tag: "dth" },
    { serviceCode: "ELECTRICITY", expectedTxn: "BBPS", amount: "30.00", tag: "elc" },
    { serviceCode: "CASH_DEPOSIT", expectedTxn: "AEPS_DEPOSIT", amount: "20.00", tag: "dep" },
  ];

  for (const c of debitCases) {
    await check(
      `service_txn DEBIT ${c.serviceCode} → ${c.expectedTxn} + float ${floatCode}`,
      async () => {
        const [svc] = await db
          .select({ id: services.id })
          .from(services)
          .where(eq(services.code, c.serviceCode))
          .limit(1);
        if (!svc) throw new Error(`service ${c.serviceCode} missing`);

        const beforeMain = await walletBalance(retMainId);
        const beforeSettle = (await ledgerOf(retId)).settleable;
        const txnId = await insertTxn({
          serviceId: svc.id,
          providerId,
          amount: c.amount,
          tag: c.tag,
        });

        const { groupId } = await transferBetweenWallets({
          fromWalletId: retMainId,
          toWalletId: aggregatorWalletId,
          amount: c.amount,
          referenceType: "service_txn",
          referenceId: txnId,
          description: `verify:shim debit ${c.serviceCode}`,
        });

        const j = await journalByIdemKey(`TXN_DR:${txnId}`);
        expectEq(j.txnType, c.expectedTxn, "txnType");
        await journalHasFloatCredit(j.id, floatCode);
        await assertPassbook(groupId, 1);
        await assertMirror(retId, `ret after ${c.serviceCode} debit`);
        expectEq(
          await walletBalance(retMainId),
          paiseToRupees(rupeesToPaise(beforeMain) - rupeesToPaise(c.amount)),
          "main after debit",
        );
        expectEq((await ledgerOf(retId)).settleable, beforeSettle, "settleable unchanged on debit");
      },
    );
  }

  await check("service_txn DEBIT with customer_fee → three legs (FLOAT + COMMISSION_INCOME)", async () => {
    const [svc] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.code, "MONEY_TRANSFER"))
      .limit(1);
    const principal = "100.00";
    const fee = "15.00";
    const total = paiseToRupees(rupeesToPaise(principal) + rupeesToPaise(fee));
    const beforeMain = await walletBalance(retMainId);
    const incomeBefore = (
      await db
        .select({ balance: accountBalances.balance })
        .from(accounts)
        .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
        .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, COMMISSION_INCOME)))
        .limit(1)
    )[0]?.balance;
    if (incomeBefore === undefined) throw new Error("COMMISSION_INCOME missing");

    const txnId = await insertTxn({
      serviceId: svc!.id,
      providerId,
      amount: principal,
      customerFee: fee,
      tag: "fee3",
    });

    const { groupId } = await transferBetweenWallets({
      fromWalletId: retMainId,
      toWalletId: aggregatorWalletId,
      amount: total,
      referenceType: "service_txn",
      referenceId: txnId,
      description: "verify:shim debit with fee",
    });

    const j = await journalByIdemKey(`TXN_DR:${txnId}`);
    expectEq(j.txnType, "DMT", "txnType");
    const legs = await db
      .select({
        code: accounts.code,
        direction: ledgerEntries.direction,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
      .where(eq(ledgerEntries.journalId, j.id));

    const floatLeg = legs.find((l) => l.code === floatCode && l.direction === "CR");
    const incomeLeg = legs.find((l) => l.code === COMMISSION_INCOME && l.direction === "CR");
    const agentDr = legs.find((l) => l.direction === "DR");
    if (!floatLeg || !incomeLeg || !agentDr) {
      throw new Error(`three-leg expected, got ${JSON.stringify(legs)}`);
    }
    expectEq(floatLeg.amount, rupeesToPaise(principal), "float CR = principal");
    expectEq(incomeLeg.amount, rupeesToPaise(fee), "income CR = fee");
    expectEq(agentDr.amount, rupeesToPaise(total), "agent DR = principal+fee");

    await assertPassbook(groupId, 1);
    await assertMirror(retId, "ret after fee debit");
    expectEq(
      await walletBalance(retMainId),
      paiseToRupees(rupeesToPaise(beforeMain) - rupeesToPaise(total)),
      "main -principal-fee",
    );

    const incomeAfter = (
      await db
        .select({ balance: accountBalances.balance })
        .from(accounts)
        .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
        .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, COMMISSION_INCOME)))
        .limit(1)
    )[0]!.balance;
    expectEq(incomeAfter - incomeBefore, rupeesToPaise(fee), "COMMISSION_INCOME +fee");
  });

  await check("resolveCustomerFee reads service_charges (flat) under LEDGERTEST", async () => {
    const [svc] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.code, "MONEY_TRANSFER"))
      .limit(1);
    if (!svc) throw new Error("MONEY_TRANSFER missing");

    // Clean prior shim fee rows for this service under LEDGERTEST.
    await db
      .delete(serviceCharges)
      .where(and(eq(serviceCharges.tenantId, tenantId), eq(serviceCharges.serviceId, svc.id)));

    await db.insert(serviceCharges).values({
      tenantId,
      serviceId: svc.id,
      providerId: null,
      role: "retailer",
      ruleType: "flat",
      value: "12.50",
      minAmount: null,
      maxAmount: null,
      isActive: true,
    });

    const fee = await resolveCustomerFee(svc.id, providerId, "retailer", "1000.00", new Date());
    expectEq(fee, "12.50", "flat service charge");

    const none = await resolveCustomerFee(svc.id, providerId, "distributor", "1000.00", new Date());
    // role-specific retailer rule should not apply to distributor when role is set
    expectEq(none, "0.00", "no matching role → 0");

    await db
      .delete(serviceCharges)
      .where(and(eq(serviceCharges.tenantId, tenantId), eq(serviceCharges.serviceId, svc.id)));
  });

  await check("service_txn DEBIT with null provider → TXN_HAS_NO_PROVIDER", async () => {
    const [svc] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.code, "MONEY_TRANSFER"))
      .limit(1);
    const txnId = await insertTxn({
      serviceId: svc!.id,
      providerId: null,
      amount: "10.00",
      tag: "noprov",
    });
    await expectHttpCode(
      () =>
        transferBetweenWallets({
          fromWalletId: retMainId,
          toWalletId: aggregatorWalletId,
          amount: "10.00",
          referenceType: "service_txn",
          referenceId: txnId,
        }),
      "TXN_HAS_NO_PROVIDER",
    );
    await assertMirror(retId, "ret after null-provider refuse");
  });

  await check("service_txn DEBIT unknown code → SERVICE_NOT_MAPPED", async () => {
    const [svc] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.code, SHIM_UNMAPPED))
      .limit(1);
    if (!svc) throw new Error(`${SHIM_UNMAPPED} missing (seed inactive stub)`);
    const txnId = await insertTxn({
      serviceId: svc.id,
      providerId,
      amount: "10.00",
      tag: "nmap",
    });
    await expectHttpCode(
      () =>
        transferBetweenWallets({
          fromWalletId: retMainId,
          toWalletId: aggregatorWalletId,
          amount: "10.00",
          referenceType: "service_txn",
          referenceId: txnId,
        }),
      "SERVICE_NOT_MAPPED",
    );
    await assertMirror(retId, "ret after not-mapped refuse");
  });

  // ── service_txn CREDIT (AePS) ────────────────────────────────────────────

  await check("service_txn CREDIT CASH_WITHDRAW → AEPS_WITHDRAWAL raises settleable", async () => {
    const [svc] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.code, "CASH_WITHDRAW"))
      .limit(1);
    const beforeMain = await walletBalance(retMainId);
    const beforeAeps = await walletBalance(retAepsId);
    const beforeSettle = (await ledgerOf(retId)).settleable;
    const amount = "75.00";
    const txnId = await insertTxn({
      serviceId: svc!.id,
      providerId,
      amount,
      tag: "aeps",
    });

    const { groupId } = await transferBetweenWallets({
      fromWalletId: aggregatorWalletId,
      toWalletId: retMainId,
      amount,
      referenceType: "service_txn",
      referenceId: txnId,
      description: "verify:shim AePS credit",
    });

    const j = await journalByIdemKey(`TXN_CR:${txnId}`);
    expectEq(j.txnType, "AEPS_WITHDRAWAL", "txnType");
    await assertPassbook(groupId, 1);
    await assertMirror(retId, "ret after AePS credit");
    expectEq(await walletBalance(retMainId), beforeMain, "main unchanged");
    expectEq(
      await walletBalance(retAepsId),
      paiseToRupees(rupeesToPaise(beforeAeps) + rupeesToPaise(amount)),
      "aeps mirror +credit",
    );
    expectEq(
      (await ledgerOf(retId)).settleable - beforeSettle,
      rupeesToPaise(amount),
      "settleable delta",
    );
  });

  // ── reversal ─────────────────────────────────────────────────────────────

  await check("reversal of service_txn debit restores retailer + reverses_id set", async () => {
    const [svc] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.code, "MONEY_TRANSFER"))
      .limit(1);
    const amount = "33.00";
    const txnId = await insertTxn({
      serviceId: svc!.id,
      providerId,
      amount,
      tag: "revd",
    });

    await transferBetweenWallets({
      fromWalletId: retMainId,
      toWalletId: aggregatorWalletId,
      amount,
      referenceType: "service_txn",
      referenceId: txnId,
      description: "verify:shim debit to reverse",
    });
    const before = await ledgerOf(retId);
    const beforeMain = await walletBalance(retMainId);
    const original = await journalByIdemKey(`TXN_DR:${txnId}`);

    const { groupId } = await transferBetweenWallets({
      fromWalletId: aggregatorWalletId,
      toWalletId: retMainId,
      amount,
      referenceType: "reversal",
      referenceId: txnId,
      description: "verify:shim reversal",
    });

    const rev = await journalByIdemKey(`TXN_RV:${txnId}`);
    expectEq(rev.txnType, "REVERSAL", "reversal type");
    expectEq(rev.reversesId, original.id, "reverses_id");
    await assertPassbook(groupId, 1);
    await assertMirror(retId, "ret after reversal");
    expectEq(
      await walletBalance(retMainId),
      paiseToRupees(rupeesToPaise(beforeMain) + rupeesToPaise(amount)),
      "main restored +amount",
    );
    expectEq((await ledgerOf(retId)).settleable, before.settleable, "settleable after reverse");
  });

  await check("reversal with no original journal → LEGACY_REVERSAL_UNMAPPED", async () => {
    const fakeTxnId = randomUUID();
    await expectHttpCode(
      () =>
        transferBetweenWallets({
          fromWalletId: aggregatorWalletId,
          toWalletId: retMainId,
          amount: "1.00",
          referenceType: "reversal",
          referenceId: fakeTxnId,
        }),
      "LEGACY_REVERSAL_UNMAPPED",
    );
    await assertMirror(retId, "ret after unmapped reversal refuse");
  });

  // ── fundWallet ───────────────────────────────────────────────────────────

  await check("fundWallet → ALLOCATION then WALLET_TRANSFER; agent mirror rises", async () => {
    const before = await ledgerOf(distId);
    const beforeMain = await walletBalance(distMainId);
    const amount = "1000.00";
    const { groupId } = await fundWallet({
      walletId: distMainId,
      amount,
      referenceId: randomUUID(),
      description: "verify:shim fundWallet",
    });

    const [alloc] = await db
      .select({ txnType: journals.txnType })
      .from(journals)
      .where(and(eq(journals.tenantId, tenantId), eq(journals.idemKey, `LEGACY:${groupId}:ALLOC`)))
      .limit(1);
    const [fund] = await db
      .select({ txnType: journals.txnType })
      .from(journals)
      .where(and(eq(journals.tenantId, tenantId), eq(journals.idemKey, `LEGACY:${groupId}:FUND`)))
      .limit(1);
    if (!alloc) throw new Error("ALLOC journal missing");
    if (!fund) throw new Error("FUND journal missing");
    expectEq(alloc.txnType, "ALLOCATION", "alloc type");
    expectEq(fund.txnType, "WALLET_TRANSFER", "fund type");

    // ALLOC legs float control → company
    const allocJ = await journalByIdemKey(`LEGACY:${groupId}:ALLOC`);
    const legs = await db
      .select({ code: accounts.code, direction: ledgerEntries.direction })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
      .where(eq(ledgerEntries.journalId, allocJ.id));
    if (!legs.some((l) => l.code === FLOAT_CONTROL && l.direction === "DR")) {
      throw new Error("ALLOC missing FLOAT_CONTROL DR");
    }
    if (!legs.some((l) => l.code === COMPANY && l.direction === "CR")) {
      throw new Error("ALLOC missing COMPANY CR");
    }

    await assertPassbook(groupId, 1);
    await assertMirror(distId, "dist after fundWallet");
    expectEq(
      (await ledgerOf(distId)).balance - before.balance,
      rupeesToPaise(amount),
      "dist balance +fund",
    );
    expectEq(
      await walletBalance(distMainId),
      paiseToRupees(rupeesToPaise(beforeMain) + rupeesToPaise(amount)),
      "dist main +fund",
    );
  });

  // ── commission ───────────────────────────────────────────────────────────

  await check("commission → COMMISSION_PAYOUT raises settleable (earned)", async () => {
    const beforeSettle = (await ledgerOf(retId)).settleable;
    const beforeMain = await walletBalance(retMainId);
    const beforeAeps = await walletBalance(retAepsId);
    const amount = "15.00";
    const ref = randomUUID();

    const { groupId } = await transferBetweenWallets({
      fromWalletId: aggregatorWalletId,
      toWalletId: retMainId,
      amount,
      referenceType: "commission",
      referenceId: ref,
      description: "verify:shim commission",
    });

    const [j] = await db
      .select({ id: journals.id, txnType: journals.txnType })
      .from(journals)
      .where(
        and(
          eq(journals.tenantId, tenantId),
          eq(journals.txnType, "COMMISSION_PAYOUT"),
          eq(journals.idemKey, `COMM:${ref}:${retCode}`),
        ),
      )
      .limit(1);
    if (!j) throw new Error("COMMISSION_PAYOUT journal missing");
    expectEq(j.txnType, "COMMISSION_PAYOUT", "txnType");

    const legs = await db
      .select({ code: accounts.code, direction: ledgerEntries.direction })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
      .where(eq(ledgerEntries.journalId, j.id));
    if (!legs.some((l) => l.code === COMMISSION_INCOME && l.direction === "DR")) {
      throw new Error("commission missing COMMISSION_INCOME DR");
    }

    await assertPassbook(groupId, 1);
    await assertMirror(retId, "ret after commission");
    expectEq(await walletBalance(retMainId), beforeMain, "main unchanged (earned)");
    expectEq(
      await walletBalance(retAepsId),
      paiseToRupees(rupeesToPaise(beforeAeps) + rupeesToPaise(amount)),
      "aeps +commission",
    );
    expectEq(
      (await ledgerOf(retId)).settleable - beforeSettle,
      rupeesToPaise(amount),
      "settleable +commission",
    );
  });

  // ── wrap-up ──────────────────────────────────────────────────────────────

  await check("leaves LEDGERTEST reconciliation clean", async () => {
    expectEq((await checkTrialBalance(tenantId)).length, 0, "trial balance");
    expectEq((await checkLedgerVsBalance(tenantId)).length, 0, "ledger vs balance");
    expectEq((await checkSettleable(tenantId)).length, 0, "settleable");
    expectEq((await checkNegativeAgentBalance(tenantId)).length, 0, "negative agents");
  });

  await check("LEDGERTEST remains inactive", async () => {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    expectEq(t?.isActive, false, "is_active");
  });

  for (const uid of [retId, distId, mdId]) {
    try {
      await zeroAgent(uid);
    } catch (err) {
      console.log(`  WARN  zero ${uid}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await softRetire(retId, "R");
  await softRetire(distId, "D");
  await softRetire(mdId, "M");
  await db.delete(userHierarchy).where(inArray(userHierarchy.descendantId, [retId, distId, mdId]));

  try {
    await scrubRunTransactionsAndPassbook();
  } catch (err) {
    console.log(
      `  WARN  scrub run txns: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.log(`\n${"-".repeat(72)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log("-".repeat(72));
  console.log(
    failed === 0
      ? "\nSHIM VERIFIED — hierarchy, service_txn debit/credit (+ fee 3-leg + service_charges),\n" +
          `reversal, fundWallet, commission, mirror and passbook under ${TENANT_CODE} (ASANPAY untouched).\n` +
          `Harness catalog codes (inactive, reused): ${SHIM_BANK}, ${SHIM_OTH}, ${SHIM_UNMAPPED}.\n`
      : "\nSHIM NOT VERIFIED — do not trust legacy money paths until these pass.\n",
  );

  await pgPool.end();
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(async (err) => {
  console.error("Shim verification harness crashed:", err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});

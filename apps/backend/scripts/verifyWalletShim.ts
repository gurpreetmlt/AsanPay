/**
 * End-to-end exercise of the wallet LEDGER SHIM (`modules/wallet/wallet.ledger.ts`) against
 * a real Postgres: hierarchy transfers through `transferBetweenWallets` / `fundWallet`, the
 * referenceType → txnType mapping, the `wallets.balance` mirror, and the legacy passbook
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
 *
 * Intentionally does NOT call `fundWallet()` here: that path sets companyMoved and rewrites the
 * single global aggregator wallet row from LEDGERTEST COMPANY_001 — unsafe on a shared prod DB.
 * External funding can be proven later in isolation once aggregator mirroring is tenant-scoped.
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
  walletLedgerGroups,
  walletLedgerEntries,
  userHierarchy,
} from "../src/db/postgres/schema";
import { postJournal, clearAccountCache } from "../src/core/ledger";
import { seedSystemAccounts } from "../src/modules/bootstrap/systemAccounts";
import { rupeesToPaise, paiseToRupees } from "../src/core/money";
import { ensureHierarchyAccount } from "../src/modules/wallet/ledgerAccounts";
import {
  clearTenantCache,
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

const RUN = randomUUID().slice(0, 8);
const TENANT_CODE = "LEDGERTEST";
const FLOAT_CONTROL = "TREASURY_FLOAT_CONTROL";

// Set before any money path resolves the tenant.
process.env.LEDGER_TENANT_CODE = TENANT_CODE;

let tenantId: string;
let adminId: string;

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

function nextMobile(): string {
  mobileSeq += 1;
  // 10 digits, unique per process
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
  role: "master_distributor" | "distributor" | "retailer",
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

  const md = await createAgent("master_distributor", null, "Shim MD", "S");
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

  console.log(`\n${"-".repeat(72)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log("-".repeat(72));
  console.log(
    failed === 0
      ? "\nSHIM VERIFIED — wallet.ledger.ts mapping, mirror and passbook exercise cleanly\n" +
          `under ${TENANT_CODE} (ASANPAY untouched).\n`
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

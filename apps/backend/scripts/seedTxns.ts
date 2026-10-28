import { refuseInProduction } from "./_guard";
refuseInProduction("seed:txns");

import "dotenv/config";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pgPool } from "../src/db/postgres";
import { services, transactions, users, wallets } from "../src/db/postgres/schema";
import { fundWallet } from "../src/modules/wallet/wallet.ledger";
import { generateTxnRef } from "../src/utils/uid";
import type { WalletType } from "@asanpay/shared-types";

/** LOGIN.md retailer — agent web :3001 */
const RETAILER_MOBILE = "9333333333";

/** Sample balances for staging when wallets are still ₹0 (Wallet 1 / Wallet 2 header). */
const DEMO_BALANCES: Record<WalletType, string> = {
  main: "25000.00",
  aeps: "8500.00",
};

type TxnStatus = "success" | "pending" | "failed" | "initiated";

interface SeedTxn {
  key: string;
  serviceCode: string;
  amount: string;
  status: TxnStatus;
  walletType: WalletType;
  customerFee?: string;
  commission?: string;
  failureReason?: string;
  hoursAgo: number;
}

/**
 * Realistic retailer counter txns. Codes must exist from `seed:catalog`.
 * main = Wallet 1, aeps = Wallet 2.
 */
const SEED_TXNS: SeedTxn[] = [
  {
    key: "seed-rt-mobile-prepaid-ok",
    serviceCode: "MOBILE_PREPAID",
    amount: "299.00",
    status: "success",
    walletType: "main",
    customerFee: "0",
    commission: "5.98",
    hoursAgo: 2,
  },
  {
    key: "seed-rt-electricity-ok",
    serviceCode: "ELECTRICITY",
    amount: "1240.50",
    status: "success",
    walletType: "main",
    customerFee: "1.00",
    commission: "1.00",
    hoursAgo: 5,
  },
  {
    key: "seed-rt-dth-pending",
    serviceCode: "DTH",
    amount: "450.00",
    status: "pending",
    walletType: "main",
    customerFee: "0",
    commission: "6.75",
    hoursAgo: 1,
  },
  {
    key: "seed-rt-fastag-failed",
    serviceCode: "FASTAG_RECHARGE",
    amount: "500.00",
    status: "failed",
    walletType: "main",
    customerFee: "0",
    failureReason: "Provider timeout",
    hoursAgo: 8,
  },
  {
    key: "seed-rt-money-transfer-ok",
    serviceCode: "MONEY_TRANSFER",
    amount: "5000.00",
    status: "success",
    walletType: "main",
    customerFee: "25.00",
    commission: "12.50",
    hoursAgo: 12,
  },
  {
    key: "seed-rt-cash-withdraw-ok",
    serviceCode: "CASH_WITHDRAW",
    amount: "2000.00",
    status: "success",
    walletType: "aeps",
    customerFee: "0",
    commission: "8.00",
    hoursAgo: 3,
  },
  {
    key: "seed-rt-aadhaar-pay-ok",
    serviceCode: "AADHAAR_PAY",
    amount: "1500.00",
    status: "success",
    walletType: "aeps",
    customerFee: "0",
    commission: "6.00",
    hoursAgo: 6,
  },
  {
    key: "seed-rt-mini-stmt-ok",
    serviceCode: "MINI_STATEMENT",
    amount: "1.00",
    status: "success",
    walletType: "aeps",
    customerFee: "0",
    commission: "0.50",
    hoursAgo: 4,
  },
  {
    key: "seed-rt-cash-deposit-pending",
    serviceCode: "CASH_DEPOSIT",
    amount: "3000.00",
    status: "pending",
    walletType: "aeps",
    customerFee: "0",
    commission: "5.00",
    hoursAgo: 0.5,
  },
  {
    key: "seed-rt-balance-enq-failed",
    serviceCode: "BALANCE_ENQUIRY",
    amount: "1.00",
    status: "failed",
    walletType: "aeps",
    failureReason: "Biometric mismatch",
    hoursAgo: 10,
  },
];

async function assertTxnWalletTypeColumn(): Promise<void> {
  const rows = await db.execute<{ ok: number }>(sql`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'wallet_type'
    LIMIT 1
  `);
  if (rows.rows.length === 0) {
    throw new Error(
      "transactions.wallet_type column missing. Run: npm run db:migrate -w @asanpay/backend",
    );
  }
}

async function ensureDemoBalances(userId: string): Promise<void> {
  const rows = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (rows.length === 0) {
    console.warn(`No wallets for userId=${userId} — header balances stay ₹0`);
    return;
  }

  for (const w of rows) {
    const bal = parseFloat(String(w.balance));
    if (!Number.isNaN(bal) && bal > 0) {
      console.log(`Wallet ${w.walletType}: balance ₹${w.balance} (skip fund)`);
      continue;
    }
    const amount = DEMO_BALANCES[w.walletType as WalletType];
    if (!amount) continue;
    await fundWallet({
      walletId: w.id,
      amount,
      description: "dev seed demo balance",
    });
    console.log(`Wallet ${w.walletType}: funded ₹${amount}`);
  }
}

async function main() {
  await assertTxnWalletTypeColumn();

  const [retailer] = await db
    .select({ id: users.id, uid: users.uid, name: users.name, mobile: users.mobile, role: users.role })
    .from(users)
    .where(eq(users.mobile, RETAILER_MOBILE))
    .limit(1);

  if (!retailer) {
    throw new Error(
      `Retailer ${RETAILER_MOBILE} not found. Create the LOGIN.md demo hierarchy first (agent signup / admin create), then re-run.`,
    );
  }
  if (retailer.role !== "retailer") {
    throw new Error(`User ${RETAILER_MOBILE} is role=${retailer.role}, expected retailer`);
  }

  console.log(`Target retailer: ${retailer.name}`);
  console.log(`  mobile=${retailer.mobile}`);
  console.log(`  userId=${retailer.id}`);
  console.log(`  role=${retailer.role}`);

  await ensureDemoBalances(retailer.id);

  const codes = [...new Set(SEED_TXNS.map((t) => t.serviceCode))];
  const serviceRows = await db
    .select({ id: services.id, code: services.code, name: services.name })
    .from(services)
    .where(inArray(services.code, codes));

  const byCode = new Map(serviceRows.map((s) => [s.code, s]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Missing catalog services: ${missing.join(", ")}. Run: npm run seed:catalog -w @asanpay/backend`,
    );
  }

  const keys = SEED_TXNS.map((t) => t.key);
  const existing = await db
    .select({ idempotencyKey: transactions.idempotencyKey })
    .from(transactions)
    .where(inArray(transactions.idempotencyKey, keys));
  const existingKeys = new Set(existing.map((e) => e.idempotencyKey));

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEED_TXNS) {
    if (existingKeys.has(seed.key)) {
      skipped += 1;
      continue;
    }

    const service = byCode.get(seed.serviceCode)!;
    const createdAt = new Date(Date.now() - seed.hoursAgo * 60 * 60 * 1000);
    const completed =
      seed.status === "success" || seed.status === "failed"
        ? new Date(createdAt.getTime() + 45_000)
        : null;

    await db.insert(transactions).values({
      txnRef: generateTxnRef(retailer.uid),
      idempotencyKey: seed.key,
      userId: retailer.id,
      serviceId: service.id,
      amount: seed.amount,
      customerFee: seed.customerFee ?? "0",
      status: seed.status,
      failureReason: seed.failureReason ?? null,
      walletType: seed.walletType,
      metadata: {
        seeded: true,
        commission: seed.commission ?? "0",
        note: "dev seed txn",
      },
      initiatedAt: createdAt,
      completedAt: completed,
      createdAt,
      updatedAt: createdAt,
    });
    inserted += 1;
  }

  const [txnCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.userId, retailer.id));

  console.log(`Txns inserted this run: ${inserted}`);
  console.log(`Txns skipped (already present): ${skipped}`);
  console.log(`Txns total for this retailer: ${txnCountRow?.count ?? 0}`);
  console.log("Login agent web :3001 → Retailer One → Transactions (refresh). Restart backend if it was already running.");
  await pgPool.end();
}

main().catch((err) => {
  console.error("Seeding transactions failed:", err);
  process.exit(1);
});

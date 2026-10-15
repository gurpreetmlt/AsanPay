import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { accountBalances, accounts, bankAccounts, providers } from "../../db/postgres/schema";
import { paiseToRupees, type Paise } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import { floatAccountCode } from "../wallet/ledgerAccounts";
import { getTreasurySummary } from "../reconciliation/checks";
import { fetchProviderLiveBalance } from "./providerLiveBalance";
import { decryptPII } from "../../utils/aes";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";

export interface TreasuryBankCard {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  ifsc: string;
  purpose: "collection" | "payout" | "ops";
  isActive: boolean;
  ledgerBalance: string;
}

export interface TreasuryProviderCard {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  ledgerBalance: string;
  live:
    | { status: "ok"; balance: string; hold: string | null; difference: string }
    | { status: "unsupported" }
    | { status: "error"; message: string };
  lowBalanceThreshold: string | null;
  isLow: boolean;
}

export interface TreasuryBreakdown {
  bankTotal: string;
  floatTotal: string;
  transitTotal: string;
  totalAssets: string;
  downlineLiability: string;
  solvent: boolean;
  banks: TreasuryBankCard[];
  providers: TreasuryProviderCard[];
  lowBalanceCount: number;
  mismatchCount: number;
}

export async function getTreasuryBreakdown(tenantId: string): Promise<TreasuryBreakdown> {
  const summary = await getTreasurySummary(tenantId);

  const bankRows = await db
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      last4: bankAccounts.accountNumberLast4,
      ifsc: bankAccounts.ifsc,
      purpose: bankAccounts.purpose,
      isActive: bankAccounts.isActive,
      balance: sql<string>`COALESCE(${accountBalances.balance}, 0)::text`,
    })
    .from(bankAccounts)
    .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
    .leftJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(and(eq(bankAccounts.tenantId, tenantId), isNull(bankAccounts.deletedAt)))
    .orderBy(bankAccounts.bankName, bankAccounts.purpose);

  const providerRows = await db
    .select({
      id: providers.id,
      code: providers.code,
      name: providers.name,
      isActive: providers.isActive,
      threshold: providers.lowBalanceThreshold,
    })
    .from(providers)
    .orderBy(providers.priority, providers.name);

  const floatRows = await db
    .select({
      code: accounts.code,
      balance: sql<string>`COALESCE(${accountBalances.balance}, 0)::text`,
    })
    .from(accounts)
    .leftJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.accountType, "float")));
  const floatByCode = new Map(floatRows.map((r) => [r.code, BigInt(r.balance)]));

  // An inactive provider only matters while it still holds our money.
  const visibleProviders = providerRows.filter(
    (p) => p.isActive || (floatByCode.get(floatAccountCode(p.code)) ?? 0n) !== 0n,
  );

  const lives = await Promise.all(visibleProviders.map((p) => fetchProviderLiveBalance(p.code)));

  let lowBalanceCount = 0;
  let mismatchCount = 0;

  const providerCards: TreasuryProviderCard[] = visibleProviders.map((p, i) => {
    const ledger: Paise = floatByCode.get(floatAccountCode(p.code)) ?? 0n;
    const live = lives[i] ?? { status: "unsupported" as const };

    let liveOut: TreasuryProviderCard["live"];
    let effective: Paise = ledger;
    if (live.status === "ok") {
      const difference = live.balance - ledger;
      if (difference !== 0n) mismatchCount += 1;
      effective = live.balance;
      liveOut = {
        status: "ok",
        balance: paiseToRupees(live.balance),
        hold: live.hold != null ? paiseToRupees(live.hold) : null,
        difference: paiseToRupees(difference),
      };
    } else {
      liveOut = live;
    }

    const isLow = p.threshold != null && effective < p.threshold;
    if (isLow) lowBalanceCount += 1;

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      isActive: p.isActive,
      ledgerBalance: paiseToRupees(ledger),
      live: liveOut,
      lowBalanceThreshold: p.threshold != null ? paiseToRupees(p.threshold) : null,
      isLow,
    };
  });

  return {
    bankTotal: paiseToRupees(summary.bank),
    floatTotal: paiseToRupees(summary.float),
    transitTotal: paiseToRupees(summary.transit),
    totalAssets: paiseToRupees(summary.totalAssets),
    downlineLiability: paiseToRupees(summary.downlineLiability),
    solvent: summary.solvent,
    banks: bankRows.map((b) => ({
      id: String(b.id),
      bankName: b.bankName,
      accountNumberLast4: b.last4,
      ifsc: b.ifsc,
      purpose: b.purpose,
      isActive: b.isActive,
      ledgerBalance: paiseToRupees(BigInt(b.balance)),
    })),
    providers: providerCards,
    lowBalanceCount,
    mismatchCount,
  };
}

/** Full bank details for the admin eye view. The account number is decrypted here only. */
export async function getTreasuryBankDetails(params: { tenantId: string; bankAccountId: bigint; adminId: string }) {
  const [row] = await db
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      accountNumberEnc: bankAccounts.accountNumberEnc,
      ifsc: bankAccounts.ifsc,
      holderName: bankAccounts.holderName,
      accountType: bankAccounts.accountType,
      branchName: bankAccounts.branchName,
      branchCode: bankAccounts.branchCode,
      purpose: bankAccounts.purpose,
      isActive: bankAccounts.isActive,
      supportsVan: bankAccounts.supportsVan,
      createdAt: bankAccounts.createdAt,
      ledgerCode: accounts.code,
      balance: sql<string>`COALESCE(${accountBalances.balance}, 0)::text`,
    })
    .from(bankAccounts)
    .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
    .leftJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(
      and(
        eq(bankAccounts.id, params.bankAccountId),
        eq(bankAccounts.tenantId, params.tenantId),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "Bank account not found", "BANK_NOT_FOUND");

  let accountNumber: string;
  try {
    accountNumber = decryptPII(row.accountNumberEnc);
  } catch {
    throw new HttpError(500, "Could not read the stored account number for this bank", "DECRYPT_FAILED");
  }

  await insertAuditLog({
    userId: params.adminId,
    action: "admin.bank_account_reveal",
    entityType: "bank_account",
    entityId: String(row.id),
    metadata: { bankName: row.bankName },
  });

  return {
    id: String(row.id),
    bankName: row.bankName,
    accountNumber,
    ifsc: row.ifsc,
    holderName: row.holderName,
    accountType: row.accountType,
    branchName: row.branchName,
    branchCode: row.branchCode,
    purpose: row.purpose,
    isActive: row.isActive,
    supportsVan: row.supportsVan,
    ledgerCode: row.ledgerCode,
    ledgerBalance: paiseToRupees(BigInt(row.balance)),
    createdAt: row.createdAt,
  };
}

export async function setProviderLowBalanceThreshold(params: {
  providerId: string;
  threshold: Paise | null;
}): Promise<{ id: string; lowBalanceThreshold: string | null }> {
  if (params.threshold != null && params.threshold < 0n) {
    throw new HttpError(422, "Low balance limit cannot be negative", "INVALID_THRESHOLD");
  }
  const [row] = await db
    .update(providers)
    .set({ lowBalanceThreshold: params.threshold })
    .where(eq(providers.id, params.providerId))
    .returning({ id: providers.id, threshold: providers.lowBalanceThreshold });
  if (!row) throw new HttpError(404, "Provider not found", "PROVIDER_NOT_FOUND");
  return {
    id: row.id,
    lowBalanceThreshold: row.threshold != null ? paiseToRupees(row.threshold) : null,
  };
}

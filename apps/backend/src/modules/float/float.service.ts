import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  accounts,
  bankAccounts,
  floatRoutes,
  floatTransfers,
  providers,
} from "../../db/postgres/schema";
import { postJournal } from "../../core/ledger";
import { rupeesToPaise, paiseToRupees, type Paise } from "../../core/money";
import { encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { ensureTreasuryAccount, floatAccountCode } from "../wallet/ledgerAccounts";

const TRANSIT_CODE = "TREASURY_TRANSIT_FLOAT";

function parseId(raw: string, label: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    throw new HttpError(422, `${label} is invalid`, "INVALID_ID");
  }
}

export async function listProvidersForFloat() {
  const rows = await db
    .select({
      id: providers.id,
      code: providers.code,
      name: providers.name,
      isActive: providers.isActive,
    })
    .from(providers)
    .where(eq(providers.isActive, true))
    .orderBy(providers.priority, providers.name);
  return rows;
}

export async function createFloatRoute(params: {
  tenantId: string;
  fromBankId: string;
  toProviderId: string;
  beneficiaryName: string;
  beneficiaryAccount: string;
  beneficiaryIfsc: string;
  transferMode?: "neft" | "rtgs" | "imps";
  minAmount?: string;
  maxAmount?: string;
  priority?: number;
}): Promise<{ routeId: bigint }> {
  const digits = params.beneficiaryAccount.replace(/\s/g, "");
  if (!/^\d{6,18}$/.test(digits)) {
    throw new HttpError(422, "Beneficiary account number must be 6–18 digits", "INVALID_ACCOUNT");
  }

  const fromBankId = parseId(params.fromBankId, "fromBankId");

  const [bank] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, fromBankId), eq(bankAccounts.tenantId, params.tenantId)))
    .limit(1);
  if (!bank) throw new HttpError(404, "Source bank account not found", "BANK_NOT_FOUND");

  const [provider] = await db
    .select({ id: providers.id, code: providers.code, name: providers.name, isActive: providers.isActive })
    .from(providers)
    .where(eq(providers.id, params.toProviderId))
    .limit(1);
  if (!provider) throw new HttpError(404, "Provider not found", "PROVIDER_NOT_FOUND");
  if (!provider.isActive) {
    throw new HttpError(422, "Provider is inactive — activate it before creating a float route", "PROVIDER_INACTIVE");
  }

  const minAmount = params.minAmount ? rupeesToPaise(params.minAmount) : null;
  const maxAmount = params.maxAmount ? rupeesToPaise(params.maxAmount) : null;
  if (minAmount != null && maxAmount != null && minAmount > maxAmount) {
    throw new HttpError(422, "minAmount cannot be greater than maxAmount", "INVALID_AMOUNT_RANGE");
  }

  const [row] = await db
    .insert(floatRoutes)
    .values({
      tenantId: params.tenantId,
      fromBankId,
      toProviderId: provider.id,
      beneficiaryName: params.beneficiaryName.trim(),
      beneficiaryAccEnc: encryptPII(digits),
      beneficiaryAccLast4: digits.slice(-4),
      beneficiaryIfsc: params.beneficiaryIfsc.toUpperCase(),
      transferMode: params.transferMode ?? "neft",
      minAmount,
      maxAmount,
      priority: params.priority ?? 1,
    })
    .returning({ id: floatRoutes.id });

  if (!row) throw new HttpError(500, "Could not create float route", "ROUTE_CREATE_FAILED");
  return { routeId: row.id };
}

export async function listFloatRoutes(tenantId: string) {
  const rows = await db
    .select({
      id: floatRoutes.id,
      fromBankId: floatRoutes.fromBankId,
      bankName: bankAccounts.bankName,
      bankLast4: bankAccounts.accountNumberLast4,
      toProviderId: floatRoutes.toProviderId,
      providerCode: providers.code,
      providerName: providers.name,
      beneficiaryName: floatRoutes.beneficiaryName,
      beneficiaryAccLast4: floatRoutes.beneficiaryAccLast4,
      beneficiaryIfsc: floatRoutes.beneficiaryIfsc,
      transferMode: floatRoutes.transferMode,
      minAmount: floatRoutes.minAmount,
      maxAmount: floatRoutes.maxAmount,
      priority: floatRoutes.priority,
      isActive: floatRoutes.isActive,
      createdAt: floatRoutes.createdAt,
    })
    .from(floatRoutes)
    .innerJoin(bankAccounts, eq(bankAccounts.id, floatRoutes.fromBankId))
    .innerJoin(providers, eq(providers.id, floatRoutes.toProviderId))
    .where(eq(floatRoutes.tenantId, tenantId))
    .orderBy(floatRoutes.priority, desc(floatRoutes.createdAt));

  return rows.map((r) => ({
    id: String(r.id),
    fromBankId: String(r.fromBankId),
    bankName: r.bankName,
    bankLast4: r.bankLast4,
    toProviderId: r.toProviderId,
    providerCode: r.providerCode,
    providerName: r.providerName,
    beneficiaryName: r.beneficiaryName,
    beneficiaryAccLast4: r.beneficiaryAccLast4,
    beneficiaryIfsc: r.beneficiaryIfsc,
    transferMode: r.transferMode,
    minAmount: r.minAmount != null ? paiseToRupees(r.minAmount) : null,
    maxAmount: r.maxAmount != null ? paiseToRupees(r.maxAmount) : null,
    priority: r.priority,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function setFloatRouteActive(params: {
  tenantId: string;
  routeId: string;
  isActive: boolean;
}): Promise<void> {
  const routeId = parseId(params.routeId, "routeId");
  const [updated] = await db
    .update(floatRoutes)
    .set({ isActive: params.isActive })
    .where(and(eq(floatRoutes.id, routeId), eq(floatRoutes.tenantId, params.tenantId)))
    .returning({ id: floatRoutes.id });
  if (!updated) throw new HttpError(404, "Float route not found", "NOT_FOUND");
}

/**
 * Maker step: Dr bank  Cr transit (FLOAT_TRANSFER_INIT). Money is in flight to the aggregator.
 */
export async function initiateFloatTransfer(params: {
  tenantId: string;
  routeId: string;
  amount: Paise;
  adminId: string;
  bankUtr?: string;
}): Promise<{ transferId: bigint; transitJournalId: bigint }> {
  if (params.amount <= 0n) {
    throw new HttpError(422, "Amount must be greater than zero", "INVALID_AMOUNT");
  }

  return db.transaction(async (tx) => {
    const routeId = parseId(params.routeId, "routeId");
    const [route] = await tx
      .select({
        id: floatRoutes.id,
        fromBankId: floatRoutes.fromBankId,
        toProviderId: floatRoutes.toProviderId,
        minAmount: floatRoutes.minAmount,
        maxAmount: floatRoutes.maxAmount,
        isActive: floatRoutes.isActive,
      })
      .from(floatRoutes)
      .where(and(eq(floatRoutes.id, routeId), eq(floatRoutes.tenantId, params.tenantId)))
      .for("update");

    if (!route) throw new HttpError(404, "Float route not found", "NOT_FOUND");
    if (!route.isActive) {
      throw new HttpError(422, "Float route is inactive", "ROUTE_INACTIVE");
    }
    if (route.minAmount != null && params.amount < route.minAmount) {
      throw new HttpError(
        422,
        `Amount is below the route minimum of ${paiseToRupees(route.minAmount)}`,
        "BELOW_MIN",
      );
    }
    if (route.maxAmount != null && params.amount > route.maxAmount) {
      throw new HttpError(
        422,
        `Amount is above the route maximum of ${paiseToRupees(route.maxAmount)}`,
        "ABOVE_MAX",
      );
    }

    const [bank] = await tx
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
      .where(and(eq(bankAccounts.id, route.fromBankId), eq(bankAccounts.tenantId, params.tenantId)))
      .limit(1);
    if (!bank) throw new HttpError(500, "Source bank has no ledger account", "BANK_NOT_LINKED");

    await ensureTreasuryAccount(tx, {
      tenantId: params.tenantId,
      code: TRANSIT_CODE,
      name: "Float transit (bank → aggregator)",
      type: "transit",
    });

    const [inserted] = await tx
      .insert(floatTransfers)
      .values({
        tenantId: params.tenantId,
        routeId: route.id,
        amount: params.amount,
        bankUtr: params.bankUtr?.trim() || null,
        status: "initiated",
        initiatedBy: params.adminId,
      })
      .returning({ id: floatTransfers.id });

    if (!inserted) throw new HttpError(500, "Could not create float transfer", "TRANSFER_CREATE_FAILED");

    const transit = await postJournal(tx, {
      tenantId: params.tenantId,
      txnType: "FLOAT_TRANSFER_INIT",
      idemKey: `FLOAT_INIT:${inserted.id}`,
      performedBy: params.adminId,
      referenceId: String(inserted.id),
      reason: "Bank to float transit",
      entries: [
        { code: bank.code, dir: "DR", amount: params.amount },
        { code: TRANSIT_CODE, dir: "CR", amount: params.amount },
      ],
    });

    await tx
      .update(floatTransfers)
      .set({
        status: "in_transit",
        transitJournalId: transit.id,
      })
      .where(eq(floatTransfers.id, inserted.id));

    return { transferId: inserted.id, transitJournalId: transit.id };
  });
}

/**
 * Checker step: Dr transit  Cr float (FLOAT_TRANSFER_CONFIRM). Aggregator confirmed receipt.
 */
export async function confirmFloatTransfer(params: {
  tenantId: string;
  transferId: string;
  adminId: string;
  bankUtr?: string;
}): Promise<{ confirmJournalId: bigint }> {
  return db.transaction(async (tx) => {
    const transferId = parseId(params.transferId, "transferId");
    const [row] = await tx
      .select({
        id: floatTransfers.id,
        amount: floatTransfers.amount,
        status: floatTransfers.status,
        initiatedBy: floatTransfers.initiatedBy,
        bankUtr: floatTransfers.bankUtr,
        routeId: floatTransfers.routeId,
      })
      .from(floatTransfers)
      .where(and(eq(floatTransfers.id, transferId), eq(floatTransfers.tenantId, params.tenantId)))
      .for("update");

    if (!row) throw new HttpError(404, "Float transfer not found", "NOT_FOUND");
    if (row.status !== "in_transit" && row.status !== "initiated") {
      throw new HttpError(422, `Transfer is already ${row.status}`, "ALREADY_TERMINAL");
    }
    if (row.initiatedBy === params.adminId) {
      throw new HttpError(
        422,
        "The admin who initiated this float transfer cannot also confirm it",
        "MAKER_CHECKER",
      );
    }

    const [route] = await tx
      .select({ toProviderId: floatRoutes.toProviderId })
      .from(floatRoutes)
      .where(eq(floatRoutes.id, row.routeId))
      .limit(1);
    if (!route) throw new HttpError(500, "Float route missing for transfer", "ROUTE_MISSING");

    const [provider] = await tx
      .select({ code: providers.code, name: providers.name })
      .from(providers)
      .where(eq(providers.id, route.toProviderId))
      .limit(1);
    if (!provider) throw new HttpError(404, "Provider not found", "PROVIDER_NOT_FOUND");

    const floatCode = floatAccountCode(provider.code);
    await ensureTreasuryAccount(tx, {
      tenantId: params.tenantId,
      code: floatCode,
      name: `Float — ${provider.name}`,
      type: "float",
    });

    await ensureTreasuryAccount(tx, {
      tenantId: params.tenantId,
      code: TRANSIT_CODE,
      name: "Float transit (bank → aggregator)",
      type: "transit",
    });

    const confirm = await postJournal(tx, {
      tenantId: params.tenantId,
      txnType: "FLOAT_TRANSFER_CONFIRM",
      idemKey: `FLOAT_CONFIRM:${row.id}`,
      performedBy: params.adminId,
      referenceId: String(row.id),
      reason: "Transit to provider float",
      entries: [
        { code: TRANSIT_CODE, dir: "DR", amount: row.amount as Paise },
        { code: floatCode, dir: "CR", amount: row.amount as Paise },
      ],
    });

    await tx
      .update(floatTransfers)
      .set({
        status: "confirmed",
        approvedBy: params.adminId,
        confirmJournalId: confirm.id,
        confirmedAt: new Date(),
        bankUtr: params.bankUtr?.trim() || row.bankUtr,
      })
      .where(eq(floatTransfers.id, row.id));

    return { confirmJournalId: confirm.id };
  });
}

export async function listFloatTransfers(tenantId: string, limit = 50) {
  const rows = await db
    .select({
      id: floatTransfers.id,
      routeId: floatTransfers.routeId,
      amount: floatTransfers.amount,
      bankUtr: floatTransfers.bankUtr,
      status: floatTransfers.status,
      providerCode: providers.code,
      providerName: providers.name,
      bankName: bankAccounts.bankName,
      initiatedAt: floatTransfers.initiatedAt,
      confirmedAt: floatTransfers.confirmedAt,
    })
    .from(floatTransfers)
    .innerJoin(floatRoutes, eq(floatRoutes.id, floatTransfers.routeId))
    .innerJoin(providers, eq(providers.id, floatRoutes.toProviderId))
    .innerJoin(bankAccounts, eq(bankAccounts.id, floatRoutes.fromBankId))
    .where(eq(floatTransfers.tenantId, tenantId))
    .orderBy(desc(floatTransfers.initiatedAt))
    .limit(Math.min(Math.max(limit, 1), 200));

  return rows.map((r) => ({
    id: String(r.id),
    routeId: String(r.routeId),
    amount: paiseToRupees(r.amount),
    bankUtr: r.bankUtr,
    status: r.status,
    providerCode: r.providerCode,
    providerName: r.providerName,
    bankName: r.bankName,
    initiatedAt: r.initiatedAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
  }));
}

/** Snapshot for admin reports: float balances + open in-transit total. */
export async function floatCoverageSnapshot(tenantId: string) {
  const floatRows = await db.execute<{ float_paise: string; transit_paise: string }>(sql`
    SELECT
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type = 'float'), 0)::text AS float_paise,
      COALESCE(SUM(ab.balance) FILTER (WHERE a.account_type = 'transit'), 0)::text AS transit_paise
    FROM accounts a
    JOIN account_balances ab ON ab.account_id = a.id
    WHERE a.tenant_id = ${tenantId}
  `);
  const floatRow = floatRows.rows[0];

  const [open] = await db
    .select({ n: sql<string>`COUNT(*)`, sum: sql<string>`COALESCE(SUM(${floatTransfers.amount}), 0)` })
    .from(floatTransfers)
    .where(
      and(
        eq(floatTransfers.tenantId, tenantId),
        sql`${floatTransfers.status} IN ('initiated','in_transit')`,
      ),
    );

  return {
    floatBalance: paiseToRupees(BigInt(floatRow?.float_paise ?? "0")),
    transitBalance: paiseToRupees(BigInt(floatRow?.transit_paise ?? "0")),
    openTransfers: Number(open?.n ?? 0),
    openAmount: paiseToRupees(BigInt(open?.sum ?? "0")),
  };
}

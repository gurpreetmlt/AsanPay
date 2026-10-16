import { and, eq, gt, gte, lte, isNull, or, desc, sql, asc, ilike } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  commissionLedger,
  commissionRules,
  userCommissionRates,
  transactions,
  userHierarchy,
  users,
  wallets,
  services,
  serviceCategories,
  providers,
} from "../../db/postgres/schema";
import { transferBetweenWallets } from "../wallet/wallet.ledger";
import { toPaise, fromPaise } from "../wallet/decimal";
import { logger } from "../../utils/logger";
import { notifyCommissionCredit } from "../notifications/userEmail.service";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import type { UserRole } from "@asanpay/shared-types";
import { applyTdsToGrossPaise, resolveTaxForService } from "./tax.service";

const SCHEME_ROLES = ["retailer", "distributor", "super_distributor"] as const;
type SchemeRole = (typeof SCHEME_ROLES)[number];

type RuleType = "flat" | "percentage";

type RuleRow = {
  ruleType: RuleType;
  value: string;
};

function isSchemeRole(role: string): role is SchemeRole {
  return (SCHEME_ROLES as readonly string[]).includes(role);
}

/** Same integer-paise math as live payout — percentage is 0–100 with up to 4 decimals. */
export function computePayoutPaise(rule: RuleRow, amountPaise: number): number {
  if (rule.ruleType === "flat") return toPaise(rule.value);
  return Math.floor((amountPaise * Math.round(parseFloat(rule.value) * 10000)) / 1_000_000);
}

function validateRuleValue(ruleType: RuleType, valueRaw: string): string {
  const valueNum = Number(valueRaw);
  if (!Number.isFinite(valueNum) || valueNum < 0) {
    throw new HttpError(400, "Commission value must be a non-negative number", "INVALID_VALUE");
  }
  if (ruleType === "percentage" && valueNum > 100) {
    throw new HttpError(400, "Percentage cannot exceed 100", "INVALID_VALUE");
  }
  const flatCap = env.MAX_FLAT_COMMISSION_RUPEES ?? 500;
  if (ruleType === "flat" && valueNum > flatCap) {
    throw new HttpError(400, `Flat commission cannot exceed ₹${flatCap}`, "INVALID_VALUE");
  }
  return valueNum.toFixed(4);
}

function normalizeAmountBound(raw: string | null | undefined, field: "minAmount" | "maxAmount"): string | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new HttpError(
      400,
      field === "minAmount"
        ? "Min amount must be a non-negative number"
        : "Max amount must be a non-negative number",
      "INVALID_AMOUNT",
    );
  }
  return n.toFixed(2);
}

// Runs after a service transaction succeeds: pays every ancestor in the chain
// (retailer -> distributor -> super_distributor) their configured cut, each
// payout backed by a system-wallet -> beneficiary-wallet ledger transfer.
// Idempotent per transaction: existing commission_ledger rows short-circuit.
export async function distributeCommissionForTxn(transactionId: string): Promise<void> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!txn || txn.status !== "success") return;

  const [alreadyPaid] = await db
    .select({ id: commissionLedger.id })
    .from(commissionLedger)
    .where(eq(commissionLedger.transactionId, transactionId))
    .limit(1);
  if (alreadyPaid) return;

  // Everyone above (and including) the transacting retailer, closest first.
  const chain = await db
    .select({ userId: userHierarchy.ancestorId, depth: userHierarchy.depth, role: users.role, active: users.isActive })
    .from(userHierarchy)
    .innerJoin(users, eq(userHierarchy.ancestorId, users.id))
    .where(eq(userHierarchy.descendantId, txn.userId))
    .orderBy(userHierarchy.depth);

  const [systemWallet] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.walletKind, "aggregator"), eq(wallets.walletType, "main")))
    .limit(1);
  if (!systemWallet) {
    logger.error({ transactionId }, "commission skipped: no aggregator wallet configured");
    return;
  }

  const now = new Date();
  const amountPaise = toPaise(txn.amount);

  const { resolveTenantId } = await import("../fund-requests/tenant");
  const tenantId = await resolveTenantId();
  const taxCfg = await resolveTaxForService(tenantId, txn.serviceId, now);

  for (const member of chain) {
    // Admin is the residual earner (whatever margin remains) — no explicit payout row.
    if (member.role === "admin" || !member.active) continue;

    const rule = await findActiveRule(txn.serviceId, txn.providerId, member.userId, member.role, txn.amount, now);
    if (!rule) continue;

    const grossPaise = computePayoutPaise(rule, amountPaise);
    if (grossPaise <= 0) continue;
    const { netPaise, tdsPaise, tdsPercent, grossPaise: g } = applyTdsToGrossPaise(grossPaise, taxCfg);
    if (netPaise <= 0) continue;
    const gross = fromPaise(g);
    const net = fromPaise(netPaise);
    const tds = fromPaise(tdsPaise);

    const [beneWallet] = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.userId, member.userId), eq(wallets.walletType, "main")));
    if (!beneWallet) continue;

    try {
      // Transfer + ledger insert share one tx: if a concurrent distribution already paid this
      // (transaction, beneficiary), the unique constraint makes the insert throw and the whole
      // tx — including the money transfer — rolls back. No double payout.
      // Wallet credit = net after TDS (gross held as company TDS payable — books later).
      await db.transaction(async (tx) => {
        const { groupId } = await transferBetweenWallets(
          {
            fromWalletId: systemWallet.id,
            toWalletId: beneWallet.id,
            amount: net,
            referenceType: "commission",
            referenceId: txn.id,
            description:
              tdsPaise > 0
                ? `Commission ${txn.txnRef} (${member.role}) net after TDS`
                : `Commission ${txn.txnRef} (${member.role})`,
          },
          tx,
        );
        await tx.insert(commissionLedger).values({
          transactionId: txn.id,
          beneficiaryUserId: member.userId,
          role: member.role,
          amount: net,
          grossAmount: gross,
          tdsAmount: tds,
          tdsPercent: tdsPaise > 0 ? tdsPercent : null,
          ledgerGroupId: groupId,
        });
      });
      notifyCommissionCredit({
        userId: member.userId,
        amount: net,
        txnRef: txn.txnRef,
      });
    } catch (err) {
      // Either a genuine payout failure or a duplicate (already paid this beneficiary for this
      // txn) — both must never break the customer txn. Log and continue; reconciliation surfaces gaps.
      logger.error({ err, transactionId, beneficiary: member.userId }, "commission payout skipped/failed");
    }
  }
}

async function findActiveRule(
  serviceId: string,
  providerId: string | null,
  userId: string,
  role: UserRole,
  amount: string,
  at: Date,
) {
  const [override] = await db
    .select({
      ruleType: userCommissionRates.ruleType,
      value: userCommissionRates.value,
    })
    .from(userCommissionRates)
    .where(
      and(
        eq(userCommissionRates.userId, userId),
        eq(userCommissionRates.serviceId, serviceId),
        eq(userCommissionRates.isActive, true),
      ),
    )
    .limit(1);
  if (override) return override;

  return findRoleDefaultRule(serviceId, providerId, role, amount, at);
}

/** Role-default slab from `commission_rules` (no per-agent override). */
async function findRoleDefaultRule(
  serviceId: string,
  providerId: string | null,
  role: UserRole,
  amount: string,
  at: Date,
) {
  const amountNum = amount;
  // A provider-specific slab (commission_rules.providerId = this txn's provider) wins over the
  // generic null-provider default for the same service+role — ORDER BY puts provider-specific
  // rows first (NULLS LAST on the boolean match), then most-recently-effective.
  const rules = await db
    .select({
      id: commissionRules.id,
      ruleType: commissionRules.ruleType,
      value: commissionRules.value,
      providerId: commissionRules.providerId,
    })
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.serviceId, serviceId),
        eq(commissionRules.role, role),
        eq(commissionRules.isActive, true),
        lte(commissionRules.effectiveFrom, at),
        or(isNull(commissionRules.effectiveTo), gt(commissionRules.effectiveTo, at)),
        or(isNull(commissionRules.minAmount), lte(commissionRules.minAmount, amountNum)),
        or(isNull(commissionRules.maxAmount), sql`${commissionRules.maxAmount} >= ${amountNum}`),
        providerId
          ? or(isNull(commissionRules.providerId), eq(commissionRules.providerId, providerId))
          : isNull(commissionRules.providerId),
      ),
    )
    .orderBy(desc(commissionRules.effectiveFrom));

  const providerSpecific = providerId ? rules.find((r) => r.providerId === providerId) : undefined;
  const match = providerSpecific ?? rules.find((r) => r.providerId === null) ?? null;
  if (!match) return null;
  return { id: match.id, ruleType: match.ruleType, value: match.value };
}

// ── Earnings reads (retailer/distributor dashboards) ────────────────────────
function istDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+05:30`);
}

function istDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function todayYmdIst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export async function getEarningsSummary(userId: string, since: Date) {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .where(and(eq(commissionLedger.beneficiaryUserId, userId), sql`${commissionLedger.createdAt} >= ${since}`));
  return row ?? { total: "0", count: 0 };
}

export async function listEarnings(userId: string, limit = 50, offset = 0) {
  return db
    .select({
      id: commissionLedger.id,
      amount: commissionLedger.amount,
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      createdAt: commissionLedger.createdAt,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .where(eq(commissionLedger.beneficiaryUserId, userId))
    .orderBy(desc(commissionLedger.createdAt))
    .limit(Math.min(limit, 100))
    .offset(offset);
}

/** My Earnings shell (TC08) — net totals + active service / downline badges. */
export async function getMyEarningsSummary(
  userId: string,
  role: UserRole,
  fromYmd?: string,
  toYmd?: string,
) {
  const from = fromYmd ?? todayYmdIst();
  const to = toYmd ?? from;
  if (from > to) {
    throw new HttpError(400, "From date must be on or before To date", "INVALID_DATE_RANGE");
  }
  const since = istDayStart(from);
  const until = istDayEnd(to);
  const range = and(
    eq(commissionLedger.beneficiaryUserId, userId),
    gte(commissionLedger.createdAt, since),
    lte(commissionLedger.createdAt, until),
  );

  const [totals] = await db
    .select({
      totalNet: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      totalGross: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), '0')`,
      totalTds: sql<string>`coalesce(sum(coalesce(${commissionLedger.tdsAmount}, 0)), '0')`,
      creditCount: sql<number>`count(*)::int`,
      activeServices: sql<number>`count(distinct ${transactions.serviceId})::int`,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .where(range);

  let activeDownline: number | null = null;
  if (role === "super_distributor" || role === "distributor") {
    const [down] = await db
      .select({
        n: sql<number>`count(distinct ${transactions.userId})::int`,
      })
      .from(commissionLedger)
      .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
      .where(range);
    activeDownline = down?.n ?? 0;
  }

  return {
    from,
    to,
    totalNet: String(totals?.totalNet ?? "0"),
    totalGross: String(totals?.totalGross ?? "0"),
    totalTds: String(totals?.totalTds ?? "0"),
    creditCount: totals?.creditCount ?? 0,
    activeServices: totals?.activeServices ?? 0,
    activeDownline,
  };
}

export async function listMyEarnings(
  userId: string,
  opts: { from?: string; to?: string; limit?: number; offset?: number },
) {
  const from = opts.from ?? todayYmdIst();
  const to = opts.to ?? from;
  if (from > to) {
    throw new HttpError(400, "From date must be on or before To date", "INVALID_DATE_RANGE");
  }
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const since = istDayStart(from);
  const until = istDayEnd(to);

  const rows = await db
    .select({
      id: commissionLedger.id,
      netAmount: commissionLedger.amount,
      grossAmount: commissionLedger.grossAmount,
      tdsAmount: commissionLedger.tdsAmount,
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      txnAmount: transactions.amount,
      serviceId: transactions.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      createdAt: commissionLedger.createdAt,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(
      and(
        eq(commissionLedger.beneficiaryUserId, userId),
        gte(commissionLedger.createdAt, since),
        lte(commissionLedger.createdAt, until),
      ),
    )
    .orderBy(desc(commissionLedger.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    netAmount: String(r.netAmount),
    grossAmount: r.grossAmount != null ? String(r.grossAmount) : String(r.netAmount),
    tdsAmount: r.tdsAmount != null ? String(r.tdsAmount) : "0",
    transactionId: r.transactionId,
    txnRef: r.txnRef,
    txnAmount: String(r.txnAmount),
    serviceId: r.serviceId,
    serviceCode: r.serviceCode,
    serviceName: r.serviceName,
    createdAt: r.createdAt,
  }));
}

/** Product-wise summary for My Earnings shell (retailer primary; SD/Dist shared). */
export async function listMyEarningsByProduct(
  userId: string,
  fromYmd?: string,
  toYmd?: string,
) {
  const from = fromYmd ?? todayYmdIst();
  const to = toYmd ?? from;
  if (from > to) {
    throw new HttpError(400, "From date must be on or before To date", "INVALID_DATE_RANGE");
  }
  const since = istDayStart(from);
  const until = istDayEnd(to);

  const rows = await db
    .select({
      serviceId: services.id,
      serviceCode: services.code,
      serviceName: services.name,
      volume: sql<string>`coalesce(sum(${transactions.amount}), '0')`,
      netAmount: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      creditCount: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(
      and(
        eq(commissionLedger.beneficiaryUserId, userId),
        gte(commissionLedger.createdAt, since),
        lte(commissionLedger.createdAt, until),
      ),
    )
    .groupBy(services.id, services.code, services.name)
    .orderBy(desc(sql`sum(${commissionLedger.amount})`));

  return rows.map((r) => ({
    serviceId: r.serviceId,
    serviceCode: r.serviceCode,
    serviceName: r.serviceName,
    volume: String(r.volume),
    netAmount: String(r.netAmount),
    creditCount: r.creditCount,
  }));
}

/** Admin payout report — network-wide commission_ledger with optional role/date filters. */
export async function listAdminCommissionPayouts(filters?: {
  role?: SchemeRole;
  since?: Date;
  until?: Date;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(filters?.limit ?? 50, 200);
  const offset = filters?.offset ?? 0;

  const conditions = [
    filters?.role ? eq(commissionLedger.role, filters.role) : undefined,
    filters?.since ? sql`${commissionLedger.createdAt} >= ${filters.since}` : undefined,
    filters?.until ? sql`${commissionLedger.createdAt} <= ${filters.until}` : undefined,
    filters?.q?.trim()
      ? or(
          ilike(users.name, `%${filters.q.trim()}%`),
          ilike(users.uid, `%${filters.q.trim()}%`),
          ilike(users.mobile, `%${filters.q.trim()}%`),
          ilike(transactions.txnRef, `%${filters.q.trim()}%`),
        )
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));

  const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;

  const [summary] = await db
    .select({
      total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .innerJoin(users, eq(commissionLedger.beneficiaryUserId, users.id))
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: commissionLedger.id,
      amount: commissionLedger.amount,
      role: commissionLedger.role,
      createdAt: commissionLedger.createdAt,
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      txnAmount: transactions.amount,
      serviceId: transactions.serviceId,
      serviceName: services.name,
      serviceCode: services.code,
      beneficiaryUserId: users.id,
      beneficiaryName: users.name,
      beneficiaryUid: users.uid,
      beneficiaryMobile: users.mobile,
    })
    .from(commissionLedger)
    .innerJoin(users, eq(commissionLedger.beneficiaryUserId, users.id))
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .where(whereClause)
    .orderBy(desc(commissionLedger.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    summary: {
      total: String(summary?.total ?? "0"),
      count: summary?.count ?? 0,
    },
    rows: rows.map((r) => ({
      ...r,
      amount: String(r.amount),
      txnAmount: String(r.txnAmount),
    })),
  };
}


// ── Role-default scheme CRUD (commission_rules) ─────────────────────────────

export type CommissionRuleInput = {
  serviceId: string;
  providerId?: string | null;
  role: SchemeRole;
  ruleType: RuleType;
  value: string;
  minAmount?: string | null;
  maxAmount?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
};

async function assertServiceExists(serviceId: string) {
  const [row] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1);
  if (!row) throw new HttpError(400, "Unknown service", "INVALID_SERVICE");
}

async function assertProviderExists(providerId: string | null | undefined) {
  if (!providerId) return;
  const [row] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).limit(1);
  if (!row) throw new HttpError(400, "Unknown provider", "INVALID_PROVIDER");
}

function parseOptionalDate(raw: string | null | undefined, field: string): Date | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, `${field} must be a valid date`, "INVALID_DATE");
  }
  return d;
}

export async function listCommissionRules(filters?: {
  serviceId?: string;
  role?: SchemeRole;
  activeOnly?: boolean;
}) {
  const conditions = [
    filters?.serviceId ? eq(commissionRules.serviceId, filters.serviceId) : undefined,
    filters?.role ? eq(commissionRules.role, filters.role) : undefined,
    filters?.activeOnly ? eq(commissionRules.isActive, true) : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));

  const rows = await db
    .select({
      id: commissionRules.id,
      serviceId: commissionRules.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      categoryName: serviceCategories.name,
      providerId: commissionRules.providerId,
      providerName: providers.name,
      role: commissionRules.role,
      ruleType: commissionRules.ruleType,
      value: commissionRules.value,
      minAmount: commissionRules.minAmount,
      maxAmount: commissionRules.maxAmount,
      effectiveFrom: commissionRules.effectiveFrom,
      effectiveTo: commissionRules.effectiveTo,
      isActive: commissionRules.isActive,
    })
    .from(commissionRules)
    .innerJoin(services, eq(commissionRules.serviceId, services.id))
    .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .leftJoin(providers, eq(commissionRules.providerId, providers.id))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(
      asc(serviceCategories.displayOrder),
      asc(services.displayOrder),
      asc(commissionRules.role),
      desc(commissionRules.effectiveFrom),
    );

  return rows.map((r) => ({
    ...r,
    value: String(r.value),
    minAmount: r.minAmount != null ? String(r.minAmount) : null,
    maxAmount: r.maxAmount != null ? String(r.maxAmount) : null,
  }));
}

export async function createCommissionRule(adminId: string, input: CommissionRuleInput) {
  if (!isSchemeRole(input.role)) {
    throw new HttpError(400, "Role must be retailer, distributor, or super_distributor", "INVALID_ROLE");
  }
  await assertServiceExists(input.serviceId);
  await assertProviderExists(input.providerId);

  const value = validateRuleValue(input.ruleType, input.value);
  const minAmount = normalizeAmountBound(input.minAmount, "minAmount");
  const maxAmount = normalizeAmountBound(input.maxAmount, "maxAmount");
  if (minAmount != null && maxAmount != null && Number(minAmount) > Number(maxAmount)) {
    throw new HttpError(400, "Min amount cannot be greater than max amount", "INVALID_AMOUNT");
  }

  const effectiveFrom = parseOptionalDate(input.effectiveFrom, "effectiveFrom") ?? new Date();
  const effectiveTo = parseOptionalDate(input.effectiveTo, "effectiveTo");
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new HttpError(400, "Effective to must be after effective from", "INVALID_DATE");
  }

  const [created] = await db
    .insert(commissionRules)
    .values({
      serviceId: input.serviceId,
      providerId: input.providerId || null,
      role: input.role,
      ruleType: input.ruleType,
      value,
      minAmount,
      maxAmount,
      effectiveFrom,
      effectiveTo,
      isActive: input.isActive !== false,
    })
    .returning();

  if (!created) {
    throw new HttpError(500, "Failed to create commission rule", "RULE_CREATE_FAILED");
  }

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_rule_create",
    entityType: "commission_rule",
    entityId: created.id,
    metadata: { serviceId: input.serviceId, role: input.role, ruleType: input.ruleType, value },
  });

  return created;
}

export async function updateCommissionRule(
  adminId: string,
  ruleId: string,
  patch: Partial<CommissionRuleInput>,
) {
  const [existing] = await db.select().from(commissionRules).where(eq(commissionRules.id, ruleId)).limit(1);
  if (!existing) throw new HttpError(404, "Commission rule not found", "RULE_NOT_FOUND");

  if (patch.role !== undefined && !isSchemeRole(patch.role)) {
    throw new HttpError(400, "Role must be retailer, distributor, or super_distributor", "INVALID_ROLE");
  }
  if (patch.serviceId) await assertServiceExists(patch.serviceId);
  if (patch.providerId !== undefined) await assertProviderExists(patch.providerId);

  const ruleType = patch.ruleType ?? existing.ruleType;
  const value =
    patch.value !== undefined ? validateRuleValue(ruleType, patch.value) : String(existing.value);
  if (patch.ruleType && patch.value === undefined) {
    validateRuleValue(ruleType, String(existing.value));
  }

  const minAmount =
    patch.minAmount !== undefined
      ? normalizeAmountBound(patch.minAmount, "minAmount")
      : existing.minAmount != null
        ? String(existing.minAmount)
        : null;
  const maxAmount =
    patch.maxAmount !== undefined
      ? normalizeAmountBound(patch.maxAmount, "maxAmount")
      : existing.maxAmount != null
        ? String(existing.maxAmount)
        : null;
  if (minAmount != null && maxAmount != null && Number(minAmount) > Number(maxAmount)) {
    throw new HttpError(400, "Min amount cannot be greater than max amount", "INVALID_AMOUNT");
  }

  const effectiveFrom =
    patch.effectiveFrom !== undefined
      ? (parseOptionalDate(patch.effectiveFrom, "effectiveFrom") ?? existing.effectiveFrom)
      : existing.effectiveFrom;
  const effectiveTo =
    patch.effectiveTo !== undefined
      ? parseOptionalDate(patch.effectiveTo, "effectiveTo")
      : existing.effectiveTo;
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new HttpError(400, "Effective to must be after effective from", "INVALID_DATE");
  }

  const [updated] = await db
    .update(commissionRules)
    .set({
      serviceId: patch.serviceId ?? existing.serviceId,
      providerId: patch.providerId !== undefined ? patch.providerId || null : existing.providerId,
      role: patch.role ?? existing.role,
      ruleType,
      value,
      minAmount,
      maxAmount,
      effectiveFrom,
      effectiveTo,
      isActive: patch.isActive ?? existing.isActive,
    })
    .where(eq(commissionRules.id, ruleId))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_rule_update",
    entityType: "commission_rule",
    entityId: ruleId,
    metadata: patch as Record<string, unknown>,
  });

  return updated;
}

export async function deleteCommissionRule(adminId: string, ruleId: string) {
  const [existing] = await db.select({ id: commissionRules.id }).from(commissionRules).where(eq(commissionRules.id, ruleId)).limit(1);
  if (!existing) throw new HttpError(404, "Commission rule not found", "RULE_NOT_FOUND");

  await db.delete(commissionRules).where(eq(commissionRules.id, ruleId));

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_rule_delete",
    entityType: "commission_rule",
    entityId: ruleId,
    metadata: {},
  });

  return { id: ruleId, deleted: true };
}

/** Preview role-default payouts for an amount (ignores per-agent overrides). */
export async function previewCommissionSplit(input: {
  serviceId: string;
  amount: string;
  providerId?: string | null;
}) {
  await assertServiceExists(input.serviceId);
  if (input.providerId) await assertProviderExists(input.providerId);

  const amountNum = Number(input.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new HttpError(400, "Amount must be a positive number", "INVALID_AMOUNT");
  }
  const amount = amountNum.toFixed(2);
  const amountPaise = toPaise(amount);
  const now = new Date();
  const providerId = input.providerId || null;

  const { resolveTenantId } = await import("../fund-requests/tenant");
  const taxCfg = await resolveTaxForService(await resolveTenantId(), input.serviceId, now);

  const splits: Array<{
    role: SchemeRole;
    ruleId: string | null;
    ruleType: RuleType | null;
    value: string | null;
    payout: string;
    gross: string;
    tds: string;
    net: string;
    matched: boolean;
  }> = [];

  for (const role of SCHEME_ROLES) {
    const rule = await findRoleDefaultRule(input.serviceId, providerId, role, amount, now);
    if (!rule) {
      splits.push({
        role,
        ruleId: null,
        ruleType: null,
        value: null,
        payout: "0.00",
        gross: "0.00",
        tds: "0.00",
        net: "0.00",
        matched: false,
      });
      continue;
    }
    const grossPaise = computePayoutPaise(rule, amountPaise);
    const { netPaise, tdsPaise, grossPaise: g } = applyTdsToGrossPaise(Math.max(0, grossPaise), taxCfg);
    const net = fromPaise(netPaise);
    splits.push({
      role,
      ruleId: rule.id,
      ruleType: rule.ruleType,
      value: String(rule.value),
      payout: net,
      gross: fromPaise(g),
      tds: fromPaise(tdsPaise),
      net,
      matched: true,
    });
  }

  const totalPaise = splits.reduce((sum, s) => sum + toPaise(s.net), 0);
  return {
    serviceId: input.serviceId,
    providerId,
    amount,
    tax: {
      tdsApplies: taxCfg.tdsApplies,
      tdsPercent: taxCfg.tdsPercent,
      gstOnFeeApplies: taxCfg.gstOnFeeApplies,
      gstOnFeePercent: taxCfg.gstOnFeePercent,
    },
    splits,
    totalPayout: fromPaise(totalPaise),
  };
}

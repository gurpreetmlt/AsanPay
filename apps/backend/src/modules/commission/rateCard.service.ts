import { and, asc, eq, gt, inArray, isNull, lte, notInArray, or } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  commissionShares,
  providerPayoutRules,
  providers,
  serviceCategories,
  serviceCharges,
  services,
} from "../../db/postgres/schema";
import type { UserRole } from "@asanpay/shared-types";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { toPaise, fromPaise } from "../wallet/decimal";
import { computeCustomerFeePaise, validateChargeValue } from "../service-charges/serviceCharge.service";
import { resolveTenantId } from "../fund-requests/tenant";
import {
  applyTdsToGrossPaise,
  getTenantTaxDefaults,
  resolveTaxForService,
  type ResolvedTaxConfig,
  type TenantTaxDefaults,
} from "./tax.service";
import { assertCommissionMonthUnlocked, recordRateChangeEvent } from "./commission.guards";
import { isSchemeRole, normalizeAmountBound } from "./commission.service";
import {
  companyKeepsPaise,
  computeProviderIncomePaise,
  inSlab,
  percentOfPaiseHalfUp,
  percentToScaled,
  providerReceivablePaise,
  resolveRoleGross,
  splitFeeGstPaise,
  type RuleType,
} from "./rateCard.math";
import { PROVIDER_COST_INPUT_GST_PERCENT, referenceFor, type ProviderCostLine } from "./rateCard.reference";
import {
  loadRateConfig,
  pickProviderIncomeRule,
  roleDefaultFor,
  type RateConfig,
} from "./rateCard.config";

const SCHEME_ROLES = ["retailer", "distributor", "super_distributor"] as const;
type SchemeRole = (typeof SCHEME_ROLES)[number];

/** Preview sample when a slab has no bounds (e.g. ₹2,000 cash withdrawal). */
const DEFAULT_SAMPLE_AMOUNT = "2000.00";
/** Customer fee is charged to the transacting agent — retailers in practice. */
const FEE_PAYER_ROLE: UserRole = "retailer";

type ChargeRow = {
  id: string;
  serviceId: string;
  providerId: string | null;
  role: UserRole | null;
  ruleType: RuleType;
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
  effectiveFrom: Date;
};

type SplitContext = {
  cfg: RateConfig;
  charges: ChargeRow[];
  tax: ResolvedTaxConfig;
  tenantTax: TenantTaxDefaults;
  costs: ProviderCostLine[];
};

function taxView(tax: ResolvedTaxConfig) {
  return {
    configId: tax.configId,
    source: tax.source,
    tdsApplies: tax.tdsApplies,
    tdsPercent: tax.tdsPercent,
    gstOnFeeApplies: tax.gstOnFeeApplies,
    gstOnFeePercent: tax.gstOnFeePercent,
    gstOnFeeInclusive: tax.gstOnFeeInclusive,
  };
}

function tenantTaxView(t: TenantTaxDefaults) {
  return {
    ...taxView(t),
    providerOutputGstPercent: t.providerOutputGstPercent,
    providerTdsPercent: t.providerTdsPercent,
  };
}

// ── Shared math (rate card rows + preview use the same path as the live payout) ──

function pickCharge(charges: ChargeRow[], serviceId: string, providerId: string | null, amountPaise: number) {
  // Same precedence as resolveCustomerFee: provider-specific (+4) and role-specific (+2) win;
  // ties go to the newest effective_from.
  const sorted = charges
    .filter((c) => c.serviceId === serviceId && inSlab(c, amountPaise))
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  let best: ChargeRow | null = null;
  let bestScore = -1;
  for (const c of sorted) {
    if (c.providerId !== null && c.providerId !== providerId) continue;
    if (c.role !== null && c.role !== FEE_PAYER_ROLE) continue;
    const score = (c.providerId !== null ? 4 : 0) + (c.role !== null ? 2 : 0);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function computeSplit(ctx: SplitContext, serviceId: string, providerId: string | null, amountPaise: number) {
  const incomeRule = pickProviderIncomeRule(ctx.cfg, serviceId, providerId, amountPaise);
  const providerIncomePaise = incomeRule ? computeProviderIncomePaise(incomeRule, amountPaise) : null;

  const roles = SCHEME_ROLES.map((role) => {
    const { share, rule } = roleDefaultFor(ctx.cfg, serviceId, providerId, role, amountPaise);
    const resolved = resolveRoleGross({
      amountPaise,
      providerIncomePaise,
      sharePercent: share?.sharePercent ?? null,
      fixedRule: rule,
    });
    const { netPaise, tdsPaise } = applyTdsToGrossPaise(resolved.grossPaise, ctx.tax);
    return {
      role,
      source: resolved.source,
      shareId: share?.id ?? null,
      sharePercent: share?.sharePercent ?? null,
      ruleId: rule?.id ?? null,
      ruleType: rule?.ruleType ?? null,
      ruleValue: rule?.value ?? null,
      grossPaise: resolved.grossPaise,
      tdsPaise,
      netPaise,
    };
  });

  const charge = pickCharge(ctx.charges, serviceId, providerId, amountPaise);
  const feeChargedPaise = charge
    ? Number(computeCustomerFeePaise(charge.ruleType, charge.value, BigInt(amountPaise)))
    : 0;
  // Same split the live debit stores: base fee (company revenue) + GST on it (owed to government).
  const { baseFeePaise, gstPaise: feeGstPaise } = splitFeeGstPaise(feeChargedPaise, {
    applies: ctx.tax.gstOnFeeApplies,
    percent: String(ctx.tax.gstOnFeePercent),
    inclusive: ctx.tax.gstOnFeeInclusive,
  });

  const totalGrossPaise = roles.reduce((s, r) => s + r.grossPaise, 0);
  const totalTdsPaise = roles.reduce((s, r) => s + r.tdsPaise, 0);
  const totalNetPaise = roles.reduce((s, r) => s + r.netPaise, 0);
  const company = companyKeepsPaise({ providerIncomePaise, customerFeePaise: baseFeePaise, totalGrossPaise });

  const receivable =
    providerIncomePaise != null
      ? providerReceivablePaise(providerIncomePaise, {
          outputGstPercent: String(ctx.tenantTax.providerOutputGstPercent),
          tdsPercent: String(ctx.tenantTax.providerTdsPercent),
        })
      : null;

  const providerCosts = ctx.costs.map((c) => {
    const costPaise = c.amount != null ? toPaise(c.amount) : null;
    return {
      label: c.label,
      amount: c.amount,
      perTxn: c.perTxn,
      gstIncluded: c.gstIncluded,
      inputGst:
        costPaise != null && !c.gstIncluded
          ? fromPaise(percentOfPaiseHalfUp(costPaise, PROVIDER_COST_INPUT_GST_PERCENT))
          : null,
    };
  });
  const perTxnCostPaise = ctx.costs.reduce(
    (s, c) => s + (c.perTxn && c.amount != null ? toPaise(c.amount) : 0),
    0,
  );
  const keepsAfterCostsPaise = company.companyKeepsPaise - perTxnCostPaise;

  return {
    amount: fromPaise(amountPaise),
    providerIncome: providerIncomePaise != null ? fromPaise(providerIncomePaise) : null,
    providerIncomeRuleId: incomeRule?.id ?? null,
    providerGst: receivable ? fromPaise(receivable.gstPaise) : null,
    providerTds: receivable ? fromPaise(receivable.tdsPaise) : null,
    providerNetReceivable: receivable ? fromPaise(receivable.netPaise) : null,
    customerFeeCharged: fromPaise(feeChargedPaise),
    customerFee: fromPaise(baseFeePaise),
    customerFeeGst: fromPaise(feeGstPaise),
    gstOnFeeInclusive: ctx.tax.gstOnFeeInclusive,
    customerPays: fromPaise(amountPaise + baseFeePaise + feeGstPaise),
    roles: roles.map((r) => ({
      role: r.role,
      source: r.source,
      shareId: r.shareId,
      sharePercent: r.sharePercent,
      ruleId: r.ruleId,
      ruleType: r.ruleType,
      ruleValue: r.ruleValue,
      gross: fromPaise(r.grossPaise),
      tds: fromPaise(r.tdsPaise),
      net: fromPaise(r.netPaise),
    })),
    totalGross: fromPaise(totalGrossPaise),
    totalTds: fromPaise(totalTdsPaise),
    totalNet: fromPaise(totalNetPaise),
    companyKeeps: fromPaise(company.companyKeepsPaise),
    underwater: company.underwater,
    providerCosts,
    companyKeepsAfterCosts: fromPaise(keepsAfterCostsPaise),
    missingRoles: roles.filter((r) => r.source === "none").map((r) => r.role),
  };
}

async function loadCharges(tenantId: string, serviceIds: string[] | null, at: Date): Promise<ChargeRow[]> {
  const rows = await db
    .select({
      id: serviceCharges.id,
      serviceId: serviceCharges.serviceId,
      providerId: serviceCharges.providerId,
      role: serviceCharges.role,
      ruleType: serviceCharges.ruleType,
      value: serviceCharges.value,
      minAmount: serviceCharges.minAmount,
      maxAmount: serviceCharges.maxAmount,
      effectiveFrom: serviceCharges.effectiveFrom,
    })
    .from(serviceCharges)
    .where(
      and(
        eq(serviceCharges.tenantId, tenantId),
        eq(serviceCharges.isActive, true),
        lte(serviceCharges.effectiveFrom, at),
        or(isNull(serviceCharges.effectiveTo), gt(serviceCharges.effectiveTo, at)),
        serviceIds ? inArray(serviceCharges.serviceId, serviceIds) : undefined,
      ),
    );
  return rows.map((r) => ({
    ...r,
    value: String(r.value),
    minAmount: r.minAmount != null ? String(r.minAmount) : null,
    maxAmount: r.maxAmount != null ? String(r.maxAmount) : null,
  }));
}

function parseAmount(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new HttpError(400, "Amount must be a positive number", "INVALID_AMOUNT");
  }
  return toPaise(n.toFixed(2));
}

async function assertServiceExists(serviceId: string) {
  const [row] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1);
  if (!row) throw new HttpError(400, "Service not found. Pick a service from the list.", "INVALID_SERVICE");
}

async function assertProviderExists(providerId: string | null | undefined) {
  if (!providerId) return;
  const [row] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).limit(1);
  if (!row) throw new HttpError(400, "Provider not found. Pick a provider or All providers.", "INVALID_PROVIDER");
}

function requireReason(reason: string | null | undefined): string {
  const r = reason?.trim() ?? "";
  if (r.length < 3) {
    throw new HttpError(400, "Enter a reason for this change (at least 3 characters)", "REASON_REQUIRED");
  }
  return r;
}

function parseEffectiveFrom(raw: string | null | undefined): Date {
  if (raw === undefined || raw === null || String(raw).trim() === "") return new Date();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, "Effective from must be a valid date", "INVALID_DATE");
  }
  return d;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Preview sample inside a slab: its upper bound, else its lower bound, else ₹2,000 within service limits. */
function slabSampleAmount(
  slab: { minAmount: string | null; maxAmount: string | null },
  service: { minAmount: string | null; maxAmount: string | null },
): number {
  if (slab.maxAmount != null) return toPaise(slab.maxAmount);
  if (slab.minAmount != null) return toPaise(slab.minAmount);
  let sample = toPaise(DEFAULT_SAMPLE_AMOUNT);
  if (service.maxAmount != null) sample = Math.min(sample, toPaise(service.maxAmount));
  if (service.minAmount != null) sample = Math.max(sample, toPaise(service.minAmount));
  return sample;
}

/** Agent-paid checks that never pay commission; listing them would flag every role as ₹0. */
const NO_COMMISSION_SERVICE_CODES = ["BANK_NAME_CHECK", "BANK_PENNY_DROP"];

/** GET /admin/rate-card — one row per active service; slab rows with resolved ₹ per role. */
export async function getRateCard(opts?: { providerId?: string | null }) {
  const providerId = opts?.providerId || null;
  await assertProviderExists(providerId);
  const now = new Date();
  const tenantId = await resolveTenantId();

  const serviceRows = await db
    .select({
      id: services.id,
      code: services.code,
      name: services.name,
      categoryName: serviceCategories.name,
      minAmount: services.minAmount,
      maxAmount: services.maxAmount,
    })
    .from(services)
    .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(and(eq(services.isActive, true), notInArray(services.code, NO_COMMISSION_SERVICE_CODES)))
    .orderBy(asc(serviceCategories.displayOrder), asc(services.displayOrder));

  const [cfg, charges, taxes, tenantTax, providerRows] = await Promise.all([
    loadRateConfig(null, now),
    loadCharges(tenantId, null, now),
    Promise.all(serviceRows.map((s) => resolveTaxForService(tenantId, s.id, now))),
    getTenantTaxDefaults(tenantId, now),
    db
      .select({ id: providers.id, code: providers.code, name: providers.name })
      .from(providers)
      .orderBy(asc(providers.name)),
  ]);

  const inScope = (r: { providerId: string | null }) => r.providerId === null || r.providerId === providerId;

  const rows = serviceRows.map((s, i) => {
    const tax = taxes[i]!;
    const reference = referenceFor({ code: s.code, name: s.name });
    const ctx: SplitContext = { cfg, charges, tax, tenantTax, costs: reference?.costs ?? [] };
    const service = {
      minAmount: s.minAmount != null ? String(s.minAmount) : null,
      maxAmount: s.maxAmount != null ? String(s.maxAmount) : null,
    };

    const incomeRules = cfg.payoutRules.filter((r) => r.serviceId === s.id && inScope(r));
    const fixedRules = cfg.rules.filter((r) => r.serviceId === s.id && inScope(r));
    const feeRules = charges.filter((c) => c.serviceId === s.id && inScope(c));

    const slabKeys = new Map<string, { minAmount: string | null; maxAmount: string | null }>();
    for (const r of [...incomeRules, ...fixedRules, ...feeRules]) {
      if (r.minAmount == null && r.maxAmount == null) continue;
      slabKeys.set(`${r.minAmount ?? ""}|${r.maxAmount ?? ""}`, { minAmount: r.minAmount, maxAmount: r.maxAmount });
    }
    const slabBounds =
      slabKeys.size > 0
        ? [...slabKeys.values()].sort(
            (a, b) =>
              (a.minAmount != null ? toPaise(a.minAmount) : -1) - (b.minAmount != null ? toPaise(b.minAmount) : -1),
          )
        : [{ minAmount: null, maxAmount: null }];

    const shares = Object.fromEntries(
      SCHEME_ROLES.map((role) => {
        const { share } = roleDefaultFor(cfg, s.id, providerId, role, 0);
        return [
          role,
          share
            ? {
                id: share.id,
                providerId: share.providerId,
                sharePercent: share.sharePercent,
                effectiveFrom: share.effectiveFrom.toISOString(),
              }
            : null,
        ];
      }),
    ) as Record<SchemeRole, { id: string; providerId: string | null; sharePercent: string; effectiveFrom: string } | null>;
    const shareTotalScaled = SCHEME_ROLES.reduce(
      (sum, role) => sum + (shares[role] ? percentToScaled(shares[role]!.sharePercent) : 0),
      0,
    );

    return {
      serviceId: s.id,
      serviceCode: s.code,
      serviceName: s.name,
      categoryName: s.categoryName,
      shares,
      shareTotalPercent: (shareTotalScaled / 10_000).toFixed(4),
      providerIncomeRules: incomeRules.map((r) => ({
        id: r.id,
        providerId: r.providerId,
        ruleType: r.ruleType,
        value: r.value,
        capAmount: r.capAmount,
        minAmount: r.minAmount,
        maxAmount: r.maxAmount,
        effectiveFrom: r.effectiveFrom.toISOString(),
      })),
      customerFeeRules: feeRules.map((c) => ({
        id: c.id,
        providerId: c.providerId,
        role: c.role,
        ruleType: c.ruleType,
        value: c.value,
        minAmount: c.minAmount,
        maxAmount: c.maxAmount,
        effectiveFrom: c.effectiveFrom.toISOString(),
      })),
      fixedRules: fixedRules.map((r) => ({
        id: r.id,
        providerId: r.providerId,
        role: r.role,
        ruleType: r.ruleType,
        value: r.value,
        minAmount: r.minAmount,
        maxAmount: r.maxAmount,
      })),
      tax: taxView(tax),
      reference,
      slabs: slabBounds.map((b) => ({
        minAmount: b.minAmount,
        maxAmount: b.maxAmount,
        sampleAmount: fromPaise(slabSampleAmount(b, service)),
        ...computeSplit(ctx, s.id, providerId, slabSampleAmount(b, service)),
      })),
    };
  });

  return {
    providerId,
    at: now.toISOString(),
    providers: providerRows,
    tenantTax: tenantTaxView(tenantTax),
    services: rows,
  };
}

/** POST /admin/rate-card/preview — role-default split for one amount (no per-agent overrides). */
export async function previewRateCard(input: { serviceId: string; amount: string; providerId?: string | null }) {
  await assertServiceExists(input.serviceId);
  const providerId = input.providerId || null;
  await assertProviderExists(providerId);
  const amountPaise = parseAmount(input.amount);
  const now = new Date();
  const tenantId = await resolveTenantId();

  const [cfg, charges, tax, tenantTax, [svc]] = await Promise.all([
    loadRateConfig([input.serviceId], now),
    loadCharges(tenantId, [input.serviceId], now),
    resolveTaxForService(tenantId, input.serviceId, now),
    getTenantTaxDefaults(tenantId, now),
    db.select({ code: services.code, name: services.name }).from(services).where(eq(services.id, input.serviceId)).limit(1),
  ]);
  const costs = svc ? (referenceFor(svc)?.costs ?? []) : [];

  return {
    serviceId: input.serviceId,
    providerId,
    tax: taxView(tax),
    providerTax: {
      outputGstPercent: tenantTax.providerOutputGstPercent,
      tdsPercent: tenantTax.providerTdsPercent,
    },
    ...computeSplit({ cfg, charges, tax, tenantTax, costs }, input.serviceId, providerId, amountPaise),
  };
}

// ── Writes (versioned: a new row closes the open one at its effective_from) ──────

export type ShareInput = {
  serviceId: string;
  providerId?: string | null;
  role: string;
  sharePercent: string;
  effectiveFrom?: string | null;
  reason?: string | null;
};

function shareSnapshot(r: typeof commissionShares.$inferSelect): Record<string, unknown> {
  return {
    serviceId: r.serviceId,
    providerId: r.providerId,
    role: r.role,
    sharePercent: String(r.sharePercent),
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    isActive: r.isActive,
  };
}

export async function setCommissionShare(adminId: string, input: ShareInput) {
  const reason = requireReason(input.reason);
  if (!isSchemeRole(input.role)) {
    throw new HttpError(400, "Role must be retailer, distributor, or super_distributor", "INVALID_ROLE");
  }
  const role = input.role;
  await assertServiceExists(input.serviceId);
  const providerId = input.providerId || null;
  await assertProviderExists(providerId);

  const pct = Number(input.sharePercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new HttpError(400, "Share must be a number from 0 to 100", "INVALID_SHARE_PERCENT");
  }
  const sharePercent = pct.toFixed(4);
  const effectiveFrom = parseEffectiveFrom(input.effectiveFrom);
  await assertCommissionMonthUnlocked([effectiveFrom]);

  const sameScope = and(
    eq(commissionShares.serviceId, input.serviceId),
    providerId ? eq(commissionShares.providerId, providerId) : isNull(commissionShares.providerId),
    eq(commissionShares.role, role),
    eq(commissionShares.isActive, true),
    isNull(commissionShares.effectiveTo),
    lte(commissionShares.effectiveFrom, effectiveFrom),
  );

  const { previous, created } = await db.transaction(async (tx) => {
    const prev = await tx.select().from(commissionShares).where(sameScope);
    if (prev.length > 0) {
      await tx.update(commissionShares).set({ effectiveTo: effectiveFrom }).where(sameScope);
    }
    const [row] = await tx
      .insert(commissionShares)
      .values({ serviceId: input.serviceId, providerId, role, sharePercent, effectiveFrom })
      .returning();
    return { previous: prev[0] ?? null, created: row };
  });
  if (!created) throw new HttpError(500, "Share was not saved. Try again.", "SHARE_CREATE_FAILED");

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_share_set",
    entityType: "commission_share",
    entityId: created.id,
    metadata: { serviceId: input.serviceId, providerId, role, sharePercent },
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "share",
    entityId: created.id,
    serviceId: input.serviceId,
    before: previous ? shareSnapshot(previous) : null,
    after: shareSnapshot(created),
    reason,
  });

  const cfg = await loadRateConfig([input.serviceId], effectiveFrom);
  const totalScaled = SCHEME_ROLES.reduce((sum, r) => {
    const { share } = roleDefaultFor(cfg, input.serviceId, providerId, r, 0);
    return sum + (share ? percentToScaled(share.sharePercent) : 0);
  }, 0);
  const shareTotalPercent = (totalScaled / 10_000).toFixed(4);

  return {
    share: shareSnapshot(created),
    id: created.id,
    shareTotalPercent,
    warning:
      totalScaled > 1_000_000
        ? `Shares for this service add up to ${Number(shareTotalPercent)}% — more than the provider pays. Company will lose money on every txn.`
        : null,
  };
}

export async function endCommissionShare(adminId: string, id: string, reasonRaw?: string | null) {
  const reason = requireReason(reasonRaw);
  const [existing] = await db.select().from(commissionShares).where(eq(commissionShares.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "Share not found. Refresh the rate card.", "SHARE_NOT_FOUND");
  const now = new Date();
  if (!existing.isActive || (existing.effectiveTo && existing.effectiveTo <= now)) {
    throw new HttpError(409, "This share has already ended", "SHARE_ALREADY_ENDED");
  }
  await assertCommissionMonthUnlocked([]);

  // A scheduled (future) share is cancelled; a running one stops now and keeps its history.
  const patch = existing.effectiveFrom > now ? { isActive: false } : { effectiveTo: now };
  const [updated] = await db.update(commissionShares).set(patch).where(eq(commissionShares.id, id)).returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.commission_share_end",
    entityType: "commission_share",
    entityId: id,
    metadata: {},
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "share",
    entityId: id,
    serviceId: existing.serviceId,
    before: shareSnapshot(existing),
    after: updated ? shareSnapshot(updated) : null,
    reason,
  });
  return { id, ended: true };
}

export type ProviderIncomeInput = {
  serviceId: string;
  providerId?: string | null;
  ruleType: RuleType;
  value: string;
  capAmount?: string | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  effectiveFrom?: string | null;
  reason?: string | null;
};

function providerIncomeSnapshot(r: typeof providerPayoutRules.$inferSelect): Record<string, unknown> {
  return {
    serviceId: r.serviceId,
    providerId: r.providerId,
    ruleType: r.ruleType,
    value: String(r.value),
    capAmount: r.capAmount != null ? String(r.capAmount) : null,
    minAmount: r.minAmount != null ? String(r.minAmount) : null,
    maxAmount: r.maxAmount != null ? String(r.maxAmount) : null,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    isActive: r.isActive,
  };
}

export async function setProviderIncomeRule(adminId: string, input: ProviderIncomeInput) {
  const reason = requireReason(input.reason);
  await assertServiceExists(input.serviceId);
  const providerId = input.providerId || null;
  await assertProviderExists(providerId);

  const valueNum = Number(input.value);
  if (!Number.isFinite(valueNum) || valueNum < 0) {
    throw new HttpError(400, "Provider income must be a non-negative number", "INVALID_VALUE");
  }
  if (input.ruleType === "percentage" && valueNum > 100) {
    throw new HttpError(400, "Provider income percentage cannot exceed 100", "INVALID_VALUE");
  }
  const value = valueNum.toFixed(4);

  let capAmount: string | null = null;
  if (input.capAmount != null && String(input.capAmount).trim() !== "") {
    if (input.ruleType !== "percentage") {
      throw new HttpError(400, "Cap applies only to percentage provider income — clear the cap for flat ₹", "INVALID_CAP");
    }
    const cap = Number(input.capAmount);
    if (!Number.isFinite(cap) || cap <= 0) {
      throw new HttpError(400, "Cap must be a positive amount in ₹", "INVALID_CAP");
    }
    capAmount = cap.toFixed(2);
  }

  const minAmount = normalizeAmountBound(input.minAmount, "minAmount");
  const maxAmount = normalizeAmountBound(input.maxAmount, "maxAmount");
  if (minAmount != null && maxAmount != null && Number(minAmount) > Number(maxAmount)) {
    throw new HttpError(400, "Min amount cannot be greater than max amount", "INVALID_AMOUNT");
  }

  const effectiveFrom = parseEffectiveFrom(input.effectiveFrom);
  await assertCommissionMonthUnlocked([effectiveFrom]);

  const sameScope = and(
    eq(providerPayoutRules.serviceId, input.serviceId),
    providerId ? eq(providerPayoutRules.providerId, providerId) : isNull(providerPayoutRules.providerId),
    minAmount != null ? eq(providerPayoutRules.minAmount, minAmount) : isNull(providerPayoutRules.minAmount),
    maxAmount != null ? eq(providerPayoutRules.maxAmount, maxAmount) : isNull(providerPayoutRules.maxAmount),
    eq(providerPayoutRules.isActive, true),
    isNull(providerPayoutRules.effectiveTo),
    lte(providerPayoutRules.effectiveFrom, effectiveFrom),
  );

  const { previous, created } = await db.transaction(async (tx) => {
    const prev = await tx.select().from(providerPayoutRules).where(sameScope);
    if (prev.length > 0) {
      await tx.update(providerPayoutRules).set({ effectiveTo: effectiveFrom }).where(sameScope);
    }
    const [row] = await tx
      .insert(providerPayoutRules)
      .values({
        serviceId: input.serviceId,
        providerId,
        ruleType: input.ruleType,
        value,
        capAmount,
        minAmount,
        maxAmount,
        effectiveFrom,
      })
      .returning();
    return { previous: prev[0] ?? null, created: row };
  });
  if (!created) throw new HttpError(500, "Provider income was not saved. Try again.", "PROVIDER_INCOME_CREATE_FAILED");

  await insertAuditLog({
    userId: adminId,
    action: "admin.provider_income_set",
    entityType: "provider_payout_rule",
    entityId: created.id,
    metadata: { serviceId: input.serviceId, providerId, ruleType: input.ruleType, value, capAmount },
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "provider_income",
    entityId: created.id,
    serviceId: input.serviceId,
    before: previous ? providerIncomeSnapshot(previous) : null,
    after: providerIncomeSnapshot(created),
    reason,
  });

  return { id: created.id, rule: providerIncomeSnapshot(created) };
}

export async function endProviderIncomeRule(adminId: string, id: string, reasonRaw?: string | null) {
  const reason = requireReason(reasonRaw);
  const [existing] = await db.select().from(providerPayoutRules).where(eq(providerPayoutRules.id, id)).limit(1);
  if (!existing) {
    throw new HttpError(404, "Provider income rule not found. Refresh the rate card.", "PROVIDER_INCOME_NOT_FOUND");
  }
  const now = new Date();
  if (!existing.isActive || (existing.effectiveTo && existing.effectiveTo <= now)) {
    throw new HttpError(409, "This provider income rule has already ended", "PROVIDER_INCOME_ALREADY_ENDED");
  }
  await assertCommissionMonthUnlocked([]);

  const patch = existing.effectiveFrom > now ? { isActive: false } : { effectiveTo: now };
  const [updated] = await db
    .update(providerPayoutRules)
    .set(patch)
    .where(eq(providerPayoutRules.id, id))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.provider_income_end",
    entityType: "provider_payout_rule",
    entityId: id,
    metadata: {},
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "provider_income",
    entityId: id,
    serviceId: existing.serviceId,
    before: providerIncomeSnapshot(existing),
    after: updated ? providerIncomeSnapshot(updated) : null,
    reason,
  });
  return { id, ended: true };
}

// ── Customer fee (same service_charges rows as Platform Control → Service charges) ──

export type CustomerFeeInput = {
  serviceId: string;
  providerId?: string | null;
  /** null = all roles. Editing an existing row keeps its role. */
  role?: string | null;
  ruleType: RuleType;
  value: string;
  minAmount?: string | null;
  maxAmount?: string | null;
  effectiveFrom?: string | null;
  reason?: string | null;
};

function customerFeeSnapshot(r: typeof serviceCharges.$inferSelect): Record<string, unknown> {
  return {
    serviceId: r.serviceId,
    providerId: r.providerId,
    role: r.role,
    ruleType: r.ruleType,
    value: String(r.value),
    minAmount: r.minAmount != null ? String(r.minAmount) : null,
    maxAmount: r.maxAmount != null ? String(r.maxAmount) : null,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    isActive: r.isActive,
  };
}

/** Versioned write: closes the open fee row for the same service / provider / role / slab, inserts the new one. */
export async function setCustomerFeeRule(adminId: string, input: CustomerFeeInput) {
  const reason = requireReason(input.reason);
  await assertServiceExists(input.serviceId);
  const providerId = input.providerId || null;
  await assertProviderExists(providerId);
  const role = input.role || null;
  if (role !== null && !isSchemeRole(role)) {
    throw new HttpError(400, "Role must be retailer, distributor, super_distributor, or all roles", "INVALID_ROLE");
  }

  const value = validateChargeValue(input.ruleType, input.value);
  const minAmount = normalizeAmountBound(input.minAmount, "minAmount");
  const maxAmount = normalizeAmountBound(input.maxAmount, "maxAmount");
  if (minAmount != null && maxAmount != null && Number(minAmount) > Number(maxAmount)) {
    throw new HttpError(400, "Min amount cannot be greater than max amount", "INVALID_AMOUNT");
  }
  const effectiveFrom = parseEffectiveFrom(input.effectiveFrom);
  await assertCommissionMonthUnlocked([effectiveFrom]);
  const tenantId = await resolveTenantId();

  const sameScope = and(
    eq(serviceCharges.tenantId, tenantId),
    eq(serviceCharges.serviceId, input.serviceId),
    providerId ? eq(serviceCharges.providerId, providerId) : isNull(serviceCharges.providerId),
    role ? eq(serviceCharges.role, role) : isNull(serviceCharges.role),
    minAmount != null ? eq(serviceCharges.minAmount, minAmount) : isNull(serviceCharges.minAmount),
    maxAmount != null ? eq(serviceCharges.maxAmount, maxAmount) : isNull(serviceCharges.maxAmount),
    eq(serviceCharges.isActive, true),
    or(isNull(serviceCharges.effectiveTo), gt(serviceCharges.effectiveTo, effectiveFrom)),
    lte(serviceCharges.effectiveFrom, effectiveFrom),
  );

  const { previous, created } = await db.transaction(async (tx) => {
    const prev = await tx.select().from(serviceCharges).where(sameScope);
    if (prev.length > 0) {
      await tx.update(serviceCharges).set({ effectiveTo: effectiveFrom }).where(sameScope);
    }
    const [row] = await tx
      .insert(serviceCharges)
      .values({
        tenantId,
        serviceId: input.serviceId,
        providerId,
        role: role as SchemeRole | null,
        ruleType: input.ruleType,
        value,
        minAmount,
        maxAmount,
        effectiveFrom,
      })
      .returning();
    return { previous: prev[0] ?? null, created: row };
  });
  if (!created) throw new HttpError(500, "Customer fee was not saved. Try again.", "CUSTOMER_FEE_CREATE_FAILED");

  await insertAuditLog({
    userId: adminId,
    action: "admin.service_charge_create",
    entityType: "service_charge",
    entityId: created.id,
    metadata: { serviceId: input.serviceId, providerId, role, ruleType: input.ruleType, value, via: "rate_card" },
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "customer_fee",
    entityId: created.id,
    serviceId: input.serviceId,
    before: previous ? customerFeeSnapshot(previous) : null,
    after: customerFeeSnapshot(created),
    reason,
  });
  return { id: created.id, rule: customerFeeSnapshot(created) };
}

export async function endCustomerFeeRule(adminId: string, id: string, reasonRaw?: string | null) {
  const reason = requireReason(reasonRaw);
  const [existing] = await db.select().from(serviceCharges).where(eq(serviceCharges.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "Customer fee not found. Refresh the rate card.", "CUSTOMER_FEE_NOT_FOUND");
  const now = new Date();
  if (!existing.isActive || (existing.effectiveTo && existing.effectiveTo <= now)) {
    throw new HttpError(409, "This customer fee has already ended", "CUSTOMER_FEE_ALREADY_ENDED");
  }
  await assertCommissionMonthUnlocked([]);

  const patch = existing.effectiveFrom > now ? { isActive: false } : { effectiveTo: now };
  const [updated] = await db.update(serviceCharges).set(patch).where(eq(serviceCharges.id, id)).returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.service_charge_end",
    entityType: "service_charge",
    entityId: id,
    metadata: { via: "rate_card" },
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "customer_fee",
    entityId: id,
    serviceId: existing.serviceId,
    before: customerFeeSnapshot(existing),
    after: updated ? customerFeeSnapshot(updated) : null,
    reason,
  });
  return { id, ended: true };
}

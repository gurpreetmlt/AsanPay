import { and, eq, gt, isNull, lte, or, desc } from "drizzle-orm";
import { db } from "../../db/postgres";
import { taxServiceConfigs, services } from "../../db/postgres/schema";
import { toPaise, fromPaise } from "../wallet/decimal";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { resolveTenantId } from "../fund-requests/tenant";
import { assertCommissionMonthUnlocked, recordRateChangeEvent } from "./commission.guards";
import { splitFeeGstPaise } from "./rateCard.math";

export type ResolvedTaxConfig = {
  configId: string | null;
  tdsApplies: boolean;
  tdsPercent: string;
  gstOnFeeApplies: boolean;
  gstOnFeePercent: string;
  gstOnFeeInclusive: boolean;
  source: "service" | "default" | "builtin";
};

export type TenantTaxDefaults = ResolvedTaxConfig & {
  providerOutputGstPercent: string;
  providerTdsPercent: string;
};

const BUILTIN: ResolvedTaxConfig = {
  configId: null,
  tdsApplies: true,
  tdsPercent: "2.0000",
  gstOnFeeApplies: false,
  gstOnFeePercent: "18.0000",
  gstOnFeeInclusive: false,
  source: "builtin",
};

const BUILTIN_PROVIDER = { providerOutputGstPercent: "18.0000", providerTdsPercent: "2.0000" };

const taxColumns = {
  configId: taxServiceConfigs.id,
  tdsApplies: taxServiceConfigs.tdsApplies,
  tdsPercent: taxServiceConfigs.tdsPercent,
  gstOnFeeApplies: taxServiceConfigs.gstOnFeeApplies,
  gstOnFeePercent: taxServiceConfigs.gstOnFeePercent,
  gstOnFeeInclusive: taxServiceConfigs.gstOnFeeInclusive,
};

function activeTaxWindow(tenantId: string, at: Date) {
  return and(
    eq(taxServiceConfigs.tenantId, tenantId),
    eq(taxServiceConfigs.isActive, true),
    lte(taxServiceConfigs.effectiveFrom, at),
    or(isNull(taxServiceConfigs.effectiveTo), gt(taxServiceConfigs.effectiveTo, at)),
  );
}

/** Tenant default row (service_id null) incl. provider-side GST / TDS, else builtin. */
export async function getTenantTaxDefaults(tenantId: string, at: Date = new Date()): Promise<TenantTaxDefaults> {
  const [row] = await db
    .select({
      ...taxColumns,
      providerOutputGstPercent: taxServiceConfigs.providerOutputGstPercent,
      providerTdsPercent: taxServiceConfigs.providerTdsPercent,
    })
    .from(taxServiceConfigs)
    .where(and(activeTaxWindow(tenantId, at), isNull(taxServiceConfigs.serviceId)))
    .orderBy(desc(taxServiceConfigs.effectiveFrom))
    .limit(1);
  if (row) return { ...row, source: "default" };
  return { ...BUILTIN, ...BUILTIN_PROVIDER };
}

/** Prefer service-specific active row, else tenant default (service_id null), else builtin draft. */
export async function resolveTaxForService(
  tenantId: string,
  serviceId: string,
  at: Date = new Date(),
): Promise<ResolvedTaxConfig> {
  const activeWindow = activeTaxWindow(tenantId, at);

  const [serviceRow] = await db
    .select(taxColumns)
    .from(taxServiceConfigs)
    .where(and(activeWindow, eq(taxServiceConfigs.serviceId, serviceId)))
    .orderBy(desc(taxServiceConfigs.effectiveFrom))
    .limit(1);
  if (serviceRow) {
    return { ...serviceRow, source: "service" };
  }

  const [defaultRow] = await db
    .select(taxColumns)
    .from(taxServiceConfigs)
    .where(and(activeWindow, isNull(taxServiceConfigs.serviceId)))
    .orderBy(desc(taxServiceConfigs.effectiveFrom))
    .limit(1);
  if (defaultRow) {
    return { ...defaultRow, source: "default" };
  }

  return BUILTIN;
}

/** TDS on gross commission paise. Returns net + tds (floor paise). */
export function applyTdsToGrossPaise(
  grossPaise: number,
  cfg: Pick<ResolvedTaxConfig, "tdsApplies" | "tdsPercent">,
): { grossPaise: number; tdsPaise: number; netPaise: number; tdsPercent: string } {
  if (!cfg.tdsApplies || grossPaise <= 0) {
    return { grossPaise, tdsPaise: 0, netPaise: grossPaise, tdsPercent: "0.0000" };
  }
  const pct = Number(cfg.tdsPercent);
  if (!Number.isFinite(pct) || pct <= 0) {
    return { grossPaise, tdsPaise: 0, netPaise: grossPaise, tdsPercent: "0.0000" };
  }
  const tdsPaise = Math.floor((grossPaise * Math.round(pct * 10000)) / 1_000_000);
  const netPaise = Math.max(0, grossPaise - tdsPaise);
  return {
    grossPaise,
    tdsPaise,
    netPaise,
    tdsPercent: pct.toFixed(4),
  };
}

type FeeGstConfig = Pick<ResolvedTaxConfig, "gstOnFeeApplies" | "gstOnFeePercent"> & {
  gstOnFeeInclusive?: boolean;
};

/**
 * Configured fee → base fee + GST (rupees). On top: base = fee, GST added. Inclusive: GST is carved
 * out of the fee, so base + GST = configured fee and the customer pays no extra.
 */
export function splitFeeGstRupees(feeRupees: string, cfg: FeeGstConfig): { fee: string; gst: string } {
  const feePaise = toPaise(feeRupees);
  const { baseFeePaise, gstPaise } = splitFeeGstPaise(feePaise, {
    applies: cfg.gstOnFeeApplies,
    percent: String(cfg.gstOnFeePercent),
    inclusive: cfg.gstOnFeeInclusive === true,
  });
  return { fee: fromPaise(baseFeePaise), gst: fromPaise(gstPaise) };
}

/** GST on a configured fee (on top: fee × %; inclusive: fee − fee ÷ (1 + %)). */
export function computeFeeGstRupees(feeRupees: string, cfg: FeeGstConfig): string {
  return splitFeeGstRupees(feeRupees, cfg).gst;
}

export async function listTaxConfigs(tenantId: string) {
  const rows = await db
    .select({
      id: taxServiceConfigs.id,
      tenantId: taxServiceConfigs.tenantId,
      serviceId: taxServiceConfigs.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      tdsApplies: taxServiceConfigs.tdsApplies,
      tdsPercent: taxServiceConfigs.tdsPercent,
      gstOnFeeApplies: taxServiceConfigs.gstOnFeeApplies,
      gstOnFeePercent: taxServiceConfigs.gstOnFeePercent,
      gstOnFeeInclusive: taxServiceConfigs.gstOnFeeInclusive,
      effectiveFrom: taxServiceConfigs.effectiveFrom,
      effectiveTo: taxServiceConfigs.effectiveTo,
      isActive: taxServiceConfigs.isActive,
    })
    .from(taxServiceConfigs)
    .leftJoin(services, eq(taxServiceConfigs.serviceId, services.id))
    .where(eq(taxServiceConfigs.tenantId, tenantId))
    .orderBy(desc(taxServiceConfigs.effectiveFrom));
  return rows;
}

export async function updateTaxConfig(
  id: string,
  patch: {
    tdsApplies?: boolean;
    tdsPercent?: string;
    gstOnFeeApplies?: boolean;
    gstOnFeePercent?: string;
    isActive?: boolean;
  },
) {
  const [existing] = await db.select().from(taxServiceConfigs).where(eq(taxServiceConfigs.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "Tax config not found", "TAX_CONFIG_NOT_FOUND");

  const next: Partial<typeof taxServiceConfigs.$inferInsert> = { updatedAt: new Date() };
  if (patch.tdsApplies !== undefined) next.tdsApplies = patch.tdsApplies;
  if (patch.gstOnFeeApplies !== undefined) next.gstOnFeeApplies = patch.gstOnFeeApplies;
  if (patch.isActive !== undefined) next.isActive = patch.isActive;
  if (patch.tdsPercent !== undefined) {
    const n = Number(patch.tdsPercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new HttpError(400, "TDS percent must be between 0 and 100", "INVALID_TDS_PERCENT");
    }
    next.tdsPercent = n.toFixed(4);
  }
  if (patch.gstOnFeePercent !== undefined) {
    const n = Number(patch.gstOnFeePercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new HttpError(400, "GST percent must be between 0 and 100", "INVALID_GST_PERCENT");
    }
    next.gstOnFeePercent = n.toFixed(4);
  }

  const [updated] = await db
    .update(taxServiceConfigs)
    .set(next)
    .where(eq(taxServiceConfigs.id, id))
    .returning();
  return updated;
}

// ── Rate card tax writes (versioned: a new row closes the open one at its effective_from) ──

export type TaxConfigInput = {
  /** null = tenant default row */
  serviceId: string | null;
  tdsApplies: boolean;
  tdsPercent: string;
  gstOnFeeApplies: boolean;
  gstOnFeePercent: string;
  gstOnFeeInclusive: boolean;
  /** Tenant row only. */
  providerOutputGstPercent?: string | null;
  /** Tenant row only. */
  providerTdsPercent?: string | null;
  effectiveFrom?: string | null;
  reason?: string | null;
};

function parseTaxPercent(raw: string | null | undefined, label: string, code: string): string {
  const n = Number(String(raw ?? "").trim());
  if (raw == null || String(raw).trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) {
    throw new HttpError(400, `${label} must be a number from 0 to 100`, code);
  }
  return n.toFixed(4);
}

function taxReason(raw: string | null | undefined): string {
  const r = raw?.trim() ?? "";
  if (r.length < 3) {
    throw new HttpError(400, "Enter a reason for this change (at least 3 characters)", "REASON_REQUIRED");
  }
  return r;
}

function taxSnapshot(r: typeof taxServiceConfigs.$inferSelect): Record<string, unknown> {
  return {
    serviceId: r.serviceId,
    tdsApplies: r.tdsApplies,
    tdsPercent: String(r.tdsPercent),
    gstOnFeeApplies: r.gstOnFeeApplies,
    gstOnFeePercent: String(r.gstOnFeePercent),
    gstOnFeeInclusive: r.gstOnFeeInclusive,
    ...(r.serviceId === null
      ? {
          providerOutputGstPercent: String(r.providerOutputGstPercent),
          providerTdsPercent: String(r.providerTdsPercent),
        }
      : {}),
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    isActive: r.isActive,
  };
}

/** Create / version the tax row for one service (or the tenant default when serviceId is null). */
export async function setTaxConfig(adminId: string, input: TaxConfigInput) {
  const reason = taxReason(input.reason);
  const serviceId = input.serviceId || null;
  if (serviceId) {
    const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1);
    if (!svc) throw new HttpError(400, "Service not found. Pick a service from the list.", "INVALID_SERVICE");
  }

  const tdsPercent = parseTaxPercent(input.tdsPercent, "Agent TDS %", "INVALID_TDS_PERCENT");
  const gstOnFeePercent = parseTaxPercent(input.gstOnFeePercent, "GST on fee %", "INVALID_GST_PERCENT");
  const tenantId = await resolveTenantId();
  const current = await getTenantTaxDefaults(tenantId);
  const providerOutputGstPercent =
    serviceId === null && input.providerOutputGstPercent != null
      ? parseTaxPercent(input.providerOutputGstPercent, "Output GST billed to provider %", "INVALID_PROVIDER_GST_PERCENT")
      : current.providerOutputGstPercent;
  const providerTdsPercent =
    serviceId === null && input.providerTdsPercent != null
      ? parseTaxPercent(input.providerTdsPercent, "TDS deducted by provider %", "INVALID_PROVIDER_TDS_PERCENT")
      : current.providerTdsPercent;

  let effectiveFrom = new Date();
  if (input.effectiveFrom != null && String(input.effectiveFrom).trim() !== "") {
    effectiveFrom = new Date(input.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new HttpError(400, "Effective from must be a valid date", "INVALID_DATE");
    }
  }
  await assertCommissionMonthUnlocked([effectiveFrom]);

  const sameScope = and(
    eq(taxServiceConfigs.tenantId, tenantId),
    serviceId ? eq(taxServiceConfigs.serviceId, serviceId) : isNull(taxServiceConfigs.serviceId),
    eq(taxServiceConfigs.isActive, true),
    isNull(taxServiceConfigs.effectiveTo),
    lte(taxServiceConfigs.effectiveFrom, effectiveFrom),
  );

  const { previous, created } = await db.transaction(async (tx) => {
    const prev = await tx.select().from(taxServiceConfigs).where(sameScope);
    if (prev.length > 0) {
      await tx.update(taxServiceConfigs).set({ effectiveTo: effectiveFrom, updatedAt: new Date() }).where(sameScope);
    }
    const [row] = await tx
      .insert(taxServiceConfigs)
      .values({
        tenantId,
        serviceId,
        tdsApplies: input.tdsApplies,
        tdsPercent,
        gstOnFeeApplies: input.gstOnFeeApplies,
        gstOnFeePercent,
        gstOnFeeInclusive: input.gstOnFeeInclusive,
        providerOutputGstPercent,
        providerTdsPercent,
        effectiveFrom,
      })
      .returning();
    return { previous: prev[0] ?? null, created: row };
  });
  if (!created) throw new HttpError(500, "Tax settings were not saved. Try again.", "TAX_CONFIG_CREATE_FAILED");

  await insertAuditLog({
    userId: adminId,
    action: "admin.tax_config_set",
    entityType: "tax_service_config",
    entityId: created.id,
    metadata: { serviceId, tdsPercent, gstOnFeePercent, gstOnFeeInclusive: input.gstOnFeeInclusive },
  });
  await recordRateChangeEvent({
    adminId,
    entityType: "tax_config",
    entityId: created.id,
    serviceId,
    before: previous ? taxSnapshot(previous) : null,
    after: taxSnapshot(created),
    reason,
  });
  return { id: created.id, config: taxSnapshot(created) };
}

/** "Use default": end the service-specific tax row(s) so the tenant default applies again. */
export async function resetServiceTax(adminId: string, serviceId: string, reasonRaw?: string | null) {
  const reason = taxReason(reasonRaw);
  const tenantId = await resolveTenantId();
  const now = new Date();
  const rows = await db
    .select()
    .from(taxServiceConfigs)
    .where(
      and(
        eq(taxServiceConfigs.tenantId, tenantId),
        eq(taxServiceConfigs.serviceId, serviceId),
        eq(taxServiceConfigs.isActive, true),
        or(isNull(taxServiceConfigs.effectiveTo), gt(taxServiceConfigs.effectiveTo, now)),
      ),
    );
  if (rows.length === 0) {
    throw new HttpError(409, "This service already uses the default tax settings", "TAX_ALREADY_DEFAULT");
  }
  await assertCommissionMonthUnlocked([]);

  for (const row of rows) {
    // A scheduled (future) row is cancelled; a running one stops now and keeps its history.
    const patch = row.effectiveFrom > now ? { isActive: false } : { effectiveTo: now };
    const [updated] = await db
      .update(taxServiceConfigs)
      .set({ ...patch, updatedAt: now })
      .where(eq(taxServiceConfigs.id, row.id))
      .returning();
    await recordRateChangeEvent({
      adminId,
      entityType: "tax_config",
      entityId: row.id,
      serviceId,
      before: taxSnapshot(row),
      after: updated ? taxSnapshot(updated) : null,
      reason,
    });
  }
  await insertAuditLog({
    userId: adminId,
    action: "admin.tax_config_reset",
    entityType: "tax_service_config",
    entityId: rows[0]!.id,
    metadata: { serviceId, ended: rows.length },
  });
  return { serviceId, ended: rows.length };
}

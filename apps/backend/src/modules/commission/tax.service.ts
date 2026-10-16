import { and, eq, gt, isNull, lte, or, desc } from "drizzle-orm";
import { db } from "../../db/postgres";
import { taxServiceConfigs, services } from "../../db/postgres/schema";
import { toPaise, fromPaise } from "../wallet/decimal";
import { HttpError } from "../../utils/httpError";

export type ResolvedTaxConfig = {
  tdsApplies: boolean;
  tdsPercent: string;
  gstOnFeeApplies: boolean;
  gstOnFeePercent: string;
  source: "service" | "default" | "builtin";
};

const BUILTIN: ResolvedTaxConfig = {
  tdsApplies: true,
  tdsPercent: "2.0000",
  gstOnFeeApplies: false,
  gstOnFeePercent: "18.0000",
  source: "builtin",
};

/** Prefer service-specific active row, else tenant default (service_id null), else builtin draft. */
export async function resolveTaxForService(
  tenantId: string,
  serviceId: string,
  at: Date = new Date(),
): Promise<ResolvedTaxConfig> {
  const activeWindow = and(
    eq(taxServiceConfigs.tenantId, tenantId),
    eq(taxServiceConfigs.isActive, true),
    lte(taxServiceConfigs.effectiveFrom, at),
    or(isNull(taxServiceConfigs.effectiveTo), gt(taxServiceConfigs.effectiveTo, at)),
  );

  const [serviceRow] = await db
    .select({
      tdsApplies: taxServiceConfigs.tdsApplies,
      tdsPercent: taxServiceConfigs.tdsPercent,
      gstOnFeeApplies: taxServiceConfigs.gstOnFeeApplies,
      gstOnFeePercent: taxServiceConfigs.gstOnFeePercent,
    })
    .from(taxServiceConfigs)
    .where(and(activeWindow, eq(taxServiceConfigs.serviceId, serviceId)))
    .orderBy(desc(taxServiceConfigs.effectiveFrom))
    .limit(1);
  if (serviceRow) {
    return { ...serviceRow, source: "service" };
  }

  const [defaultRow] = await db
    .select({
      tdsApplies: taxServiceConfigs.tdsApplies,
      tdsPercent: taxServiceConfigs.tdsPercent,
      gstOnFeeApplies: taxServiceConfigs.gstOnFeeApplies,
      gstOnFeePercent: taxServiceConfigs.gstOnFeePercent,
    })
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

/** GST exclusive on fee rupees string → gst rupees string. */
export function computeFeeGstRupees(
  feeRupees: string,
  cfg: Pick<ResolvedTaxConfig, "gstOnFeeApplies" | "gstOnFeePercent">,
): string {
  if (!cfg.gstOnFeeApplies) return "0.00";
  const feePaise = toPaise(feeRupees);
  if (feePaise <= 0) return "0.00";
  const pct = Number(cfg.gstOnFeePercent);
  if (!Number.isFinite(pct) || pct <= 0) return "0.00";
  const gstPaise = Math.floor((feePaise * Math.round(pct * 10000)) / 1_000_000);
  return fromPaise(gstPaise);
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

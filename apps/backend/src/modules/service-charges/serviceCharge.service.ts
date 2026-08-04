import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { serviceCharges, tenants, services, providers } from "../../db/postgres/schema";
import { rupeesToPaise, paiseToRupees, type Paise } from "../../core/money";
import type { UserRole } from "@asanpay/shared-types";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { env } from "../../config/env";

const SCHEME_ROLES = ["retailer", "distributor", "super_distributor"] as const;
type SchemeRole = (typeof SCHEME_ROLES)[number];
type RuleType = "flat" | "percentage";

export type ServiceChargeInput = {
  serviceId: string;
  providerId?: string | null;
  /** null = all roles */
  role?: SchemeRole | null;
  ruleType: RuleType;
  value: string;
  minAmount?: string | null;
  maxAmount?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
};

function isSchemeRole(role: string): role is SchemeRole {
  return (SCHEME_ROLES as readonly string[]).includes(role);
}

function validateChargeValue(ruleType: RuleType, valueRaw: string): string {
  const valueNum = Number(valueRaw);
  if (!Number.isFinite(valueNum) || valueNum < 0) {
    throw new HttpError(400, "Service charge value must be a non-negative number", "INVALID_VALUE");
  }
  if (ruleType === "percentage" && valueNum > 100) {
    throw new HttpError(400, "Percentage cannot exceed 100", "INVALID_VALUE");
  }
  const flatCap = env.MAX_FLAT_COMMISSION_RUPEES ?? 500;
  if (ruleType === "flat" && valueNum > flatCap) {
    throw new HttpError(400, `Flat service charge cannot exceed ₹${flatCap}`, "INVALID_VALUE");
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

function parseOptionalDate(raw: string | null | undefined, field: string): Date | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, `${field} must be a valid date`, "INVALID_DATE");
  }
  return d;
}

async function assertServiceExists(serviceId: string) {
  const [row] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1);
  if (!row) throw new HttpError(400, "Unknown service", "INVALID_SERVICE");
}

async function assertProviderExists(providerId: string | null | undefined) {
  if (!providerId) return;
  const [row] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).limit(1);
  if (!row) throw new HttpError(400, "Unknown provider", "INVALID_PROVIDER");
}

async function resolveTenantId(tenantCode?: string): Promise<string> {
  const code = tenantCode?.trim() || process.env.LEDGER_TENANT_CODE?.trim() || "ASANPAY";
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, code)).limit(1);
  if (!tenant) throw new HttpError(500, `Tenant ${code} not found`, "TENANT_NOT_FOUND");
  return tenant.id;
}

function normalizeRole(role: SchemeRole | null | undefined): SchemeRole | null {
  if (role === undefined || role === null) return null;
  if (!isSchemeRole(role)) {
    throw new HttpError(
      400,
      "Role must be retailer, distributor, super_distributor, or empty for all roles",
      "INVALID_ROLE",
    );
  }
  return role;
}

/**
 * Parse a non-negative decimal (e.g. rule value "1.5000" percent or flat rupees) as
 * integer fixed-point with `scale` fraction digits — no parseFloat.
 */
function decimalToScaledInt(raw: string, scale: number): bigint {
  const t = raw.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(t) || t === "" || t === ".") {
    throw new Error(`Not a valid decimal: ${JSON.stringify(raw)}`);
  }
  const [whole = "0", fracRaw = ""] = t.split(".");
  const frac = (fracRaw + "0".repeat(scale)).slice(0, scale);
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(frac || "0");
}

/**
 * flat → value is rupees of fee.
 * percentage → value is 0–100 percent of principal (up to 4 decimal places), floor to paise.
 */
export function computeCustomerFeePaise(
  ruleType: "flat" | "percentage",
  value: string,
  principalPaise: Paise,
): Paise {
  if (ruleType === "flat") {
    const fee = rupeesToPaise(value);
    return fee < 0n ? 0n : fee;
  }
  // fee_paise = floor(principal * (value_bp / 100)) where value has 4 decimal places
  // value 1.5000% → scaled 15000; fee = principal * 15000 / 1_000_000
  const scaledPercent = decimalToScaledInt(value, 4);
  if (scaledPercent <= 0n || principalPaise <= 0n) return 0n;
  return (principalPaise * scaledPercent) / 1_000_000n;
}

type ChargeRow = {
  id: string;
  providerId: string | null;
  role: UserRole | null;
  ruleType: "flat" | "percentage";
  value: string;
  effectiveFrom: Date;
};

/**
 * Server-side customer fee for a debit service. Never trust the client.
 *
 * Precedence (same idea as commission findActiveRule):
 *   1) provider-specific + role-specific
 *   2) provider-specific + role-null (all roles)
 *   3) provider-null + role-specific
 *   4) provider-null + role-null
 * Within a tie, most recent effective_from wins.
 * No matching rule → "0" (never throw).
 */
export async function resolveCustomerFee(
  serviceId: string,
  providerId: string | null,
  role: UserRole | null,
  amount: string,
  at: Date = new Date(),
): Promise<string> {
  try {
    if (!amount || rupeesToPaise(amount) <= 0n) return "0.00";
  } catch {
    return "0.00";
  }

  const tenantCode = process.env.LEDGER_TENANT_CODE?.trim() || "ASANPAY";
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.code, tenantCode))
    .limit(1);
  if (!tenant) return "0.00";

  const amountNum = amount;
  const rows = await db
    .select({
      id: serviceCharges.id,
      providerId: serviceCharges.providerId,
      role: serviceCharges.role,
      ruleType: serviceCharges.ruleType,
      value: serviceCharges.value,
      effectiveFrom: serviceCharges.effectiveFrom,
    })
    .from(serviceCharges)
    .where(
      and(
        eq(serviceCharges.tenantId, tenant.id),
        eq(serviceCharges.serviceId, serviceId),
        eq(serviceCharges.isActive, true),
        lte(serviceCharges.effectiveFrom, at),
        or(isNull(serviceCharges.effectiveTo), gt(serviceCharges.effectiveTo, at)),
        or(isNull(serviceCharges.minAmount), lte(serviceCharges.minAmount, amountNum)),
        or(isNull(serviceCharges.maxAmount), sql`${serviceCharges.maxAmount} >= ${amountNum}`),
        providerId
          ? or(isNull(serviceCharges.providerId), eq(serviceCharges.providerId, providerId))
          : isNull(serviceCharges.providerId),
        role
          ? or(isNull(serviceCharges.role), eq(serviceCharges.role, role))
          : isNull(serviceCharges.role),
      ),
    )
    .orderBy(desc(serviceCharges.effectiveFrom));

  const match = pickBestCharge(rows as ChargeRow[], providerId, role);
  if (!match) return "0.00";

  try {
    const principalPaise = rupeesToPaise(amount);
    const feePaise = computeCustomerFeePaise(match.ruleType, match.value, principalPaise);
    return paiseToRupees(feePaise);
  } catch {
    return "0.00";
  }
}

function pickBestCharge(
  rows: ChargeRow[],
  providerId: string | null,
  role: UserRole | null,
): ChargeRow | null {
  // rows already filtered; pick highest specificity then first (already ordered by effectiveFrom desc)
  const score = (r: ChargeRow): number => {
    let s = 0;
    if (providerId && r.providerId === providerId) s += 4;
    else if (r.providerId === null) s += 0;
    else return -1;
    if (role && r.role === role) s += 2;
    else if (r.role === null) s += 0;
    else return -1;
    return s;
  };

  let best: ChargeRow | null = null;
  let bestScore = -1;
  for (const r of rows) {
    const s = score(r);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}

export async function listServiceCharges(filters?: {
  serviceId?: string;
  activeOnly?: boolean;
  tenantCode?: string;
}) {
  const tenantCode = filters?.tenantCode?.trim() || process.env.LEDGER_TENANT_CODE?.trim() || "ASANPAY";
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.code, tenantCode))
    .limit(1);
  if (!tenant) return [];

  const conditions = [eq(serviceCharges.tenantId, tenant.id)];
  if (filters?.serviceId) conditions.push(eq(serviceCharges.serviceId, filters.serviceId));
  if (filters?.activeOnly) conditions.push(eq(serviceCharges.isActive, true));

  const rows = await db
    .select({
      id: serviceCharges.id,
      tenantId: serviceCharges.tenantId,
      serviceId: serviceCharges.serviceId,
      serviceCode: services.code,
      serviceName: services.name,
      providerId: serviceCharges.providerId,
      providerCode: providers.code,
      providerName: providers.name,
      role: serviceCharges.role,
      ruleType: serviceCharges.ruleType,
      value: serviceCharges.value,
      minAmount: serviceCharges.minAmount,
      maxAmount: serviceCharges.maxAmount,
      effectiveFrom: serviceCharges.effectiveFrom,
      effectiveTo: serviceCharges.effectiveTo,
      isActive: serviceCharges.isActive,
      createdAt: serviceCharges.createdAt,
    })
    .from(serviceCharges)
    .innerJoin(services, eq(services.id, serviceCharges.serviceId))
    .leftJoin(providers, eq(providers.id, serviceCharges.providerId))
    .where(and(...conditions))
    .orderBy(desc(serviceCharges.effectiveFrom), services.code);

  return rows.map((r) => ({
    ...r,
    value: String(r.value),
    minAmount: r.minAmount != null ? String(r.minAmount) : null,
    maxAmount: r.maxAmount != null ? String(r.maxAmount) : null,
  }));
}

export async function createServiceCharge(adminId: string, input: ServiceChargeInput) {
  await assertServiceExists(input.serviceId);
  await assertProviderExists(input.providerId);
  const role = normalizeRole(input.role);
  const value = validateChargeValue(input.ruleType, input.value);
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

  const tenantId = await resolveTenantId();

  const [created] = await db
    .insert(serviceCharges)
    .values({
      tenantId,
      serviceId: input.serviceId,
      providerId: input.providerId || null,
      role,
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
    throw new HttpError(500, "Failed to create service charge", "CHARGE_CREATE_FAILED");
  }

  await insertAuditLog({
    userId: adminId,
    action: "admin.service_charge_create",
    entityType: "service_charge",
    entityId: created.id,
    metadata: {
      serviceId: input.serviceId,
      role,
      ruleType: input.ruleType,
      value,
    },
  });

  return {
    ...created,
    value: String(created.value),
    minAmount: created.minAmount != null ? String(created.minAmount) : null,
    maxAmount: created.maxAmount != null ? String(created.maxAmount) : null,
  };
}

export async function updateServiceCharge(
  adminId: string,
  chargeId: string,
  patch: Partial<ServiceChargeInput>,
) {
  const [existing] = await db
    .select()
    .from(serviceCharges)
    .where(eq(serviceCharges.id, chargeId))
    .limit(1);
  if (!existing) throw new HttpError(404, "Service charge not found", "CHARGE_NOT_FOUND");

  if (patch.serviceId) await assertServiceExists(patch.serviceId);
  if (patch.providerId !== undefined) await assertProviderExists(patch.providerId);

  let role = existing.role as SchemeRole | null;
  if (patch.role !== undefined) {
    role = normalizeRole(patch.role);
  }

  const ruleType = (patch.ruleType ?? existing.ruleType) as RuleType;
  const value =
    patch.value !== undefined
      ? validateChargeValue(ruleType, patch.value)
      : String(existing.value);
  if (patch.ruleType && patch.value === undefined) {
    validateChargeValue(ruleType, String(existing.value));
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
    .update(serviceCharges)
    .set({
      serviceId: patch.serviceId ?? existing.serviceId,
      providerId: patch.providerId !== undefined ? patch.providerId || null : existing.providerId,
      role,
      ruleType,
      value,
      minAmount,
      maxAmount,
      effectiveFrom,
      effectiveTo,
      isActive: patch.isActive ?? existing.isActive,
    })
    .where(eq(serviceCharges.id, chargeId))
    .returning();

  await insertAuditLog({
    userId: adminId,
    action: "admin.service_charge_update",
    entityType: "service_charge",
    entityId: chargeId,
    metadata: patch as Record<string, unknown>,
  });

  if (!updated) throw new HttpError(500, "Failed to update service charge", "CHARGE_UPDATE_FAILED");

  return {
    ...updated,
    value: String(updated.value),
    minAmount: updated.minAmount != null ? String(updated.minAmount) : null,
    maxAmount: updated.maxAmount != null ? String(updated.maxAmount) : null,
  };
}

export async function deleteServiceCharge(adminId: string, chargeId: string) {
  const [existing] = await db
    .select({ id: serviceCharges.id })
    .from(serviceCharges)
    .where(eq(serviceCharges.id, chargeId))
    .limit(1);
  if (!existing) throw new HttpError(404, "Service charge not found", "CHARGE_NOT_FOUND");

  await db.delete(serviceCharges).where(eq(serviceCharges.id, chargeId));

  await insertAuditLog({
    userId: adminId,
    action: "admin.service_charge_delete",
    entityType: "service_charge",
    entityId: chargeId,
    metadata: {},
  });

  return { id: chargeId, deleted: true };
}

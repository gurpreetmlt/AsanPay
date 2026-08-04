import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { serviceCharges, tenants, services, providers } from "../../db/postgres/schema";
import { rupeesToPaise, paiseToRupees, type Paise } from "../../core/money";
import type { UserRole } from "@asanpay/shared-types";

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

  return db
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
}

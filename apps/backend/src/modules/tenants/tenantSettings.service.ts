import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { tenants } from "../../db/postgres/schema";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";

export interface TenantSettings {
  /** Fund-request credit at/above this (rupees) needs two different admins. */
  fundApproveDualRupees?: number;
  /** Flat settlement fee deducted from each withdrawal (rupees). */
  settlementChargeRupees?: number;
}

function asSettings(raw: unknown): TenantSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as TenantSettings;
}

function mergeWithDefaults(s: TenantSettings): Required<TenantSettings> {
  return {
    fundApproveDualRupees:
      typeof s.fundApproveDualRupees === "number" && s.fundApproveDualRupees > 0
        ? Math.floor(s.fundApproveDualRupees)
        : env.FUND_APPROVE_DUAL_RUPEES,
    settlementChargeRupees:
      typeof s.settlementChargeRupees === "number" && s.settlementChargeRupees >= 0
        ? Math.floor(s.settlementChargeRupees)
        : 0,
  };
}

export async function getTenantSettings(tenantId: string): Promise<Required<TenantSettings>> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return mergeWithDefaults(asSettings(row?.settings));
}

export async function patchTenantSettings(
  tenantId: string,
  patch: TenantSettings,
): Promise<Required<TenantSettings>> {
  if (patch.fundApproveDualRupees !== undefined) {
    const n = Number(patch.fundApproveDualRupees);
    if (!Number.isFinite(n) || n < 1 || n > 1_000_000_000) {
      throw new HttpError(
        422,
        "Fund dual-approve limit must be between 1 and 1000000000 rupees",
        "INVALID_DUAL_LIMIT",
      );
    }
  }
  if (patch.settlementChargeRupees !== undefined) {
    const n = Number(patch.settlementChargeRupees);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) {
      throw new HttpError(
        422,
        "Settlement charge must be between 0 and 10000 rupees",
        "INVALID_SETTLEMENT_CHARGE",
      );
    }
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .for("update")
      .limit(1);

    if (!row) throw new HttpError(404, "Tenant not found", "TENANT_NOT_FOUND");

    const merged: TenantSettings = {
      ...asSettings(row.settings),
      ...(patch.fundApproveDualRupees !== undefined
        ? { fundApproveDualRupees: Math.floor(Number(patch.fundApproveDualRupees)) }
        : {}),
      ...(patch.settlementChargeRupees !== undefined
        ? { settlementChargeRupees: Math.floor(Number(patch.settlementChargeRupees)) }
        : {}),
    };

    await tx
      .update(tenants)
      .set({ settings: merged as Record<string, unknown> })
      .where(eq(tenants.id, tenantId));
    return mergeWithDefaults(merged);
  });
}

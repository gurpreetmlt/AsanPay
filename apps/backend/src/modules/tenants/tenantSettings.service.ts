import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { tenants } from "../../db/postgres/schema";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import {
  invalidateGeofenceLimits,
  resolveGeofenceLimits,
  serverGeofenceLimits,
  type GeofenceLimits,
  type StoredGeofence,
} from "./geofenceSettings";

export interface TenantSettings {
  /** Fund-request credit at/above this (rupees) needs two different admins. */
  fundApproveDualRupees?: number;
  /** Flat settlement fee deducted from each withdrawal (rupees). */
  settlementChargeRupees?: number;
  /** Platform care contacts — admin Platform Settings; shown on agent Support page. */
  supportPhone?: string;
  supportEmail?: string;
  /** Digits for wa.me (e.g. 9198xxxxxxxx). */
  supportWhatsapp?: string;
  /** Public company website URL (agent Support → Company box). */
  supportWebsite?: string;
  nodalEmail?: string;
  nodalPhone?: string;
  nodalAddress?: string;
  /** Dashboard + login promo slider slides (max 5 per placement). */
  promoSlides?: unknown[];
  /** Promo image payloads keyed by asset id (data: URLs). Survives Coolify disk wipe. */
  promoAssets?: Record<string, string>;
  /**
   * Admin Banking: show Delete on company bank rows and allow hard-delete.
   * Default false — disable/deactivate only until explicitly enabled.
   */
  allowCompanyBankDelete?: boolean;
  /** Admin Platform Settings → Location limits. Unset fields fall back to env / defaults. */
  geofence?: StoredGeofence;
  /** Agent price (₹) for a bank account name check answered without a ₹1 credit. */
  bankCheckPriceRupees?: number;
  /** Agent price (₹) when the check needed the ₹1 penny drop. */
  bankCheckPennyDropPriceRupees?: number;
  /** Night service window (see serviceWindow.service). */
  nightWindow?: { enabled?: boolean; start?: string; end?: string };
}

export const BANK_CHECK_PRICE_DEFAULTS = { standard: 1.5, pennyDrop: 2.5 } as const;
const BANK_CHECK_PRICE_MAX = 50;

const toRupees2 = (n: number) => Math.round(n * 100) / 100;

export type ResolvedTenantSettings = Required<
  Omit<TenantSettings, "promoSlides" | "promoAssets" | "geofence" | "nightWindow">
> & { geofence: GeofenceLimits };

export type SupportContacts = {
  supportPhone: string;
  supportEmail: string;
  supportWhatsapp: string;
  supportWebsite: string;
  nodalEmail: string;
  nodalPhone: string;
  nodalAddress: string;
};

export function asSettings(raw: unknown): TenantSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as TenantSettings;
}

function strField(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/** Normalize website to https://… or empty. */
function normalizeWebsite(raw: unknown): string {
  const s = strField(raw, 200);
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname.includes(".")) return "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function mergeWithDefaults(s: TenantSettings): ResolvedTenantSettings {
  return {
    fundApproveDualRupees:
      typeof s.fundApproveDualRupees === "number" && s.fundApproveDualRupees > 0
        ? Math.floor(s.fundApproveDualRupees)
        : env.FUND_APPROVE_DUAL_RUPEES,
    settlementChargeRupees:
      typeof s.settlementChargeRupees === "number" && s.settlementChargeRupees >= 0
        ? Math.floor(s.settlementChargeRupees)
        : 0,
    supportPhone: strField(s.supportPhone, 40),
    supportEmail: strField(s.supportEmail, 150),
    supportWhatsapp: strField(s.supportWhatsapp, 20).replace(/\D/g, "").slice(0, 20),
    supportWebsite: normalizeWebsite(s.supportWebsite) || "https://asanpay.in",
    nodalEmail: strField(s.nodalEmail, 150),
    nodalPhone: strField(s.nodalPhone, 40),
    nodalAddress: strField(s.nodalAddress, 500),
    allowCompanyBankDelete: s.allowCompanyBankDelete === true,
    geofence: resolveGeofenceLimits(s.geofence, serverGeofenceLimits()),
    bankCheckPriceRupees: validBankPrice(s.bankCheckPriceRupees, Number(env.BANK_NAME_CHECK_COST))
      ? toRupees2(s.bankCheckPriceRupees as number)
      : BANK_CHECK_PRICE_DEFAULTS.standard,
    bankCheckPennyDropPriceRupees: validBankPrice(s.bankCheckPennyDropPriceRupees, Number(env.BANK_PENNY_DROP_COST))
      ? toRupees2(s.bankCheckPennyDropPriceRupees as number)
      : BANK_CHECK_PRICE_DEFAULTS.pennyDrop,
  };
}

/** Never below what the provider charges us for that step. */
function validBankPrice(v: unknown, providerCost: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= providerCost && v <= BANK_CHECK_PRICE_MAX;
}

export async function getTenantSettings(tenantId: string): Promise<ResolvedTenantSettings> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return mergeWithDefaults(asSettings(row?.settings));
}

/** Care fields only — safe for any authenticated agent on Support page. */
export async function getSupportContacts(tenantId: string): Promise<SupportContacts> {
  const s = await getTenantSettings(tenantId);
  return {
    supportPhone: s.supportPhone,
    supportEmail: s.supportEmail,
    supportWhatsapp: s.supportWhatsapp,
    supportWebsite: s.supportWebsite,
    nodalEmail: s.nodalEmail,
    nodalPhone: s.nodalPhone,
    nodalAddress: s.nodalAddress,
  };
}

export async function patchTenantSettings(
  tenantId: string,
  patch: TenantSettings,
  actor?: { id: string; ipAddress?: string | null; userAgent?: string | null },
): Promise<ResolvedTenantSettings> {
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
  if (patch.supportEmail !== undefined && patch.supportEmail.trim() !== "") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.supportEmail.trim())) {
      throw new HttpError(422, "Enter a valid support email address", "INVALID_SUPPORT_EMAIL");
    }
  }
  if (patch.nodalEmail !== undefined && patch.nodalEmail.trim() !== "") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.nodalEmail.trim())) {
      throw new HttpError(422, "Enter a valid nodal officer email address", "INVALID_NODAL_EMAIL");
    }
  }
  if (patch.supportWebsite !== undefined && patch.supportWebsite.trim() !== "") {
    if (!normalizeWebsite(patch.supportWebsite)) {
      throw new HttpError(
        422,
        "Enter a valid website URL (e.g. https://asanpay.in)",
        "INVALID_SUPPORT_WEBSITE",
      );
    }
  }

  for (const [field, label, cost] of [
    ["bankCheckPriceRupees", "Bank check price", Number(env.BANK_NAME_CHECK_COST)],
    ["bankCheckPennyDropPriceRupees", "Bank check price with ₹1 penny drop", Number(env.BANK_PENNY_DROP_COST)],
  ] as const) {
    const v = patch[field];
    if (v !== undefined && !validBankPrice(Number(v), cost)) {
      throw new HttpError(
        422,
        `${label} must be between ₹${cost.toFixed(2)} (provider cost) and ₹${BANK_CHECK_PRICE_MAX}`,
        "INVALID_BANK_CHECK_PRICE",
      );
    }
  }

  const { prev, merged } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .for("update")
      .limit(1);

    if (!row) throw new HttpError(404, "Tenant not found", "TENANT_NOT_FOUND");

    const prev = asSettings(row.settings);
    const merged: TenantSettings = {
      ...prev,
      ...(patch.fundApproveDualRupees !== undefined
        ? { fundApproveDualRupees: Math.floor(Number(patch.fundApproveDualRupees)) }
        : {}),
      ...(patch.settlementChargeRupees !== undefined
        ? { settlementChargeRupees: Math.floor(Number(patch.settlementChargeRupees)) }
        : {}),
      ...(patch.supportPhone !== undefined ? { supportPhone: strField(patch.supportPhone, 40) } : {}),
      ...(patch.supportEmail !== undefined ? { supportEmail: strField(patch.supportEmail, 150) } : {}),
      ...(patch.supportWhatsapp !== undefined
        ? { supportWhatsapp: strField(patch.supportWhatsapp, 20).replace(/\D/g, "").slice(0, 20) }
        : {}),
      ...(patch.supportWebsite !== undefined
        ? { supportWebsite: normalizeWebsite(patch.supportWebsite) }
        : {}),
      ...(patch.nodalEmail !== undefined ? { nodalEmail: strField(patch.nodalEmail, 150) } : {}),
      ...(patch.nodalPhone !== undefined ? { nodalPhone: strField(patch.nodalPhone, 40) } : {}),
      ...(patch.nodalAddress !== undefined ? { nodalAddress: strField(patch.nodalAddress, 500) } : {}),
      ...(patch.allowCompanyBankDelete !== undefined
        ? { allowCompanyBankDelete: patch.allowCompanyBankDelete === true }
        : {}),
      ...(patch.bankCheckPriceRupees !== undefined
        ? { bankCheckPriceRupees: toRupees2(Number(patch.bankCheckPriceRupees)) }
        : {}),
      ...(patch.bankCheckPennyDropPriceRupees !== undefined
        ? { bankCheckPennyDropPriceRupees: toRupees2(Number(patch.bankCheckPennyDropPriceRupees)) }
        : {}),
      ...(patch.geofence !== undefined ? {
            geofence: {
              ...(prev.geofence && typeof prev.geofence === "object" ? prev.geofence : {}),
              ...patch.geofence,
            },
          } : {}),
    };

    await tx
      .update(tenants)
      .set({ settings: merged as Record<string, unknown> })
      .where(eq(tenants.id, tenantId));
    return { prev, merged };
  });

  const resolved = mergeWithDefaults(merged);
  if (patch.bankCheckPriceRupees !== undefined || patch.bankCheckPennyDropPriceRupees !== undefined) {
    const before = mergeWithDefaults(prev);
    if (
      before.bankCheckPriceRupees !== resolved.bankCheckPriceRupees ||
      before.bankCheckPennyDropPriceRupees !== resolved.bankCheckPennyDropPriceRupees
    ) {
      await insertAuditLog({
        userId: actor?.id ?? null,
        action: "admin.bank_check_price_update",
        entityType: "tenant",
        entityId: tenantId,
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
        metadata: {
          from: { standard: before.bankCheckPriceRupees, pennyDrop: before.bankCheckPennyDropPriceRupees },
          to: { standard: resolved.bankCheckPriceRupees, pennyDrop: resolved.bankCheckPennyDropPriceRupees },
        },
      });
    }
  }
  if (patch.geofence !== undefined) {
    invalidateGeofenceLimits();
    const before = mergeWithDefaults(prev).geofence;
    const after = resolved.geofence;
    if (
      before.enabled !== after.enabled ||
      before.shopKm !== after.shopKm ||
      before.homeKm !== after.homeKm
    ) {
      await insertAuditLog({
        userId: actor?.id ?? null,
        action: "admin.geofence_settings_update",
        entityType: "tenant",
        entityId: tenantId,
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
        metadata: {
          from: { enabled: before.enabled, shopKm: before.shopKm, homeKm: before.homeKm },
          to: { enabled: after.enabled, shopKm: after.shopKm, homeKm: after.homeKm },
        },
      });
    }
  }
  return resolved;
}

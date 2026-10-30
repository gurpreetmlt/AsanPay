import { eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { tenants } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { resolveTenantId } from "../fund-requests/tenant";
import { asSettings } from "../tenants/tenantSettings.service";
import {
  ADMIN_MANUAL_FUND_DAILY_LIMIT_RUPEES,
  DMT_AGENT_DAILY_LIMIT_RUPEES,
  DMT_PER_TXN_LIMIT_RUPEES,
  DMT_REMITTER_MONTHLY_LIMIT_RUPEES,
  formatRupees,
} from "./moneyLimits";

/**
 * Platform money limits for every agent (Admin → Platform Settings → Money limits).
 * One agent can get a different DMT per-transfer / daily limit on their own page (Services & limits).
 */
export interface PlatformMoneyLimits {
  dmtPerTxnRupees: number;
  dmtRemitterMonthlyRupees: number;
  dmtAgentDailyRupees: number;
  adminManualFundDailyRupees: number;
}

export const PLATFORM_MONEY_LIMIT_DEFAULTS: PlatformMoneyLimits = {
  dmtPerTxnRupees: DMT_PER_TXN_LIMIT_RUPEES,
  dmtRemitterMonthlyRupees: DMT_REMITTER_MONTHLY_LIMIT_RUPEES,
  dmtAgentDailyRupees: DMT_AGENT_DAILY_LIMIT_RUPEES,
  adminManualFundDailyRupees: ADMIN_MANUAL_FUND_DAILY_LIMIT_RUPEES,
};

const LABEL: Record<keyof PlatformMoneyLimits, string> = {
  dmtPerTxnRupees: "DMT per transfer",
  dmtRemitterMonthlyRupees: "DMT per remitter per month",
  dmtAgentDailyRupees: "DMT per agent per day",
  adminManualFundDailyRupees: "Admin manual top-up per day",
};

const MAX_RUPEES = 100_000_000;
const CACHE_MS = 30_000;
let cache: { at: number; value: PlatformMoneyLimits } | null = null;

function normalize(raw: unknown): PlatformMoneyLimits {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof PlatformMoneyLimits, unknown>>;
  const out = { ...PLATFORM_MONEY_LIMIT_DEFAULTS };
  for (const key of Object.keys(out) as (keyof PlatformMoneyLimits)[]) {
    const v = Number(r[key]);
    if (Number.isFinite(v) && v > 0 && v <= MAX_RUPEES) out[key] = v;
  }
  return out;
}

export async function getPlatformMoneyLimits(): Promise<PlatformMoneyLimits> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const tenantId = await resolveTenantId();
  const [row] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const value = normalize(asSettings(row?.settings).moneyLimits);
  cache = { at: Date.now(), value };
  return value;
}

export async function setPlatformMoneyLimits(
  adminId: string,
  input: PlatformMoneyLimits,
  reason: string,
): Promise<PlatformMoneyLimits> {
  for (const key of Object.keys(LABEL) as (keyof PlatformMoneyLimits)[]) {
    const v = input[key];
    if (!Number.isFinite(v) || v <= 0) {
      throw new HttpError(422, `${LABEL[key]} must be more than ₹0`, "INVALID_LIMIT");
    }
    if (Math.round(v * 100) !== v * 100) {
      throw new HttpError(422, `${LABEL[key]} can have at most 2 decimal places`, "INVALID_LIMIT");
    }
    if (v > MAX_RUPEES) {
      throw new HttpError(422, `${LABEL[key]} cannot be more than ${formatRupees(MAX_RUPEES)}`, "INVALID_LIMIT");
    }
  }
  if (input.dmtAgentDailyRupees < input.dmtPerTxnRupees) {
    throw new HttpError(422, "DMT per agent per day must be at least the DMT per transfer limit", "INVALID_LIMIT");
  }
  if (input.dmtRemitterMonthlyRupees < input.dmtPerTxnRupees) {
    throw new HttpError(422, "DMT per remitter per month must be at least the DMT per transfer limit", "INVALID_LIMIT");
  }

  const tenantId = await resolveTenantId();
  const before = await getPlatformMoneyLimits();
  const next: PlatformMoneyLimits = {
    dmtPerTxnRupees: input.dmtPerTxnRupees,
    dmtRemitterMonthlyRupees: input.dmtRemitterMonthlyRupees,
    dmtAgentDailyRupees: input.dmtAgentDailyRupees,
    adminManualFundDailyRupees: input.adminManualFundDailyRupees,
  };
  await db
    .update(tenants)
    .set({ settings: sql`${tenants.settings} || ${JSON.stringify({ moneyLimits: next })}::jsonb` })
    .where(eq(tenants.id, tenantId));
  cache = null;
  await insertAuditLog({
    userId: adminId,
    action: "admin.money_limits_update",
    entityType: "tenant",
    entityId: tenantId,
    metadata: { before, after: next, reason },
  });
  return next;
}

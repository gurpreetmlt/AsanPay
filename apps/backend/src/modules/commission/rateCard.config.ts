import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  commissionRules,
  commissionShares,
  providerPayoutRules,
  userCommissionRates,
} from "../../db/postgres/schema";
import type { UserRole } from "@asanpay/shared-types";
import {
  computeProviderIncomePaise,
  pickRow,
  pickShare,
  type FixedRule,
  type RuleType,
} from "./rateCard.math";

export type PayoutRuleRow = {
  id: string;
  serviceId: string;
  providerId: string | null;
  ruleType: RuleType;
  value: string;
  capAmount: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  effectiveFrom: Date;
};

export type ShareRow = {
  id: string;
  serviceId: string;
  providerId: string | null;
  role: UserRole;
  sharePercent: string;
  /** Slab bounds (₹, inclusive); both null = the service default for this role. */
  minAmount: string | null;
  maxAmount: string | null;
  /** Set = flat ₹ per txn instead of `sharePercent`. */
  flatAmount: string | null;
  effectiveFrom: Date;
};


export type FixedRuleRow = {
  id: string;
  serviceId: string;
  providerId: string | null;
  role: UserRole;
  ruleType: RuleType;
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
  effectiveFrom: Date;
};

export type RateConfig = {
  payoutRules: PayoutRuleRow[];
  shares: ShareRow[];
  rules: FixedRuleRow[];
};

const str = (v: string | number | null): string | null => (v == null ? null : String(v));

/** Active (at `at`) provider income, shares and fixed rules — for some services or all. */
export async function loadRateConfig(serviceIds: string[] | null, at: Date): Promise<RateConfig> {
  const payoutWindow = and(
    eq(providerPayoutRules.isActive, true),
    lte(providerPayoutRules.effectiveFrom, at),
    or(isNull(providerPayoutRules.effectiveTo), gt(providerPayoutRules.effectiveTo, at)),
    serviceIds ? inArray(providerPayoutRules.serviceId, serviceIds) : undefined,
  );
  const shareWindow = and(
    eq(commissionShares.isActive, true),
    lte(commissionShares.effectiveFrom, at),
    or(isNull(commissionShares.effectiveTo), gt(commissionShares.effectiveTo, at)),
    serviceIds ? inArray(commissionShares.serviceId, serviceIds) : undefined,
  );
  const ruleWindow = and(
    eq(commissionRules.isActive, true),
    lte(commissionRules.effectiveFrom, at),
    or(isNull(commissionRules.effectiveTo), gt(commissionRules.effectiveTo, at)),
    serviceIds ? inArray(commissionRules.serviceId, serviceIds) : undefined,
  );

  const [payoutRows, shareRows, ruleRows] = await Promise.all([
    db
      .select({
        id: providerPayoutRules.id,
        serviceId: providerPayoutRules.serviceId,
        providerId: providerPayoutRules.providerId,
        ruleType: providerPayoutRules.ruleType,
        value: providerPayoutRules.value,
        capAmount: providerPayoutRules.capAmount,
        minAmount: providerPayoutRules.minAmount,
        maxAmount: providerPayoutRules.maxAmount,
        effectiveFrom: providerPayoutRules.effectiveFrom,
      })
      .from(providerPayoutRules)
      .where(payoutWindow),
    db
      .select({
        id: commissionShares.id,
        serviceId: commissionShares.serviceId,
        providerId: commissionShares.providerId,
        role: commissionShares.role,
        sharePercent: commissionShares.sharePercent,
        minAmount: commissionShares.minAmount,
        maxAmount: commissionShares.maxAmount,
        flatAmount: commissionShares.flatAmount,
        effectiveFrom: commissionShares.effectiveFrom,
      })
      .from(commissionShares)
      .where(shareWindow),
    db
      .select({
        id: commissionRules.id,
        serviceId: commissionRules.serviceId,
        providerId: commissionRules.providerId,
        role: commissionRules.role,
        ruleType: commissionRules.ruleType,
        value: commissionRules.value,
        minAmount: commissionRules.minAmount,
        maxAmount: commissionRules.maxAmount,
        effectiveFrom: commissionRules.effectiveFrom,
      })
      .from(commissionRules)
      .where(ruleWindow),
  ]);

  return {
    payoutRules: payoutRows.map((r) => ({
      ...r,
      value: String(r.value),
      capAmount: str(r.capAmount),
      minAmount: str(r.minAmount),
      maxAmount: str(r.maxAmount),
    })),
    shares: shareRows.map((r) => ({
      ...r,
      sharePercent: String(r.sharePercent),
      minAmount: str(r.minAmount),
      maxAmount: str(r.maxAmount),
      flatAmount: str(r.flatAmount),
    })),
    rules: ruleRows.map((r) => ({
      ...r,
      value: String(r.value),
      minAmount: str(r.minAmount),
      maxAmount: str(r.maxAmount),
    })),
  };
}

export function pickProviderIncomeRule(
  cfg: RateConfig,
  serviceId: string,
  providerId: string | null,
  amountPaise: number,
): PayoutRuleRow | null {
  return pickRow(
    cfg.payoutRules.filter((r) => r.serviceId === serviceId),
    providerId,
    amountPaise,
  );
}

/** null = no provider income configured for this service / provider / slab. */
export function providerIncomePaiseFor(
  cfg: RateConfig,
  serviceId: string,
  providerId: string | null,
  amountPaise: number,
): number | null {
  const rule = pickProviderIncomeRule(cfg, serviceId, providerId, amountPaise);
  return rule ? computeProviderIncomePaise(rule, amountPaise) : null;
}

/** Role-default config (no per-agent override) for one role on one txn amount. */
export function roleDefaultFor(
  cfg: RateConfig,
  serviceId: string,
  providerId: string | null,
  role: UserRole,
  amountPaise: number,
): { share: ShareRow | null; rule: FixedRuleRow | null } {
  const share = pickShare(
    cfg.shares.filter((s) => s.serviceId === serviceId && s.role === role),
    providerId,
    amountPaise,
  );
  const rule = pickRow(
    cfg.rules.filter((r) => r.serviceId === serviceId && r.role === role),
    providerId,
    amountPaise,
  );
  return { share, rule };
}

/** The role's service default share (no slab) — what the rate card's share box edits. */
export function serviceShareFor(
  cfg: RateConfig,
  serviceId: string,
  providerId: string | null,
  role: UserRole,
): ShareRow | null {
  return pickShare(
    cfg.shares.filter((s) => s.serviceId === serviceId && s.role === role),
    providerId,
    null,
  );
}

/** Active per-agent override (TCR06: expired overrides no longer apply). */
export async function findActiveOverride(
  serviceId: string,
  userId: string,
  at: Date,
): Promise<FixedRule | null> {
  const [override] = await db
    .select({ ruleType: userCommissionRates.ruleType, value: userCommissionRates.value })
    .from(userCommissionRates)
    .where(
      and(
        eq(userCommissionRates.userId, userId),
        eq(userCommissionRates.serviceId, serviceId),
        eq(userCommissionRates.isActive, true),
        or(isNull(userCommissionRates.expiresAt), gt(userCommissionRates.expiresAt, at)),
      ),
    )
    .limit(1);
  return override ? { ruleType: override.ruleType, value: String(override.value) } : null;
}

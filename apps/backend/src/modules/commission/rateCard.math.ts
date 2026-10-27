import { toPaise } from "../wallet/decimal";

export type RuleType = "flat" | "percentage";

export type FixedRule = { ruleType: RuleType; value: string };

export type ProviderIncomeRule = FixedRule & { capAmount: string | null };

/** Any versioned config row that can be scoped to a provider and (optionally) an amount slab. */
export type PickableRow = {
  providerId: string | null;
  effectiveFrom: Date;
  minAmount?: string | null;
  maxAmount?: string | null;
};

export type PayoutSource = "override" | "share" | "rule" | "none";

/** Non-negative decimal string (≤ 4 dp) → integer scaled by 10^4. No parseFloat. */
export function percentToScaled(raw: string): number {
  const t = String(raw).trim();
  if (!/^\d*(\.\d*)?$/.test(t) || t === "" || t === ".") return 0;
  const [whole = "0", fracRaw = ""] = t.split(".");
  const frac = (fracRaw + "0000").slice(0, 4);
  return Number(whole || "0") * 10_000 + Number(frac);
}

/** basePaise × percent / 100, rounded half-up to the paisa. */
export function percentOfPaiseHalfUp(basePaise: number, percent: string): number {
  if (basePaise <= 0) return 0;
  const scaled = percentToScaled(percent);
  if (scaled <= 0) return 0;
  return Math.floor((basePaise * scaled + 500_000) / 1_000_000);
}

/** Fixed rule / agent override payout — same floor math the live payout has always used. */
export function computeFixedPaise(rule: FixedRule, amountPaise: number): number {
  if (rule.ruleType === "flat") return toPaise(rule.value);
  return Math.floor((amountPaise * percentToScaled(rule.value)) / 1_000_000);
}

/** What the provider pays us on this txn amount: flat ₹ or % of amount (half-up), then cap. */
export function computeProviderIncomePaise(rule: ProviderIncomeRule, amountPaise: number): number {
  const income =
    rule.ruleType === "flat" ? toPaise(rule.value) : percentOfPaiseHalfUp(amountPaise, rule.value);
  const capped = rule.capAmount != null ? Math.min(income, toPaise(rule.capAmount)) : income;
  return Math.max(0, capped);
}

export function computeSharePaise(providerIncomePaise: number, sharePercent: string): number {
  return percentOfPaiseHalfUp(providerIncomePaise, sharePercent);
}

/** Inclusive on both ends (₹1,000 matches 0–1,000 and 1,000–3,000). */
export function inSlab(row: Pick<PickableRow, "minAmount" | "maxAmount">, amountPaise: number): boolean {
  if (row.minAmount != null && amountPaise < toPaise(row.minAmount)) return false;
  if (row.maxAmount != null && amountPaise > toPaise(row.maxAmount)) return false;
  return true;
}

/**
 * Best active row for a provider + amount. Rows must already be filtered to the effective window
 * and the service (and role, where relevant). Provider-specific beats all-providers; then the
 * newest effective_from; then the higher slab start (decides a shared slab edge).
 * `amountPaise` null = ignore slab bounds.
 */
export function pickRow<T extends PickableRow>(
  rows: readonly T[],
  providerId: string | null,
  amountPaise: number | null,
): T | null {
  const candidates = rows.filter(
    (r) =>
      (r.providerId === null || (providerId !== null && r.providerId === providerId)) &&
      (amountPaise === null || inSlab(r, amountPaise)),
  );
  candidates.sort((a, b) => {
    const ap = a.providerId !== null ? 1 : 0;
    const bp = b.providerId !== null ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const t = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
    if (t !== 0) return t;
    const amin = a.minAmount != null ? toPaise(a.minAmount) : -1;
    const bmin = b.minAmount != null ? toPaise(b.minAmount) : -1;
    return bmin - amin;
  });
  return candidates[0] ?? null;
}

/**
 * One role's gross earning. Order: agent override → share of provider income → fixed rule → none.
 * A share only applies when provider income is configured (non-null); otherwise the fixed rule pays.
 */
export function resolveRoleGross(input: {
  amountPaise: number;
  providerIncomePaise: number | null;
  override?: FixedRule | null;
  sharePercent?: string | null;
  fixedRule?: FixedRule | null;
}): { source: PayoutSource; grossPaise: number } {
  if (input.override) {
    return { source: "override", grossPaise: Math.max(0, computeFixedPaise(input.override, input.amountPaise)) };
  }
  if (input.sharePercent != null && input.providerIncomePaise != null) {
    return { source: "share", grossPaise: computeSharePaise(input.providerIncomePaise, input.sharePercent) };
  }
  if (input.fixedRule) {
    return { source: "rule", grossPaise: Math.max(0, computeFixedPaise(input.fixedRule, input.amountPaise)) };
  }
  return { source: "none", grossPaise: 0 };
}

/** Company keeps provider income + customer fee (GST on the fee is collected on top) − role gross. */
export function companyKeepsPaise(input: {
  providerIncomePaise: number | null;
  customerFeePaise: number;
  totalGrossPaise: number;
}): { companyKeepsPaise: number; underwater: boolean } {
  const keeps = (input.providerIncomePaise ?? 0) + input.customerFeePaise - input.totalGrossPaise;
  return { companyKeepsPaise: keeps, underwater: keeps < 0 };
}

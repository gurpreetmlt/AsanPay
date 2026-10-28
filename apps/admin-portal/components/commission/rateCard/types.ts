export type SchemeRole = "retailer" | "distributor" | "super_distributor";
export type RuleType = "flat" | "percentage";

export const SCHEME_ROLES: SchemeRole[] = ["retailer", "distributor", "super_distributor"];

export const ROLE_LABEL: Record<SchemeRole, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  super_distributor: "SD",
};

export type TaxView = {
  configId: string | null;
  source: "service" | "default" | "builtin";
  tdsApplies: boolean;
  tdsPercent: string;
  gstOnFeeApplies: boolean;
  gstOnFeePercent: string;
  gstOnFeeInclusive: boolean;
};

export type TenantTax = TaxView & {
  providerOutputGstPercent: string;
  providerTdsPercent: string;
};

export type RoleSplit = {
  role: SchemeRole;
  source: "override" | "share" | "rule" | "none";
  shareId: string | null;
  sharePercent: string | null;
  /** Set = the share pays this flat ₹ instead of `sharePercent`. */
  shareFlat: string | null;
  /** The share is this slab's own split (not the service default). */
  shareSlab: boolean;
  ruleId: string | null;
  ruleType: RuleType | null;
  ruleValue: string | null;
  gross: string;
  tds: string;
  net: string;
};

export type CostLine = {
  label: string;
  amount: string | null;
  perTxn: boolean;
  gstIncluded: boolean;
  inputGst: string | null;
};

export type Split = {
  amount: string;
  providerIncome: string | null;
  providerIncomeRuleId: string | null;
  providerGst: string | null;
  providerTds: string | null;
  providerNetReceivable: string | null;
  customerFeeCharged: string;
  customerFee: string;
  customerFeeGst: string;
  gstOnFeeInclusive: boolean;
  customerPays: string;
  roles: RoleSplit[];
  totalGross: string;
  totalTds: string;
  totalNet: string;
  companyKeeps: string;
  underwater: boolean;
  providerCosts: CostLine[];
  companyKeepsAfterCosts: string;
  missingRoles: SchemeRole[];
};

export type Slab = Split & { minAmount: string | null; maxAmount: string | null; sampleAmount: string };

export type ShareView = { id: string; providerId: string | null; sharePercent: string; effectiveFrom: string };

export type IncomeRule = {
  id: string;
  providerId: string | null;
  ruleType: RuleType;
  value: string;
  capAmount: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  effectiveFrom: string;
};

export type CustomerFeeRule = {
  id: string;
  providerId: string | null;
  role: SchemeRole | null;
  ruleType: RuleType;
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
  effectiveFrom: string;
};

export type FixedRule = {
  id: string;
  providerId: string | null;
  role: SchemeRole | "admin";
  ruleType: RuleType;
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
};

export type SuggestedIncomeRow = {
  ruleType: RuleType;
  value: string | null;
  capAmount: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  note: string | null;
};

export type Reference = {
  mode: "share" | "fixed";
  incomeRows: SuggestedIncomeRow[] | null;
  askProvider: boolean;
  note: string | null;
  costs: Array<{ label: string; amount: string | null; perTxn: boolean; gstIncluded: boolean }>;
};

export type ServiceRow = {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  categoryName: string;
  shares: Record<SchemeRole, ShareView | null>;
  shareTotalPercent: string;
  providerIncomeRules: IncomeRule[];
  customerFeeRules: CustomerFeeRule[];
  fixedRules: FixedRule[];
  tax: TaxView;
  reference: Reference | null;
  slabs: Slab[];
};

export type RateCardData = {
  providerId: string | null;
  at: string;
  providers: Array<{ id: string; code: string; name: string }>;
  tenantTax: TenantTax;
  services: ServiceRow[];
};

export type PreviewData = Split & {
  serviceId: string;
  providerId: string | null;
  /** True when the numbers include the editor's unsaved changes. */
  draftApplied?: boolean;
  tax: TaxView;
  providerTax: { outputGstPercent: string; tdsPercent: string };
};

/** Unsaved editor changes sent with the preview request — applied in memory, never saved. */
export type PreviewDraft = {
  shares?: Partial<Record<SchemeRole, string>>;
  flats?: Partial<Record<SchemeRole, string>>;
  endIncomeIds?: string[];
  addIncome?: Array<{
    providerId: string | null;
    ruleType: RuleType;
    value: string;
    capAmount: string | null;
    minAmount: string | null;
    maxAmount: string | null;
    replacesId: string | null;
  }>;
  endFeeIds?: string[];
  addFees?: Array<{
    providerId: string | null;
    role: SchemeRole | null;
    ruleType: RuleType;
    value: string;
    minAmount: string | null;
    maxAmount: string | null;
    replacesId: string | null;
  }>;
};

/** One pending write, shown in the confirm popup and posted in order. */
export type PendingChange = {
  label: string;
  detail: string;
  method: "post" | "patch" | "delete";
  url: string;
  body: Record<string, unknown>;
};

export function inr(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${Number(n.toFixed(4))}%` : "—";
}

export function slabLabel(min: string | null, max: string | null): string {
  if (min == null && max == null) return "Any amount";
  if (min == null) return `Up to ${inr(max)}`;
  if (max == null) return `${inr(min)}+`;
  return `${inr(min)} – ${inr(max)}`;
}

export function feePayerLabel(role: SchemeRole | null): string {
  return role ? ROLE_LABEL[role] : "All roles";
}

export function ruleLabel(ruleType: RuleType, value: string | null, cap?: string | null): string {
  if (value == null || value === "") return ruleType === "percentage" ? "% pending" : "₹ pending";
  const base = ruleType === "percentage" ? `${Number(value)}% of amount` : inr(value);
  return cap ? `${base}, max ${inr(cap)}` : base;
}

/** Same number, ignoring trailing zeros ("60" vs "60.0000"). */
export function samePercent(a: string | null | undefined, b: string | null | undefined): boolean {
  if ((a ?? "") === "" && (b ?? "") === "") return true;
  return Number(a) === Number(b) && (a ?? "") !== "" && (b ?? "") !== "";
}

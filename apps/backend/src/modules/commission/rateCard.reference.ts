import type { RuleType } from "./rateCard.math";

/**
 * Reference numbers from the provider commercial sheet. Shown on the rate card as "Suggested" chips
 * and muted provider-cost lines only — nothing here is ever written to config or used in a payout.
 */

export type SuggestedIncomeRow = {
  ruleType: RuleType;
  /** null = rate still pending from the provider; admin must type it before saving. */
  value: string | null;
  capAmount: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  note: string | null;
};

export type ProviderCostLine = {
  label: string;
  /** ₹ per unit; null = rate not on the sheet yet. */
  amount: string | null;
  /** true = charged on every txn of this service (counted in "company keeps after costs"). */
  perTxn: boolean;
  /** true = amount already includes GST, so no input GST line. */
  gstIncluded: boolean;
};

export type RateCardReference = {
  mode: "share" | "fixed";
  /** null = no provider income suggestion (fixed-mode service or rate unknown). */
  incomeRows: SuggestedIncomeRow[] | null;
  askProvider: boolean;
  note: string | null;
  costs: ProviderCostLine[];
};

const DAILY_2FA: ProviderCostLine = {
  label: "Daily 2FA ₹0.80 per hit (success + failed), not per txn",
  amount: "0.80",
  perTxn: false,
  gstIncluded: false,
};

const flat = (value: string, note: string | null = null): SuggestedIncomeRow => ({
  ruleType: "flat",
  value,
  capAmount: null,
  minAmount: null,
  maxAmount: null,
  note,
});

const pct = (value: string): SuggestedIncomeRow => ({ ...flat(value), ruleType: "percentage" });

const slab = (minAmount: string, maxAmount: string, value: string): SuggestedIncomeRow => ({
  ...flat(value),
  minAmount,
  maxAmount,
});

type Entry = { match: RegExp; ref: RateCardReference };

// First match wins (UPI before the generic cash-withdrawal pattern); matched against `${code} ${name}` lower-cased.
const ENTRIES: Entry[] = [
  {
    match: /upi[ _]?cash[ _]?point|upi[ _]?withdrawal|upi[ _]?qr/,
    ref: {
      mode: "share",
      incomeRows: [
        {
          ruleType: "percentage",
          value: "0.45",
          capAmount: null,
          minAmount: "101.00",
          maxAmount: "1000.00",
          note: "(0.5% − PSP ₹0.10) × 90% — PSP ₹0.09 not deducted, review",
        },
        {
          ruleType: "percentage",
          value: "0.45",
          capAmount: null,
          minAmount: "1000.01",
          maxAmount: "3000.00",
          note: "(0.5% − PSP ₹0.25) × 90% — PSP ₹0.225 not deducted, review",
        },
        {
          ruleType: "flat",
          value: "13.05",
          capAmount: null,
          minAmount: "3000.01",
          maxAmount: null,
          note: "(₹15 cap − PSP ₹0.50) × 90%",
        },
      ],
      askProvider: false,
      note: "(0.5% of amount, max ₹15 − PSP fee) × 90%",
      costs: [],
    },
  },
  {
    match: /cash[ _]?withdraw/,
    ref: {
      mode: "share",
      incomeRows: [
        slab("100.00", "499.99", "0.50"),
        slab("500.00", "999.99", "1.00"),
        slab("1000.00", "1499.99", "1.50"),
        slab("1500.00", "1999.99", "3.00"),
        slab("2000.00", "2499.99", "4.00"),
        slab("2500.00", "2999.99", "5.00"),
        slab("3000.00", "3499.99", "7.00"),
        slab("3500.00", "7999.99", "8.00"),
        slab("8000.00", "10000.00", "10.00"),
      ],
      askProvider: false,
      note: "Flat ₹ per txn by amount slab (provider sheet, 28 Oct). Below ₹100: no income.",
      costs: [DAILY_2FA],
    },
  },
  {
    match: /cash[ _]?deposit/,
    ref: {
      mode: "share",
      incomeRows: [
        { ...flat("0"), maxAmount: "100.00", note: "Up to ₹100 the provider pays nothing" },
        {
          ruleType: "percentage",
          value: null,
          capAmount: "13.95",
          minAmount: "100.01",
          maxAmount: null,
          note: "Interchange % pending from provider — enter it before saving",
        },
      ],
      askProvider: false,
      note: "Above ₹100: % of amount, capped at ₹13.95",
      costs: [DAILY_2FA],
    },
  },
  {
    match: /balance[ _]?enquiry|(^|[^a-z])on[ _-]?us([^a-z]|$)/,
    ref: { mode: "share", incomeRows: [flat("0")], askProvider: false, note: "Provider pays nothing", costs: [DAILY_2FA] },
  },
  {
    match: /mini[ _]?statement/,
    ref: { mode: "share", incomeRows: [flat("1.50")], askProvider: false, note: "₹1.50 flat per txn", costs: [DAILY_2FA] },
  },
  {
    match: /dth/,
    ref: {
      mode: "share",
      incomeRows: [pct("2.90")],
      askProvider: false,
      note: "Airtel DTV 3.70 · Dish 3.40 · Sun 3.20 · D2h 3.40 · Tata Play 2.90 (%). Suggestion uses the lowest.",
      costs: [],
    },
  },
  {
    match: /recharge|prepaid/,
    ref: {
      mode: "share",
      incomeRows: [pct("0.75")],
      askProvider: false,
      note: "Airtel 0.90 · BSNL 3.00 · VI 3.50 · Jio 0.75 (%). Suggestion uses the lowest.",
      costs: [],
    },
  },
  {
    match: /\bdmt\b|money[ _]?transfer/,
    ref: {
      mode: "fixed",
      incomeRows: null,
      askProvider: false,
      note: "No provider income. Customer fee 1% (min ₹10). Retailer = fee − GST − ₹2.50 (set in Schemes).",
      costs: [
        { label: "DMT processing ₹2.50 per txn", amount: "2.50", perTxn: true, gstIncluded: false },
        { label: "Remitter eKYC ₹10 (GST incl.), per remitter", amount: "10.00", perTxn: false, gstIncluded: true },
      ],
    },
  },
  {
    match: /payout|settlement/,
    ref: {
      mode: "fixed",
      incomeRows: null,
      askProvider: false,
      note: null,
      costs: [{ label: "Payout ₹1.50 / ₹3.50 / ₹6.50 by amount slab", amount: null, perTxn: false, gstIncluded: false }],
    },
  },
  {
    match: /verif|penny/,
    ref: {
      mode: "fixed",
      incomeRows: null,
      askProvider: false,
      note: null,
      costs: [{ label: "Verification charged per hit (success + failed)", amount: null, perTxn: false, gstIncluded: false }],
    },
  },
  {
    match: /cms|aadhaar[ _]?pay|bbps|bill/,
    ref: { mode: "share", incomeRows: null, askProvider: true, note: "Rate unknown — ask the provider", costs: [] },
  },
];

export function referenceFor(service: { code: string; name: string }): RateCardReference | null {
  const key = `${service.code} ${service.name}`.toLowerCase();
  return ENTRIES.find((e) => e.match.test(key))?.ref ?? null;
}

/** Input GST rate on provider costs (claimable credit — shown, not deducted). */
export const PROVIDER_COST_INPUT_GST_PERCENT = "18.0000";

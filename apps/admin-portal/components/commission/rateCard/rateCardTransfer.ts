import type { BrandedReport, ReportCell } from "@/lib/brandedExport";
import { parseCsv } from "@/lib/taxCommissionUtils";
import { downloadXlsx, type XlsxCell, type XlsxSheet } from "@/lib/xlsxWorkbook";
import { amountBound, incomeChanges, incomeRowError, newIncomeKey, type IncomeDraft } from "./IncomeSlabModal";
import { roleSplitError, slabSplitChanges, slabSplitOf, type SlabSplit } from "./roleSplit";
import {
  ROLE_LABEL,
  SCHEME_ROLES,
  inr,
  pct,
  ruleLabel,
  slabLabel,
  type IncomeRule,
  type PendingChange,
  type RateCardData,
  type SchemeRole,
  type ServiceRow,
  type Slab,
} from "./types";
import type { SplitMode } from "./ui";

/**
 * One row per slab, easy to edit in Excel: a money cell is a plain number for flat ₹ ("0.5") or ends
 * with % for a percentage ("80%"). The same columns are read back on import; the last two are info only.
 */
export const RATE_CARD_CSV_HEADER = [
  "Service",
  "Service code",
  "Slab from",
  "Slab to",
  "Provider pays",
  "Provider max",
  "Retailer",
  "Distributor",
  "SD",
  "Example amount",
  "Company keeps",
] as const;

/** Header key after dropping case, spaces and punctuation ("Slab from" / "slab_from" → "slabfrom"). */
const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const ROLE_KEY: Record<SchemeRole, string> = {
  retailer: "retailer",
  distributor: "distributor",
  super_distributor: "sd",
};

const num = (v: string | null | undefined) => (v == null || v === "" ? "" : String(Number(v)));

/** Saved provider income row behind a slab line: same bounds first, else the row covering its sample. */
function incomeRuleOf(row: ServiceRow, s: Slab): IncomeRule | null {
  const exact = row.providerIncomeRules.find((r) => r.minAmount === s.minAmount && r.maxAmount === s.maxAmount);
  if (exact) return exact;
  const sample = Number(s.sampleAmount);
  return (
    row.providerIncomeRules.find(
      (r) => (r.minAmount == null || Number(r.minAmount) <= sample) && (r.maxAmount == null || Number(r.maxAmount) >= sample),
    ) ?? null
  );
}

/** "0.5" for flat ₹, "80%" for a percentage, "" when the role earns nothing set on this slab. */
function splitCells(s: Slab): string[] {
  const split = slabSplitOf(s);
  return SCHEME_ROLES.map((role) => {
    const v = split.values[role];
    if (v === "") return "";
    return split.modes[role] === "percent" ? `${v}%` : v;
  });
}

export function rateCardCsvRows(data: RateCardData): string[][] {
  return data.services.flatMap((row) =>
    row.slabs.map((s) => {
      // Only a row with the same bounds — a wider "any amount" rate stays blank so import does not split it.
      const income = row.providerIncomeRules.find((r) => r.minAmount === s.minAmount && r.maxAmount === s.maxAmount) ?? null;
      return [
        row.serviceName,
        row.serviceCode,
        num(s.minAmount),
        num(s.maxAmount),
        income ? (income.ruleType === "flat" ? num(income.value) : `${num(income.value)}%`) : "",
        income?.capAmount ? num(income.capAmount) : "",
        ...splitCells(s),
        num(s.sampleAmount),
        num(s.companyKeeps),
      ];
    }),
  );
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** UTF-8 BOM so Excel opens names correctly. */
export function rateCardCsv(data: RateCardData): string {
  const lines = [[...RATE_CARD_CSV_HEADER], ...rateCardCsvRows(data)];
  return `\uFEFF${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function roleCell(s: Slab, role: SchemeRole): ReportCell {
  const r = s.roles.find((x) => x.role === role);
  if (!r) return { text: "—", align: "right" };
  const how =
    r.source === "share"
      ? `${r.shareFlat != null ? "Flat" : `${pct(r.sharePercent)} share`}${r.shareSlab ? " · slab" : ""}`
      : r.source === "rule"
        ? "Fixed rule"
        : r.source === "none"
          ? "None"
          : "Override";
  return { text: inr(r.gross), sub: how, align: "right", tone: r.source === "none" ? "debit" : undefined };
}

export function rateCardReport(data: RateCardData, scopeName: string): BrandedReport {
  const rows: ReportCell[][] = data.services.flatMap((row) =>
    row.slabs.map((s): ReportCell[] => {
      const income = incomeRuleOf(row, s);
      return [
        { text: row.serviceName, sub: row.categoryName },
        { text: slabLabel(s.minAmount, s.maxAmount), sub: `Example ${inr(s.sampleAmount)}` },
        {
          text: s.providerIncome != null ? inr(s.providerIncome) : "Not set",
          sub: income ? ruleLabel(income.ruleType, income.value, income.capAmount) : undefined,
          align: "right",
          tone: s.providerIncome == null ? "requested" : undefined,
        },
        roleCell(s, "retailer"),
        roleCell(s, "distributor"),
        roleCell(s, "super_distributor"),
        {
          text: s.underwater ? `Loses ${inr(Math.abs(Number(s.companyKeeps)))}` : inr(s.companyKeeps),
          align: "right",
          tone: s.underwater ? "debit" : "credit",
        },
      ];
    }),
  );
  const losing = data.services.reduce((n, r) => n + r.slabs.filter((s) => s.underwater).length, 0);
  const date = new Date().toISOString().slice(0, 10);
  return {
    title: "Commission rate card",
    fileName: `rate-card-${date}`,
    meta: [
      { label: "Providers", value: scopeName },
      { label: "Generated on", value: new Date().toLocaleString("en-IN") },
      { label: "TDS", value: data.tenantTax.tdsApplies ? pct(data.tenantTax.tdsPercent) : "Off" },
    ],
    summary: [
      { label: "Services", value: String(data.services.length) },
      { label: "Slabs", value: String(rows.length) },
      { label: "Slabs losing money", value: String(losing), tone: losing ? "debit" : "credit" },
    ],
    columns: [
      { label: "Service" },
      { label: "Slab" },
      { label: "Provider pays", align: "right" },
      { label: ROLE_LABEL.retailer, align: "right" },
      { label: ROLE_LABEL.distributor, align: "right" },
      { label: ROLE_LABEL.super_distributor, align: "right" },
      { label: "Company keeps", align: "right" },
    ],
    rows,
    footerNote: "Amounts are per transaction on the example amount, before TDS. Company keeps = provider pays + customer fee − role gross.",
  };
}

// ── Excel workbook (.xlsx): Summary tab + one tab per service ──

const money = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));

function roleHow(s: Slab, role: SchemeRole): string {
  const r = s.roles.find((x) => x.role === role);
  if (!r) return "";
  if (r.source === "share") return `${r.shareFlat != null ? "Flat" : `${Number(r.sharePercent)}% share`}${r.shareSlab ? " (slab)" : ""}`;
  if (r.source === "rule") return "Fixed rule";
  return r.source === "none" ? "None" : "Override";
}

const head = (labels: string[]): XlsxCell[] => labels.map((v) => ({ v, s: "head" }));
const numCell = (v: number | null): XlsxCell => ({ v, s: "num" });

/** Downloads the rate card as an .xlsx workbook: a Summary tab, then one tab per service with its slabs. */
export function downloadRateCardWorkbook(data: RateCardData, scopeName: string): void {
  const generated = new Date().toLocaleString("en-IN");

  const summary: XlsxSheet = {
    name: "Summary",
    freezeRows: 4,
    widths: [26, 20, 8, 20, 18, 22],
    rows: [
      [{ v: "Commission rate card", s: "title" }],
      [{ v: `${scopeName} · generated ${generated} · amounts per txn before TDS`, s: "muted" }],
      [],
      head(["Service", "Category", "Slabs", "Provider pays not set", "Slabs losing money", "Slabs with a role on ₹0"]),
      ...data.services.map((row): XlsxCell[] => {
        const losing = row.slabs.filter((s) => s.underwater).length;
        return [
          row.serviceName,
          row.categoryName,
          row.slabs.length,
          row.slabs.filter((s) => s.providerIncome == null).length,
          losing ? { v: losing, s: "loss" } : losing,
          row.slabs.filter((s) => s.missingRoles.length > 0).length,
        ];
      }),
    ],
  };

  const serviceSheets: XlsxSheet[] = data.services.map((row) => ({
    name: row.serviceName,
    freezeRows: 4,
    widths: [11, 11, 14, 22, 15, 12, 16, 13, 16, 10, 16, 16],
    rows: [
      [{ v: row.serviceName, s: "title" }],
      [{ v: `${row.categoryName} · ${row.serviceCode} · ${scopeName} · generated ${generated}`, s: "muted" }],
      [],
      head([
        "Slab from",
        "Slab to",
        "Example amount",
        "Provider pays (rate)",
        "Provider pays ₹",
        ...SCHEME_ROLES.flatMap((r) => [`${ROLE_LABEL[r]} ₹`, `${ROLE_LABEL[r]} how`]),
        "Company keeps ₹",
      ]),
      ...row.slabs.map((s): XlsxCell[] => {
        const income = incomeRuleOf(row, s);
        return [
          numCell(money(s.minAmount)),
          numCell(money(s.maxAmount)),
          numCell(money(s.sampleAmount)),
          income ? ruleLabel(income.ruleType, income.value, income.capAmount) : "Not set",
          numCell(money(s.providerIncome)),
          ...SCHEME_ROLES.flatMap((r): XlsxCell[] => [numCell(money(s.roles.find((x) => x.role === r)?.gross)), roleHow(s, r)]),
          { v: Number(s.companyKeeps), s: s.underwater ? "loss" : "num" },
        ];
      }),
    ],
  }));

  downloadXlsx(`rate-card-${new Date().toISOString().slice(0, 10)}.xlsx`, [summary, ...serviceSheets]);
}

// ── Fill "Provider pays" from the provider sheet (services with no provider income yet) ──

/** The service has full sheet numbers and nothing saved yet. */
export function sheetReady(row: ServiceRow): boolean {
  const rows = row.reference?.incomeRows;
  return row.providerIncomeRules.length === 0 && Boolean(rows?.length) && rows!.every((r) => r.value != null);
}

/** Services still waiting for the provider to share a rate. */
export function askProvider(row: ServiceRow): boolean {
  if (row.providerIncomeRules.length > 0 || sheetReady(row)) return false;
  return Boolean(row.reference?.askProvider || row.reference?.incomeRows?.some((r) => r.value == null));
}

/** Review-popup request that saves the sheet slabs for every ready service. */
export function sheetFillRequest(data: RateCardData) {
  const ready = data.services.filter(sheetReady);
  const ask = data.services.filter(askProvider).length;
  const changes: PendingChange[] = ready.flatMap((s) =>
    s.reference!.incomeRows!.map((r) => ({
      label: `${s.serviceName} · provider pays`,
      detail: `${slabLabel(r.minAmount, r.maxAmount)}: ${ruleLabel(r.ruleType, r.value, r.capAmount)}`,
      method: "post" as const,
      url: "/admin/rate-card/provider-income",
      body: {
        serviceId: s.serviceId,
        providerId: null,
        ruleType: r.ruleType,
        value: r.value,
        capAmount: r.capAmount,
        minAmount: r.minAmount,
        maxAmount: r.maxAmount,
      },
    })),
  );
  return {
    title: `Fill ${ready.length} service${ready.length === 1 ? "" : "s"} from provider sheet`,
    changes,
    warnings: ask > 0 ? [`${ask} service${ask === 1 ? "" : "s"} still need the rate from the provider.`] : [],
  };
}

export type ImportPlan = {
  changes: PendingChange[];
  errors: string[];
  rowsRead: number;
  unchangedRows: number;
};

const MAX_ERRORS = 25;

/** Money / amount text from Excel: drops ₹ (or the "?" it turns into), commas and spaces. */
const cleanNumber = (v: string) => v.replace(/[₹?,\s]/g, "").replace(/^rs\.?/i, "");

/** "0.5" → flat ₹; "80%" → percent. null = blank cell (leave as is). */
function parseMoney(raw: string): { mode: SplitMode; value: string } | "bad" | null {
  const t = raw.trim();
  if (t === "") return null;
  const percent = /%\s*$/.test(t);
  const value = cleanNumber(t.replace(/%\s*$/, ""));
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return "bad";
  return { mode: percent ? "percent" : "flat", value: String(Number(value)) };
}

/**
 * Slab bounds from "Slab from" / "Slab to", or from one "Slab" cell such as
 * "₹100.00 – ₹199.99 · Example ₹199.99", "Any amount", "Up to ₹1,000" or "₹3,000+".
 */
function parseBounds(get: (k: string) => string): { from: string; to: string } | "bad" {
  if (get("slabfrom") || get("slabto")) return { from: cleanNumber(get("slabfrom")), to: cleanNumber(get("slabto")) };
  const raw = get("slab").split("·")[0]!.trim();
  if (raw === "" || /any/i.test(raw)) return { from: "", to: "" };
  const nums = (raw.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
  if (/up\s*to/i.test(raw) && nums.length === 1) return { from: "", to: nums[0]! };
  if (/\+\s*$/.test(raw) && nums.length === 1) return { from: nums[0]!, to: "" };
  if (nums.length >= 2) return { from: nums[0]!, to: nums[1]! };
  return "bad";
}

/**
 * Reads an edited rate card CSV and returns only the writes that differ from what is saved.
 * Accepts the export columns (Service, Slab from, Slab to, Provider pays, Retailer, Distributor, SD) with
 * "80%" for a percentage and a plain number for flat ₹, a single "Slab" text column, and the older
 * *_type / *_value template. Blank cells mean "leave as is"; 0 means ₹0. Nothing is written when any row is invalid.
 */
export function planRateCardImport(
  text: string,
  data: RateCardData,
  providerId: string | null,
  providerName: string,
): ImportPlan {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const changes: PendingChange[] = [];
  const fail = (msg: string): ImportPlan => ({ changes, errors: [msg], rowsRead: 0, unchangedRows: 0 });
  if (rows.length === 0) return fail("The file is empty. Export the rate card as CSV and edit that file.");

  const header = rows[0]!.map(headerKey);
  const col = (key: string) => header.indexOf(key);
  if (col("service") < 0 && col("servicecode") < 0 && col("servicename") < 0) {
    return fail('Column "Service" is missing. Use the CSV from Export → CSV as the template.');
  }
  if (col("slab") < 0 && col("slabfrom") < 0 && col("slabto") < 0) {
    return fail('Columns "Slab from" and "Slab to" (or one "Slab" column) are missing. Use the CSV from Export → CSV.');
  }

  const byCode = new Map(data.services.map((s) => [s.serviceCode.toLowerCase(), s]));
  const byName = new Map(data.services.map((s) => [s.serviceName.toLowerCase(), s]));
  const isAmount = (v: string) => /^\d+(\.\d{1,2})?$/.test(v);
  let unchangedRows = 0;
  const body = rows.slice(1);

  body.forEach((cells, i) => {
    if (errors.length >= MAX_ERRORS) return;
    const line = i + 2;
    const get = (key: string) => (col(key) >= 0 ? (cells[col(key)] ?? "").trim() : "");

    // Service: code first, else the name (an exported "Cash Withdraw · Banking Services" works too).
    const code = get("servicecode");
    const name = (get("service") || get("servicename")).split("·")[0]!.trim();
    const service = (code && byCode.get(code.toLowerCase())) || byName.get(name.toLowerCase()) || byCode.get(name.toLowerCase());
    if (!service) {
      errors.push(`Row ${line}: service "${code || name}" not found. Use the service name or code from the export.`);
      return;
    }
    const where = `Row ${line} (${service.serviceName})`;

    const bounds = parseBounds(get);
    if (bounds === "bad" || (bounds.from && !isAmount(bounds.from)) || (bounds.to && !isAmount(bounds.to))) {
      errors.push(`${where}: slab must be rupees like 100 and 199.99 (or "Any amount")`);
      return;
    }
    const { from, to } = bounds;
    if (to && Number(to) <= 0) {
      errors.push(`${where}: Slab to must be more than 0 — leave it blank for any amount`);
      return;
    }
    if (from && to && Number(from) > Number(to)) {
      errors.push(`${where}: Slab from cannot be more than Slab to`);
      return;
    }
    const minAmount = from || null;
    const maxAmount = to || null;
    const sameBounds = (r: { minAmount: string | null; maxAmount: string | null }) =>
      amountBound(r.minAmount) === amountBound(minAmount) && amountBound(r.maxAmount) === amountBound(maxAmount);
    const rowChanges: PendingChange[] = [];

    // Provider pays: "13.95" flat, "0.465%" percent (+ optional "Provider max" cap); old template too.
    const oldType = get("providertype").toLowerCase();
    const provider =
      oldType || get("providervalue")
        ? parseMoney(`${get("providervalue")}${oldType === "percent" ? "%" : ""}`)
        : parseMoney(get("providerpays"));
    if (provider === "bad") {
      errors.push(`${where}: Provider pays must be a number like 1.5 or a percent like 0.465%`);
      return;
    }
    if (provider) {
      const draft: IncomeDraft = {
        key: newIncomeKey(),
        replacesId: null,
        providerId,
        ruleType: provider.mode === "flat" ? "flat" : "percentage",
        value: provider.value,
        capAmount: provider.mode === "percent" ? cleanNumber(get("providermax") || get("providercap")) : "",
        minAmount: from,
        maxAmount: to,
        note: null,
      };
      const err = incomeRowError(draft);
      if (err) {
        errors.push(`${where}: ${err}`);
        return;
      }
      const saved = service.providerIncomeRules.find((r) => r.providerId === providerId && sameBounds(r));
      const same =
        saved &&
        saved.ruleType === draft.ruleType &&
        Number(saved.value) === Number(draft.value) &&
        amountBound(saved.capAmount) === amountBound(draft.capAmount);
      if (!same) rowChanges.push(...incomeChanges(service, draft, providerName));
    }

    // Role split for this slab: "0.5" flat ₹ or "80%"; old *_type / *_value columns too.
    const slab = service.slabs.find(sameBounds);
    const initial: SlabSplit = slab
      ? slabSplitOf(slab)
      : {
          modes: { retailer: "percent", distributor: "percent", super_distributor: "percent" },
          values: { retailer: "", distributor: "", super_distributor: "" },
        };
    const next: SlabSplit = { modes: { ...initial.modes }, values: { ...initial.values } };
    for (const role of SCHEME_ROLES) {
      const key = ROLE_KEY[role];
      const oldRoleType = get(`${key}type`).toLowerCase();
      const parsed =
        oldRoleType || get(`${key}value`)
          ? parseMoney(`${get(`${key}value`)}${oldRoleType === "percent" ? "%" : ""}`)
          : parseMoney(get(key));
      if (parsed === null) continue;
      const err = parsed === "bad" ? `${ROLE_LABEL[role]} must be a number like 0.5 or a percent like 80%` : roleSplitError(role, parsed.mode, parsed.value);
      if (err || parsed === "bad") {
        errors.push(`${where}: ${err}`);
        return;
      }
      next.modes[role] = parsed.mode;
      next.values[role] = parsed.value;
    }
    rowChanges.push(...slabSplitChanges({ row: service, initial, next, providerId, minAmount, maxAmount }));

    if (rowChanges.length === 0) unchangedRows += 1;
    changes.push(...rowChanges);
  });

  if (errors.length >= MAX_ERRORS) errors.push("Stopped after 25 problems — fix these and import again.");
  return { changes: errors.length ? [] : changes, errors, rowsRead: body.length, unchangedRows };
}

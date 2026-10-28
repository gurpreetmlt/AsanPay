import type { BrandedReport, ReportCell } from "@/lib/brandedExport";
import { parseCsv } from "@/lib/taxCommissionUtils";
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

/** One row per slab. The same columns are read back on import; the last two are info only. */
export const RATE_CARD_CSV_HEADER = [
  "service_code",
  "service_name",
  "slab_from",
  "slab_to",
  "provider_type",
  "provider_value",
  "provider_cap",
  "retailer_type",
  "retailer_value",
  "distributor_type",
  "distributor_value",
  "sd_type",
  "sd_value",
  "example_amount",
  "company_keeps",
] as const;

const ROLE_COLUMN: Record<SchemeRole, string> = {
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

function splitCells(s: Slab): string[] {
  const split = slabSplitOf(s);
  return SCHEME_ROLES.flatMap((role) => {
    const v = split.values[role];
    return v === "" ? ["", ""] : [split.modes[role], v];
  });
}

export function rateCardCsvRows(data: RateCardData): string[][] {
  return data.services.flatMap((row) =>
    row.slabs.map((s) => {
      // Only a row with the same bounds — a wider "any amount" rate stays blank so import does not split it.
      const income = row.providerIncomeRules.find((r) => r.minAmount === s.minAmount && r.maxAmount === s.maxAmount) ?? null;
      return [
        row.serviceCode,
        row.serviceName,
        num(s.minAmount),
        num(s.maxAmount),
        income ? (income.ruleType === "flat" ? "flat" : "percent") : "",
        income ? num(income.value) : "",
        income?.capAmount ? num(income.capAmount) : "",
        ...splitCells(s),
        num(s.sampleAmount),
        num(s.companyKeeps),
      ];
    }),
  );
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** UTF-8 BOM so Excel opens ₹ and names correctly. */
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

// ── Excel workbook: Summary tab + one tab per service (SpreadsheetML 2003, opens in Excel) ──

type XCell = string | number | null;

const xmlEsc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function xCell(v: XCell, style?: string): string {
  const s = style ? ` ss:StyleID="${style}"` : "";
  if (v === null || v === "") return `<Cell${s}/>`;
  if (typeof v === "number") return `<Cell${s}><Data ss:Type="Number">${v}</Data></Cell>`;
  return `<Cell${s}><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`;
}

const xRow = (cells: string[]) => `<Row>${cells.join("")}</Row>`;
const money = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));

/** Excel tab names: max 31 chars, no []:*?/\ and unique in the workbook. */
function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const tail = ` (${n})`;
    name = `${base.slice(0, 31 - tail.length)}${tail}`;
  }
  used.add(name.toLowerCase());
  return name;
}

function roleHow(s: Slab, role: SchemeRole): string {
  const r = s.roles.find((x) => x.role === role);
  if (!r) return "";
  if (r.source === "share") return `${r.shareFlat != null ? "Flat" : `${Number(r.sharePercent)}% share`}${r.shareSlab ? " (slab)" : ""}`;
  if (r.source === "rule") return "Fixed rule";
  return r.source === "none" ? "None" : "Override";
}

function worksheet(name: string, widths: number[], rows: string[]): string {
  const cols = widths.map((w) => `<Column ss:Width="${w}"/>`).join("");
  return `<Worksheet ss:Name="${xmlEsc(name)}"><Table>${cols}${rows.join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
}

/** Downloads the rate card as an Excel workbook: a Summary tab, then one tab per service with its slabs. */
export function downloadRateCardWorkbook(data: RateCardData, scopeName: string): void {
  const used = new Set<string>();
  const generated = new Date().toLocaleString("en-IN");
  const sheets: string[] = [];

  const summaryRows = [
    xRow([xCell("Commission rate card", "title")]),
    xRow([xCell(`${scopeName} · generated ${generated} · amounts per txn before TDS`, "muted")]),
    xRow([]),
    xRow(
      ["Service", "Category", "Slabs", "Provider pays not set", "Slabs losing money", "Slabs with a role on ₹0"].map((h) =>
        xCell(h, "head"),
      ),
    ),
    ...data.services.map((row) =>
      xRow([
        xCell(row.serviceName),
        xCell(row.categoryName),
        xCell(row.slabs.length),
        xCell(row.slabs.filter((s) => s.providerIncome == null).length),
        xCell(row.slabs.filter((s) => s.underwater).length, row.slabs.some((s) => s.underwater) ? "loss" : undefined),
        xCell(row.slabs.filter((s) => s.missingRoles.length > 0).length),
      ]),
    ),
  ];
  sheets.push(worksheet(sheetName("Summary", used), [170, 140, 60, 130, 120, 140], summaryRows));

  for (const row of data.services) {
    const header = [
      "Slab from",
      "Slab to",
      "Example amount",
      "Provider pays (rate)",
      "Provider pays ₹",
      ...SCHEME_ROLES.flatMap((r) => [`${ROLE_LABEL[r]} ₹`, `${ROLE_LABEL[r]} how`]),
      "Company keeps ₹",
    ];
    const rows = [
      xRow([xCell(row.serviceName, "title")]),
      xRow([xCell(`${row.categoryName} · ${row.serviceCode} · ${scopeName} · generated ${generated}`, "muted")]),
      xRow([]),
      xRow(header.map((h) => xCell(h, "head"))),
      ...row.slabs.map((s) => {
        const income = incomeRuleOf(row, s);
        return xRow([
          xCell(money(s.minAmount), "num"),
          xCell(money(s.maxAmount), "num"),
          xCell(money(s.sampleAmount), "num"),
          xCell(income ? ruleLabel(income.ruleType, income.value, income.capAmount) : "Not set"),
          xCell(money(s.providerIncome), "num"),
          ...SCHEME_ROLES.flatMap((r) => {
            const split = s.roles.find((x) => x.role === r);
            return [xCell(money(split?.gross), "num"), xCell(roleHow(s, r))];
          }),
          xCell(Number(s.companyKeeps), s.underwater ? "loss" : "num"),
        ]);
      }),
    ];
    sheets.push(worksheet(sheetName(row.serviceName, used), [70, 70, 90, 130, 90, 75, 95, 85, 95, 60, 95, 100], rows));
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles>` +
    `<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#1E3A8A"/></Style>` +
    `<Style ss:ID="muted"><Font ss:Color="#64748B"/></Style>` +
    `<Style ss:ID="head"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2A5CDD" ss:Pattern="Solid"/></Style>` +
    `<Style ss:ID="num"><NumberFormat ss:Format="#,##0.00"/></Style>` +
    `<Style ss:ID="loss"><Font ss:Bold="1" ss:Color="#B91C1C"/><NumberFormat ss:Format="#,##0.00"/></Style>` +
    `</Styles>${sheets.join("")}</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rate-card-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ImportPlan = {
  changes: PendingChange[];
  errors: string[];
  rowsRead: number;
  unchangedRows: number;
};

const MAX_ERRORS = 25;

/**
 * Reads an edited rate card CSV and returns only the writes that differ from what is saved.
 * Blank provider / role cells mean "leave as is"; 0 means ₹0. Nothing is written when any row is invalid.
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
  if (rows.length === 0) return { changes, errors: ["The file is empty. Export the rate card as CSV and edit that file."], rowsRead: 0, unchangedRows: 0 };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const required of ["service_code", "slab_from", "slab_to"]) {
    if (col(required) < 0) {
      return {
        changes,
        errors: [`Column "${required}" is missing. Use the CSV from Export → CSV as the template.`],
        rowsRead: 0,
        unchangedRows: 0,
      };
    }
  }

  const byCode = new Map(data.services.map((s) => [s.serviceCode.toLowerCase(), s]));
  const isAmount = (v: string) => /^\d+(\.\d{1,2})?$/.test(v);
  const isRate = (v: string) => /^\d+(\.\d{1,4})?$/.test(v);
  let unchangedRows = 0;
  const body = rows.slice(1);

  body.forEach((cells, i) => {
    if (errors.length >= MAX_ERRORS) return;
    const line = i + 2;
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");
    const code = get("service_code");
    const service = byCode.get(code.toLowerCase());
    if (!service) {
      errors.push(`Row ${line}: service code "${code}" not found. Keep the service_code from the export.`);
      return;
    }
    const from = get("slab_from");
    const to = get("slab_to");
    if ((from && !isAmount(from)) || (to && !isAmount(to))) {
      errors.push(`Row ${line} (${service.serviceName}): slab_from / slab_to must be rupees like 100 or 199.99`);
      return;
    }
    if (to && Number(to) <= 0) {
      errors.push(`Row ${line} (${service.serviceName}): slab_to must be more than 0 — leave it blank for any amount`);
      return;
    }
    if (from && to && Number(from) > Number(to)) {
      errors.push(`Row ${line} (${service.serviceName}): slab_from cannot be more than slab_to`);
      return;
    }
    const minAmount = from || null;
    const maxAmount = to || null;
    const sameBounds = (r: { minAmount: string | null; maxAmount: string | null }) =>
      amountBound(r.minAmount) === amountBound(minAmount) && amountBound(r.maxAmount) === amountBound(maxAmount);
    const rowChanges: PendingChange[] = [];

    // Provider pays
    const pType = get("provider_type").toLowerCase();
    const pValue = get("provider_value");
    const pCap = get("provider_cap");
    if (pType || pValue) {
      if (pType !== "flat" && pType !== "percent") {
        errors.push(`Row ${line} (${service.serviceName}): provider_type must be flat or percent`);
        return;
      }
      if (!isRate(pValue)) {
        errors.push(`Row ${line} (${service.serviceName}): provider_value must be a number like 1.5`);
        return;
      }
      const draft: IncomeDraft = {
        key: newIncomeKey(),
        replacesId: null,
        providerId,
        ruleType: pType === "flat" ? "flat" : "percentage",
        value: pValue,
        capAmount: pType === "percent" ? pCap : "",
        minAmount: from,
        maxAmount: to,
        note: null,
      };
      const err = incomeRowError(draft);
      if (err) {
        errors.push(`Row ${line} (${service.serviceName}): ${err}`);
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

    // Role split for this slab
    const slab = service.slabs.find(sameBounds);
    const initial: SlabSplit = slab
      ? slabSplitOf(slab)
      : {
          modes: { retailer: "percent", distributor: "percent", super_distributor: "percent" },
          values: { retailer: "", distributor: "", super_distributor: "" },
        };
    const next: SlabSplit = { modes: { ...initial.modes }, values: { ...initial.values } };
    for (const role of SCHEME_ROLES) {
      const t = get(`${ROLE_COLUMN[role]}_type`).toLowerCase();
      const v = get(`${ROLE_COLUMN[role]}_value`);
      if (!t && !v) continue;
      if (t !== "flat" && t !== "percent") {
        errors.push(`Row ${line} (${service.serviceName}): ${ROLE_COLUMN[role]}_type must be flat or percent`);
        return;
      }
      const mode: SplitMode = t;
      const err = !isRate(v) ? `${ROLE_LABEL[role]} value must be a number like 80 or 0.5` : roleSplitError(role, mode, v);
      if (err) {
        errors.push(`Row ${line} (${service.serviceName}): ${err}`);
        return;
      }
      next.modes[role] = mode;
      next.values[role] = v;
    }
    rowChanges.push(...slabSplitChanges({ row: service, initial, next, providerId, minAmount, maxAmount }));

    if (rowChanges.length === 0) unchangedRows += 1;
    changes.push(...rowChanges);
  });

  if (errors.length >= MAX_ERRORS) errors.push("Stopped after 25 problems — fix these and import again.");
  return { changes: errors.length ? [] : changes, errors, rowsRead: body.length, unchangedRows };
}

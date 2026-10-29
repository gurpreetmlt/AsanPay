import type { BrandedReport, ReportCell } from "@/lib/brandedExport";
import { downloadXlsx, type XlsxCell, type XlsxSheet } from "@/lib/xlsxWorkbook";
import { slabSplitOf } from "./roleSplit";
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

/**
 * One row per slab, easy to edit in Excel: a money cell is a plain number for flat ₹ ("0.5") or ends
 * with % for a percentage ("80%"). The same columns are read back on import; the last two are info only.
 */
export const RATE_CARD_CSV_HEADER = [
  "Service",
  "Service code",
  "Provider",
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
export const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export const ROLE_KEY: Record<SchemeRole, string> = {
  retailer: "retailer",
  distributor: "distributor",
  super_distributor: "sd",
};

const num = (v: string | null | undefined) => (v == null || v === "" ? "" : String(Number(v)));

export const ALL_PROVIDERS = "All providers";

/** Provider cell for a slab: the saved income row's own provider, else the provider the card shows. */
function providerCellOf(data: RateCardData, income: IncomeRule | null): string {
  const id = income ? income.providerId : data.providerId;
  return id ? (data.providers.find((p) => p.id === id)?.name ?? ALL_PROVIDERS) : ALL_PROVIDERS;
}

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
        providerCellOf(data, income),
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

// ── Excel workbook (.xlsx): an editable sheet — Summary tab + one tab per service ──

export const FLAT = "Flat ₹";
export const SHARE = "Share %";
export const PCT_OF_AMOUNT = "% of amount";

export const SUMMARY_TAB = "Summary";
export const HOW_TO_TAB = "How to fill";
/** Summary-tab labels the importer reads back for the stale-file check. */
export const META_EXPORTED_AT = "Exported at";
export const META_DATA_VERSION = "Data version";
const META_FILE_TYPE = "File type";
/** Header row of every service tab; import reads these names back. */
export const SHEET_HEADER = [
  "Slab from",
  "Slab to",
  "Example amount",
  "Provider type",
  "Provider pays",
  "Provider max",
  "Retailer type",
  "Retailer",
  "Distributor type",
  "Distributor",
  "SD type",
  "SD",
  "Company keeps",
  "Provider",
];

const head = (labels: string[]): XlsxCell[] => labels.map((v) => ({ v, s: "head" }));

/** Company keeps for sheet row `r`, recalculated by Excel as the white cells change. */
function keepsFormula(r: number, incomeNow: number): string {
  const provider = `IF(E${r}="",${incomeNow},IF(D${r}="${PCT_OF_AMOUNT}",IF(F${r}="",C${r}*E${r}/100,MIN(C${r}*E${r}/100,F${r})),E${r}))`;
  const role = (t: string, v: string) => `IF(${v}${r}="",0,IF(${t}${r}="${SHARE}",(${provider})*${v}${r}/100,${v}${r}))`;
  return `ROUND(${provider}-${role("G", "H")}-${role("I", "J")}-${role("K", "L")},2)`;
}

/** Empty rows a blank template tab starts with (Company keeps formula already in place). */
const TEMPLATE_ROWS = 15;

function serviceSheet(row: ServiceRow, data: RateCardData, template = false): XlsxSheet {
  const slabs = template ? [] : row.slabs;
  const firstData = 4;
  const lastData = firstData + Math.max(slabs.length, template ? TEMPLATE_ROWS : 1) - 1;
  const lastEditable = lastData + 100;
  const typeCols = ["G", "I", "K"];
  return {
    name: row.serviceName,
    freezeRows: 3,
    autoFilter: `A3:N${lastData}`,
    widths: [11, 11, 14, 14, 13, 12, 14, 10, 16, 12, 12, 9, 15, 18],
    validations: [
      { sqref: `D${firstData}:D${lastEditable}`, list: [FLAT, PCT_OF_AMOUNT] },
      ...typeCols.map((c) => ({ sqref: `${c}${firstData}:${c}${lastEditable}`, list: [FLAT, SHARE] })),
      { sqref: `N${firstData}:N${lastEditable}`, list: [ALL_PROVIDERS, ...data.providers.map((p) => p.name)] },
    ],
    highlights: ["D", ...typeCols].flatMap((c) => [
      { sqref: `${c}${firstData}:${c}${lastEditable}`, equals: FLAT, tone: "green" as const },
      { sqref: `${c}${firstData}:${c}${lastEditable}`, equals: c === "D" ? PCT_OF_AMOUNT : SHARE, tone: "blue" as const },
    ]),
    rows: [
      [{ v: row.serviceName, s: "title" }, ...Array(11).fill(null), { v: row.serviceCode, s: "muted" }],
      [
        {
          v: "Edit the white cells. Type: Flat ₹ = rupees per txn · Share % = % of what the provider pays · % of amount = provider rate on the txn. Provider (last column) = who this slab is for. Blank = no change. Grey cells are worked out for you.",
          s: "note",
        },
      ],
      head(SHEET_HEADER),
      ...Array.from({ length: template ? TEMPLATE_ROWS : 0 }, (_, i): XlsxCell[] => [
        ...Array<XlsxCell>(12).fill(null),
        { f: keepsFormula(firstData + i, 0), s: "info" },
      ]),
      ...slabs.map((s, i): XlsxCell[] => {
        const income = row.providerIncomeRules.find((r) => r.minAmount === s.minAmount && r.maxAmount === s.maxAmount) ?? null;
        const split = slabSplitOf(s);
        const roleCells = SCHEME_ROLES.flatMap((role): XlsxCell[] => {
          const v = split.values[role];
          if (v === "") return [null, null];
          return [split.modes[role] === "percent" ? SHARE : FLAT, Number(v)];
        });
        return [
          s.minAmount != null ? Number(s.minAmount) : null,
          s.maxAmount != null ? Number(s.maxAmount) : null,
          { v: Number(s.sampleAmount), s: "info" },
          income ? (income.ruleType === "flat" ? FLAT : PCT_OF_AMOUNT) : null,
          income ? Number(income.value) : null,
          income?.capAmount ? Number(income.capAmount) : null,
          ...roleCells,
          { f: keepsFormula(firstData + i, Number(s.providerIncome ?? 0)), s: "info" },
          providerCellOf(data, income),
        ];
      }),
    ],
  };
}

export type WorkbookOptions = {
  /** Same tabs, headers and dropdowns but no slab rows. */
  template?: boolean;
  /** Only these services get a tab (e.g. one expanded service). */
  serviceIds?: string[];
};

const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";

/** Downloads the rate card as an editable .xlsx: Summary, How to fill, then one tab per service (re-import with Import). */
export function downloadRateCardWorkbook(data: RateCardData, scopeName: string, opts: WorkbookOptions = {}): void {
  const date = new Date().toISOString().slice(0, 10);
  const only = opts.serviceIds?.length === 1 ? data.services.find((s) => s.serviceId === opts.serviceIds![0]) : null;
  const name = opts.template
    ? `rate-card-template-${date}`
    : only
      ? `rate-card-${fileSlug(only.serviceName)}-${date}`
      : `rate-card-${date}`;
  downloadXlsx(`${name}.xlsx`, rateCardWorkbookSheets(data, scopeName, opts));
}

/** Short instructions + a worked example; the importer skips this tab. */
function howToSheet(data: RateCardData): XlsxSheet {
  const note = (v: string): XlsxCell[] => [{ v, s: "note" }];
  return {
    name: HOW_TO_TAB,
    widths: [11, 11, 14, 14, 13, 12, 14, 10, 16, 12, 12, 9, 15, 18, 60],
    rows: [
      [{ v: "How to fill this workbook", s: "title" }],
      [],
      note("1. Every service has its own tab. One row = one slab (amount range). Leave Slab from and Slab to blank for any amount."),
      note(`2. Type columns: ${FLAT} = rupees per transaction. ${SHARE} = % of what the provider pays (role columns).`),
      note(`   ${PCT_OF_AMOUNT} = the provider's rate on the transaction amount (Provider pays only); Provider max caps it in ₹.`),
      note("3. Blank cell = keep what is saved. 0 = ₹0 (nobody earns that part)."),
      note("4. Add a slab: fill a new row under the last one with its Slab from and Slab to."),
      note('5. Remove a slab: delete its row, then tick "Remove slabs that are not in the file" when importing. A tab with no rows is skipped.'),
      note(
        `6. Provider column: ${ALL_PROVIDERS} or a provider name (${data.providers.map((p) => p.name).join(", ") || "none yet"}). Blank = the provider picked on the rate card.`,
      ),
      note("7. Do not rename tabs or header cells. Summary and this tab are ignored on import. Grey cells are worked out for you."),
      [],
      [{ v: "Worked example (not imported)", s: "title" }],
      head([...SHEET_HEADER, "What it means"]),
      [100, 3000, 3000, PCT_OF_AMOUNT, 0.5, 15, SHARE, 60, SHARE, 10, SHARE, 5, null, ALL_PROVIDERS,
        "Provider pays 0.5% of the amount, max ₹15. Retailer gets 60% of that, Distributor 10%, SD 5%."],
      [3000.01, 10000, 10000, FLAT, 12, null, FLAT, 8, FLAT, 1, null, null, null, ALL_PROVIDERS,
        "Provider pays ₹12 per txn. Retailer ₹8, Distributor ₹1. SD blank = keeps what is saved."],
      [10000.01, null, 20000, FLAT, 15, null, FLAT, 0, null, null, null, null, null, null,
        "New slab above ₹10,000 (Slab to blank = no upper limit). Retailer 0 = ₹0. Provider blank = the provider on the rate card."],
    ],
  };
}

export function rateCardWorkbookSheets(data: RateCardData, scopeName: string, opts: WorkbookOptions = {}): XlsxSheet[] {
  const template = Boolean(opts.template);
  const services = opts.serviceIds ? data.services.filter((s) => opts.serviceIds!.includes(s.serviceId)) : data.services;
  const generated = new Date().toLocaleString("en-IN");
  const top: XlsxCell[][] = [
    [{ v: template ? "Commission rate card — blank template" : "Commission rate card", s: "title" }],
    [{ v: `${scopeName} · generated ${generated} · amounts per txn before TDS`, s: "muted" }],
    [],
    [{ v: "How to use: read the How to fill tab, change the white cells on a service tab, save, then Rate card → Import.", s: "note" }],
    [{ v: "Type columns have a dropdown: Flat ₹ (green) or Share % / % of amount (blue). Use the filter arrows on the header row.", s: "note" }],
    [{ v: "Blank cell = keep what is saved. 0 = ₹0. Add a slab by filling a new row under the last one.", s: "note" }],
    [],
    [{ v: META_FILE_TYPE, s: "muted" }, template ? "Rate card template" : "Rate card export"],
    [{ v: META_EXPORTED_AT, s: "muted" }, new Date().toISOString()],
    [{ v: META_DATA_VERSION, s: "muted" }, data.lastChangedAt ?? "none"],
    [],
  ];
  const headRow = top.length + 1;
  const summary: XlsxSheet = template
    ? {
        name: SUMMARY_TAB,
        freezeRows: headRow,
        autoFilter: `A${headRow}:C${headRow + services.length}`,
        widths: [26, 20, 22],
        rows: [...top, head(["Service", "Category", "Service code"]), ...services.map((r): XlsxCell[] => [r.serviceName, r.categoryName, r.serviceCode])],
      }
    : {
        name: SUMMARY_TAB,
        freezeRows: headRow,
        autoFilter: `A${headRow}:F${headRow + services.length}`,
        widths: [26, 20, 8, 20, 18, 22],
        rows: [
          ...top,
          head(["Service", "Category", "Slabs", "Provider pays not set", "Slabs losing money", "Slabs with a role on ₹0"]),
          ...services.map((row): XlsxCell[] => {
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
  return [summary, howToSheet(data), ...services.map((row) => serviceSheet(row, data, template))];
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

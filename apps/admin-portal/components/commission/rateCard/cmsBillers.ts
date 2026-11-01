import api from "@/lib/api";
import type { BrandedReport } from "@/lib/brandedExport";
import { downloadXlsx, type XlsxCell } from "@/lib/xlsxWorkbook";

export type BillerType = "agent" | "customer" | "other";

export type CmsBiller = {
  billerId: string;
  billerName: string;
  billerType: BillerType;
  companyMargin: string;
  retailerMargin: string;
  distributorMargin: string;
  superMargin: string;
  companyKeeps: string;
  isActive: boolean;
  updatedAt: string;
};

export type CmsBillerImport = {
  id: string;
  adminName: string;
  fileName: string;
  reason: string;
  newCount: number;
  changedCount: number;
  removedCount: number;
  createdAt: string;
  undoneAt: string | null;
  canUndo: boolean;
  undoBlockedReason: string | null;
};

export type CmsBillerList = { billers: CmsBiller[]; imports: CmsBillerImport[] };

export type BillerRow = {
  tab?: string;
  row: number;
  billerId: string;
  billerName: string;
  companyMargin: string;
  retailerMargin: string;
  distributorMargin: string;
  superMargin: string;
};

type Rates = Pick<CmsBiller, "billerName" | "companyMargin" | "retailerMargin" | "distributorMargin" | "superMargin">;

export type BillerChange = {
  status: "new" | "changed" | "removed";
  billerId: string;
  billerType: BillerType;
  reactivated: boolean;
  before: Rates | null;
  after: Rates | null;
};

export type BillerPreview = {
  saved: false;
  rowsRead: number;
  issues: string[];
  issueCount: number;
  counts: { new: number; changed: number; removed: number; unchanged: number; missing: number };
  changes: BillerChange[];
};

export const TYPE_LABEL: Record<BillerType, string> = { agent: "Agent", customer: "Customer", other: "Other" };

/** Upload headers, in sheet order. Matching ignores case, spaces and "(50%)"-style suffixes. */
export const SHEET_COLUMNS: Array<{ key: keyof Omit<BillerRow, "row">; header: string; match: (norm: string) => boolean }> = [
  { key: "billerId", header: "Biller Id", match: (n) => n === "billerid" },
  { key: "billerName", header: "Biller Name", match: (n) => n === "billername" },
  { key: "companyMargin", header: "Asanpay Company Margin", match: (n) => n.includes("companymargin") },
  { key: "retailerMargin", header: "Retailer Margin", match: (n) => n.startsWith("retailer") },
  { key: "distributorMargin", header: "Distributor Margin", match: (n) => n.startsWith("distributor") },
  { key: "superMargin", header: "Super Margin", match: (n) => n.startsWith("super") },
];

export const MARGIN_FIELDS: Array<{ key: keyof Rates; label: string }> = [
  { key: "companyMargin", label: "Company margin" },
  { key: "retailerMargin", label: "Retailer" },
  { key: "distributorMargin", label: "Distributor" },
  { key: "superMargin", label: "Super" },
];

const norm = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");

/** "0.522500" → "0.5225"; keeps up to 6 decimals. */
export const margin = (v: string | null | undefined) => (v == null || v === "" ? "—" : String(Number(v)));

/**
 * Reads every tab whose header row has the biller columns (a one-tab sheet or a full workbook) into one list.
 * Other tabs are ignored. `row` is the 1-based row in its tab; `tab` is set when billers span several tabs.
 */
export function parseBillerSheet(sheets: Array<{ name: string; rows: string[][] }>): { sheets: string[]; rows: BillerRow[] } | { error: string } {
  const partial: Array<{ sheet: string; missing: string[] }> = [];
  const found: Array<{ sheet: string; rows: BillerRow[] }> = [];
  for (const s of sheets) {
    for (let h = 0; h < Math.min(s.rows.length, 15); h++) {
      const header = s.rows[h]!.map((c) => norm(c ?? ""));
      if (!header.includes("billerid")) continue;
      const idx = SHEET_COLUMNS.map((c) => header.findIndex(c.match));
      const missing = SHEET_COLUMNS.filter((_, i) => idx[i]! < 0).map((c) => c.header);
      if (missing.length > 0) {
        partial.push({ sheet: s.name, missing });
        break;
      }
      const rows: BillerRow[] = [];
      s.rows.slice(h + 1).forEach((cells, i) => {
        if (cells.every((c) => !String(c ?? "").trim())) return;
        const at = (k: number) => String(cells[idx[k]!] ?? "").trim();
        rows.push({
          row: h + 2 + i,
          billerId: at(0),
          billerName: at(1),
          companyMargin: at(2),
          retailerMargin: at(3),
          distributorMargin: at(4),
          superMargin: at(5),
        });
      });
      found.push({ sheet: s.name, rows });
      break;
    }
  }
  if (partial.length > 0) {
    const p = partial[0]!;
    return { error: `Tab "${p.sheet}" is missing these columns: ${p.missing.join(", ")}. Keep the provider sheet headers as they are.` };
  }
  if (found.length === 0) {
    return {
      error: `No tab has a "Biller Id" header. The sheet needs these columns: ${SHEET_COLUMNS.map((c) => c.header).join(", ")}.`,
    };
  }
  const rows = found.flatMap((f) => (found.length > 1 ? f.rows.map((r) => ({ ...r, tab: f.sheet })) : f.rows));
  if (rows.length === 0) {
    return { error: `${found.map((f) => `Tab "${f.sheet}"`).join(", ")} has the biller headers but no biller rows below them.` };
  }
  return { sheets: found.map((f) => f.sheet), rows };
}

/** True when the workbook has at least one tab with a "Biller Id" header (complete or not). */
export function hasBillerTab(sheets: Array<{ name: string; rows: string[][] }>): boolean {
  return sheets.some((s) => s.rows.slice(0, 15).some((r) => r.some((c) => norm(c ?? "") === "billerid")));
}

const today = () => new Date().toISOString().slice(0, 10);

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Same headers as the upload sheet (+ Type and AsanPay keeps, which upload ignores) so an export can be re-uploaded. */
function exportRows(billers: CmsBiller[]): { head: string[]; rows: string[][] } {
  return {
    head: [...SHEET_COLUMNS.map((c) => c.header), "Type", "AsanPay keeps"],
    rows: billers.map((b) => [
      b.billerId,
      b.billerName,
      margin(b.companyMargin),
      margin(b.retailerMargin),
      margin(b.distributorMargin),
      margin(b.superMargin),
      TYPE_LABEL[b.billerType],
      margin(b.companyKeeps),
    ]),
  };
}

export function billersCsv(billers: CmsBiller[]): string {
  const { head, rows } = exportRows(billers);
  return `\uFEFF${[head, ...rows].map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export const billersCsvName = () => `cms-billers-${today()}.csv`;

export function downloadBillersXlsx(billers: CmsBiller[], scope: string): void {
  const { head, rows } = exportRows(billers);
  const numeric = new Set([2, 3, 4, 5, 7]);
  const body: XlsxCell[][] = rows.map((r) =>
    r.map((v, i) => (i === 0 ? v : numeric.has(i) && v !== "—" ? { v: Number(v), s: i === 7 ? "info" : undefined } : v)),
  );
  downloadXlsx(`cms-billers-${today()}.xlsx`, [
    {
      name: "CMS billers",
      rows: [
        [{ v: "Cash Collection — biller margins", s: "title" }],
        [{ v: `${scope} · ${billers.length} billers · exported ${new Date().toLocaleString("en-IN")}`, s: "muted" }],
        head.map((h) => ({ v: h, s: "head" as const })),
        ...body,
      ],
      widths: [14, 44, 22, 16, 18, 14, 12, 16],
      freezeRows: 3,
      autoFilter: `A3:H${Math.max(rows.length + 3, 4)}`,
    },
  ]);
}

export function billersReport(billers: CmsBiller[], scope: string): BrandedReport {
  const sum = (k: keyof CmsBiller) => billers.reduce((n, b) => n + Number(b[k]), 0);
  return {
    title: "Cash Collection — biller margins",
    fileName: `cms-billers-${today()}`,
    meta: [
      { label: "Showing", value: scope },
      { label: "Generated on", value: new Date().toLocaleString("en-IN") },
    ],
    summary: [
      { label: "Billers", value: String(billers.length) },
      { label: "Agent", value: String(billers.filter((b) => b.billerType === "agent").length) },
      { label: "Customer", value: String(billers.filter((b) => b.billerType === "customer").length) },
      { label: "Avg company margin", value: billers.length ? (sum("companyMargin") / billers.length).toFixed(4) : "0", tone: "credit" },
    ],
    columns: [
      { label: "Biller Id" },
      { label: "Biller name" },
      { label: "Type" },
      { label: "Company margin", align: "right" },
      { label: "Retailer", align: "right" },
      { label: "Distributor", align: "right" },
      { label: "Super", align: "right" },
      { label: "AsanPay keeps", align: "right" },
    ],
    rows: billers.map((b) => [
      { text: b.billerId, mono: true },
      { text: b.billerName },
      { text: TYPE_LABEL[b.billerType], tone: "muted" },
      { text: margin(b.companyMargin), align: "right" },
      { text: margin(b.retailerMargin), align: "right" },
      { text: margin(b.distributorMargin), align: "right" },
      { text: margin(b.superMargin), align: "right" },
      { text: margin(b.companyKeeps), align: "right", tone: "credit" },
    ]),
    footerNote: "Margins are per transaction, in the same unit as the provider sheet. AsanPay keeps = company margin − retailer − distributor − super.",
  };
}

/** Dry run of a biller upload: what would be new / changed / removed, plus row errors. */
export async function checkBillers(fileName: string, rows: BillerRow[], removeMissing: boolean): Promise<BillerPreview> {
  const r = await api.post("/admin/cms/billers/import", { fileName, rows, removeMissing, dryRun: true });
  if (!r.data.success) throw new Error(r.data.message);
  return r.data.data as BillerPreview;
}

/** Saves a checked biller upload; returns the upload id (for Undo). */
export async function saveBillers(fileName: string, rows: BillerRow[], removeMissing: boolean, reason: string): Promise<string> {
  const r = await api.post("/admin/cms/billers/import", { fileName, rows, removeMissing, dryRun: false, reason });
  if (!r.data.success) throw new Error(r.data.message);
  return (r.data.data as { id: string }).id;
}

export const billerChangeCount = (p: BillerPreview) => p.counts.new + p.counts.changed + p.counts.removed;

export function issuesCsv(issues: string[]): string {
  return `\uFEFF${["Error", ...issues].map(csvCell).join("\r\n")}\r\n`;
}

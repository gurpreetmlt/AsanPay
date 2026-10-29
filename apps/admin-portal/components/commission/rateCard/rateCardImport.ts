import { parseCsv } from "@/lib/taxCommissionUtils";
import { amountBound, incomeChanges, incomeRowError, newIncomeKey, type IncomeDraft } from "./IncomeSlabModal";
import { roleSplitError, slabSplitChanges, slabSplitOf, type SlabSplit } from "./roleSplit";
import {
  ALL_PROVIDERS,
  FLAT,
  HOW_TO_TAB,
  META_DATA_VERSION,
  META_EXPORTED_AT,
  PCT_OF_AMOUNT,
  ROLE_KEY,
  SHARE,
  SUMMARY_TAB,
  headerKey,
} from "./rateCardTransfer";
import {
  ROLE_LABEL,
  SCHEME_ROLES,
  inr,
  pct,
  ruleLabel,
  slabLabel,
  type CompareRow,
  type IncomeRule,
  type PendingChange,
  type RateCardData,
  type RuleType,
  type SchemeRole,
  type ServiceRow,
  type Slab,
  type SlabShareView,
} from "./types";
import type { SplitMode } from "./ui";

// ── Problems found in the file ──

export type ImportIssue = {
  /** Excel tab; null for a CSV. */
  tab: string | null;
  row: number | null;
  column: string | null;
  value: string;
  problem: string;
  fix: string;
};

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** "Cash Withdraw tab, row 7, Retailer: “8.5%” is not a number. Type 8.5 and choose Share % in Retailer type." */
export function issueText(i: ImportIssue): string {
  const where = [i.tab ? `${i.tab} tab` : null, i.row != null ? `${i.tab ? "row" : "Row"} ${i.row}` : null, i.column]
    .filter(Boolean)
    .join(", ");
  const what = i.value !== "" ? `“${i.value}” ${i.problem}` : cap(i.problem);
  return `${where ? `${where}: ` : ""}${what}.${i.fix ? ` ${i.fix}.` : ""}`;
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Error report for Excel: one line per problem (UTF-8 BOM). */
export function issuesCsv(rows: Array<{ service: string; issue: ImportIssue }>): string {
  const lines = [
    ["Service", "Tab", "Row", "Column", "Value", "Problem", "How to fix"],
    ...rows.map(({ service, issue: i }) => [service, i.tab ?? "", i.row != null ? String(i.row) : "", i.column ?? "", i.value, i.problem, i.fix]),
  ];
  return `\uFEFF${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

// ── Reading the file ──

export const WRONG_FILE = "This file is not a rate card export. Download the template from Export → Blank template.";

export type FileRow = { serviceId: string; tab: string | null; row: number; cells: Record<string, string> };

export type ParsedImport = {
  fileName: string;
  kind: "xlsx" | "csv";
  /** From the Summary tab of an export / template; null for CSV or an older file. */
  exportedAt: string | null;
  dataVersion: string | null;
  rows: FileRow[];
  /** Service tabs with no slab rows — skipped (a tab never removes a whole service). */
  emptyTabs: string[];
  /** Unknown tabs / services that were skipped. */
  warnings: string[];
};

/** Columns that never change anything on their own (a row with only these is an empty line). */
const INFO_KEYS = new Set(["exampleamount", "companykeeps", "provider", "whatitmeans"]);

function serviceMatcher(data: RateCardData) {
  const byCode = new Map(data.services.map((s) => [s.serviceCode.toLowerCase(), s]));
  const byName = new Map(data.services.map((s) => [s.serviceName.toLowerCase(), s]));
  return (name: string, code: string): ServiceRow | null =>
    (code && byCode.get(code.toLowerCase())) || byName.get(name.toLowerCase()) || byCode.get(name.toLowerCase()) || null;
}

const hasContent = (cells: Record<string, string>) => Object.entries(cells).some(([k, v]) => v !== "" && !INFO_KEYS.has(k));

/** Excel workbook from Export → Excel / Blank template: every service tab (title row = name … code, header with "Slab from"). */
export function parseXlsxImport(
  fileName: string,
  sheets: Array<{ name: string; rows: string[][] }>,
  data: RateCardData,
): ParsedImport | { error: string } {
  const match = serviceMatcher(data);
  const skipTabs = new Set([headerKey(SUMMARY_TAB), headerKey(HOW_TO_TAB)]);
  const out: ParsedImport = { fileName, kind: "xlsx", exportedAt: null, dataVersion: null, rows: [], emptyTabs: [], warnings: [] };
  let serviceTabs = 0;

  for (const sheet of sheets) {
    if (headerKey(sheet.name) === headerKey(SUMMARY_TAB)) {
      for (const r of sheet.rows) {
        const k = headerKey(r[0] ?? "");
        if (k === headerKey(META_EXPORTED_AT)) out.exportedAt = (r[1] ?? "").trim() || null;
        if (k === headerKey(META_DATA_VERSION)) out.dataVersion = (r[1] ?? "").trim() || null;
      }
    }
    if (skipTabs.has(headerKey(sheet.name))) continue;
    const h = sheet.rows.findIndex((r) => r.some((c) => headerKey(c) === "slabfrom"));
    if (h < 0) {
      if (sheet.rows.some((r) => r.some((c) => c.trim() !== ""))) {
        out.warnings.push(`Tab “${sheet.name}” has no “Slab from” header row — skipped.`);
      }
      continue;
    }
    serviceTabs += 1;
    const title = (sheet.rows[0] ?? []).filter((c) => c.trim() !== "");
    const name = (title[0] ?? sheet.name).trim();
    const code = title.length > 1 ? title[title.length - 1]!.trim() : "";
    const service = match(name, code);
    if (!service) {
      out.warnings.push(`Tab “${sheet.name}”: no service named “${name}”${code ? ` (code ${code})` : ""} — skipped.`);
      continue;
    }
    const keys = sheet.rows[h]!.map(headerKey);
    let count = 0;
    sheet.rows.slice(h + 1).forEach((row, i) => {
      const cells: Record<string, string> = {};
      keys.forEach((k, ci) => {
        if (k && !(k in cells)) cells[k] = (row[ci] ?? "").trim();
      });
      if (!hasContent(cells)) return;
      out.rows.push({ serviceId: service.serviceId, tab: sheet.name, row: h + i + 2, cells });
      count += 1;
    });
    if (count === 0) out.emptyTabs.push(sheet.name);
  }
  if (serviceTabs === 0) return { error: WRONG_FILE };
  return out;
}

/**
 * CSV from Export → CSV: Service, Service code, Provider, Slab from, Slab to, Provider pays, Retailer, Distributor, SD
 * ("80%" = share, plain number = flat ₹). A single "Slab" text column and *_type / *_value columns also work.
 */
export function parseCsvImport(fileName: string, text: string, data: RateCardData): ParsedImport | { error: string } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const header = (rows[0] ?? []).map(headerKey);
  const hasService = ["service", "servicecode", "servicename"].some((k) => header.includes(k));
  const hasSlab = ["slab", "slabfrom", "slabto"].some((k) => header.includes(k));
  if (!hasService || !hasSlab) return { error: WRONG_FILE };
  const match = serviceMatcher(data);
  const out: ParsedImport = { fileName, kind: "csv", exportedAt: null, dataVersion: null, rows: [], emptyTabs: [], warnings: [] };
  const unknown = new Map<string, number[]>();
  rows.slice(1).forEach((r, i) => {
    const cells: Record<string, string> = {};
    header.forEach((k, ci) => {
      if (k && !(k in cells)) cells[k] = (r[ci] ?? "").trim();
    });
    const code = cells.servicecode ?? "";
    const name = (cells.service || cells.servicename || "").split("·")[0]!.trim();
    const service = match(name, code);
    if (!service) {
      const label = code || name || "(blank)";
      unknown.set(label, [...(unknown.get(label) ?? []), i + 2]);
      return;
    }
    if (!hasContent({ ...cells, service: "", servicecode: "", servicename: "" })) return;
    out.rows.push({ serviceId: service.serviceId, tab: null, row: i + 2, cells });
  });
  for (const [label, at] of unknown) {
    out.warnings.push(
      `Service “${label}” (row${at.length === 1 ? "" : "s"} ${at.slice(0, 8).join(", ")}${at.length > 8 ? "…" : ""}) not found — skipped. Use the service name or code from the export.`,
    );
  }
  if (out.rows.length === 0 && unknown.size === 0) return { error: WRONG_FILE };
  return out;
}

// ── Providers in the file ──

function resolveProvider(raw: string, data: RateCardData): string | null | "unknown" {
  const t = raw.trim();
  if (t === "") return data.providerId;
  if (headerKey(t) === headerKey(ALL_PROVIDERS) || headerKey(t) === "all") return null;
  return data.providers.find((p) => headerKey(p.name) === headerKey(t) || headerKey(p.code) === headerKey(t))?.id ?? "unknown";
}

/** Provider scopes the file writes to — each is compared with that provider's saved rate card. */
export function providerIdsIn(parsed: ParsedImport, data: RateCardData): Array<string | null> {
  const ids = new Set<string | null>();
  for (const r of parsed.rows) {
    const p = resolveProvider(r.cells.provider ?? "", data);
    if (p !== "unknown") ids.add(p);
  }
  return [...ids];
}

/** Null = no export time in the file (CSV / older export) — skip the stale check. "" = nothing was saved at export. */
function fileVersion(parsed: ParsedImport): string | null {
  if (parsed.dataVersion && parsed.dataVersion !== "none") return parsed.dataVersion;
  if (parsed.dataVersion === "none") return "";
  return parsed.exportedAt;
}

function changedSince(lastChangedAt: string | null | undefined, since: string | null): boolean {
  if (since === null || !lastChangedAt) return false;
  if (since === "") return true;
  const a = Date.parse(lastChangedAt);
  const b = Date.parse(since);
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

// ── Plan: slab-by-slab diff per service ──

export type FieldDiff = { label: string; before: string; after: string; changed: boolean };
export type SlabStatus = "new" | "changed" | "unchanged" | "removed";

export type SlabPreview = {
  id: string;
  slab: string;
  minAmount: string | null;
  maxAmount: string | null;
  status: SlabStatus;
  /** "Cash Withdraw tab, row 7" / "Row 5" / "Not in the file". */
  where: string;
  fields: FieldDiff[];
  changes: PendingChange[];
  /** inverse[i] restores what changes[i] replaces. */
  inverse: PendingChange[];
  /** Company loses money on this slab after the import. */
  loss: string | null;
};

export type ServicePreview = {
  key: string;
  serviceId: string;
  serviceName: string;
  categoryName: string;
  providerId: string | null;
  providerName: string;
  slabs: SlabPreview[];
  issues: ImportIssue[];
  rowsRead: number;
  counts: Record<SlabStatus, number>;
  /** Saved rates changed after the file was exported. */
  stale: boolean;
};

const INCOME_URL = "/admin/rate-card/provider-income";
const SHARES_URL = "/admin/rate-card/shares";

const cleanNumber = (v: string) => v.replace(/[₹?,\s]/g, "").replace(/^rs\.?/i, "");
const isNumber = (v: string) => /^\d+(\.\d{1,4})?$/.test(v);
const isAmount = (v: string) => /^\d+(\.\d{1,2})?$/.test(v);

type Kind = "flat" | "percent";
/** "Flat ₹" (or "Flat ?" after Excel loses the ₹) → flat; "Share %" / "% of amount" → percent; else not a type. */
function typeKind(t: string): Kind | null {
  if (/%|share|percent/i.test(t)) return "percent";
  if (/flat|₹|\?|rupee|\brs\b|fixed/i.test(t)) return "flat";
  return null;
}

/** null = blank (keep), "bad" = not a number for that type. */
function parseTyped(raw: string, type: string): { mode: SplitMode; value: string } | "bad" | null {
  const t = raw.trim();
  if (t === "") return null;
  const hasPct = /%\s*$/.test(t);
  const n = cleanNumber(t.replace(/%\s*$/, ""));
  if (!isNumber(n)) return "bad";
  if (!type) return { mode: hasPct ? "percent" : "flat", value: String(Number(n)) };
  const kind = typeKind(type)!;
  if (hasPct && kind === "flat") return "bad";
  return { mode: kind, value: String(Number(n)) };
}

function numberFix(raw: string, typeColumn: string | null, percentType: string, percentExample: string): string {
  const digits = cleanNumber(raw.replace(/%/g, ""));
  if (isNumber(digits)) {
    if (!typeColumn) return raw.includes("%") ? `Type ${Number(digits)}% for a share or ${Number(digits)} for flat ₹` : `Type ${Number(digits)}`;
    return raw.includes("%") ? `Type ${Number(digits)} and choose ${percentType} in ${typeColumn}` : `Type ${Number(digits)}`;
  }
  return typeColumn
    ? `Type a number like 1.5 (${FLAT}) or ${percentExample} (${percentType}) and pick the matching ${typeColumn}`
    : `Type a number like 1.5 for flat ₹ or ${percentExample}% for a percentage`;
}

const splitText = (mode: SplitMode, value: string) =>
  value.trim() === "" ? "Not set" : mode === "percent" ? `${pct(value)} share` : `${inr(value)} flat`;

const boundsKey = (min: string | null, max: string | null) => `${amountBound(min)}|${amountBound(max)}`;
const sameScope = (r: { providerId: string | null; minAmount: string | null; maxAmount: string | null }, providerId: string | null, min: string | null, max: string | null) =>
  r.providerId === providerId && boundsKey(r.minAmount, r.maxAmount) === boundsKey(min, max);

function restoreIncome(s: ServiceRow, r: IncomeRule): PendingChange {
  return {
    label: `${s.serviceName} · restore provider pays`,
    detail: `${slabLabel(r.minAmount, r.maxAmount)}: ${ruleLabel(r.ruleType, r.value, r.capAmount)}`,
    method: "post",
    url: INCOME_URL,
    body: {
      serviceId: s.serviceId,
      providerId: r.providerId,
      ruleType: r.ruleType,
      value: r.value,
      capAmount: r.capAmount,
      minAmount: r.minAmount,
      maxAmount: r.maxAmount,
    },
  };
}

const shareText = (r: SlabShareView) => (r.flatAmount != null ? `${inr(r.flatAmount)} flat` : `${pct(r.sharePercent)} share`);

function restoreShare(s: ServiceRow, r: SlabShareView): PendingChange {
  return {
    label: `${s.serviceName} · restore ${ROLE_LABEL[r.role]} split`,
    detail: `${slabLabel(r.minAmount, r.maxAmount)}: ${shareText(r)}`,
    method: "post",
    url: SHARES_URL,
    body: {
      serviceId: s.serviceId,
      providerId: r.providerId,
      role: r.role,
      sharePercent: r.sharePercent,
      flatAmount: r.flatAmount,
      minAmount: r.minAmount,
      maxAmount: r.maxAmount,
    },
  };
}

/** The write that puts back what `c` replaces (rows the import creates are ended by scope on undo). */
export function inverseOf(c: PendingChange, s: ServiceRow): PendingChange {
  const b = c.body as Record<string, string | null | undefined>;
  const providerId = b.providerId ?? null;
  const min = b.minAmount ?? null;
  const max = b.maxAmount ?? null;
  const range = slabLabel(min, max);
  if (c.method === "post" && c.url === INCOME_URL) {
    const prev = s.providerIncomeRules.find((r) => sameScope(r, providerId, min, max));
    return prev
      ? restoreIncome(s, prev)
      : {
          label: `${s.serviceName} · remove imported provider pays`,
          detail: range,
          method: "delete",
          url: `${INCOME_URL}/scope`,
          body: { serviceId: s.serviceId, providerId, minAmount: min, maxAmount: max },
        };
  }
  if (c.method === "post" && c.url === SHARES_URL) {
    const role = b.role as SchemeRole;
    const prev = (s.slabShares ?? []).find((r) => r.role === role && sameScope(r, providerId, min, max));
    return prev
      ? restoreShare(s, prev)
      : {
          label: `${s.serviceName} · remove imported ${ROLE_LABEL[role]} split`,
          detail: range,
          method: "delete",
          url: `${SHARES_URL}/scope`,
          body: { serviceId: s.serviceId, providerId, role, minAmount: min, maxAmount: max },
        };
  }
  if (c.method === "delete") {
    const income = s.providerIncomeRules.find((r) => c.url === `${INCOME_URL}/${r.id}`);
    if (income) return restoreIncome(s, income);
    const share = (s.slabShares ?? []).find((r) => c.url === `${SHARES_URL}/${r.id}`);
    if (share) return restoreShare(s, share);
  }
  throw new Error(`Cannot work out how to undo “${c.label}”. Refresh the rate card and import again.`);
}

/** Company keeps after the import on the slab's example amount; a message when it goes below ₹0. */
function lossOf(
  slab: Slab | null,
  income: { ruleType: RuleType; value: string; capAmount: string | null } | null,
  split: SlabSplit,
  min: string | null,
  max: string | null,
): string | null {
  const sample = slab ? Number(slab.sampleAmount) : Number(max ?? min ?? 2000);
  let pays: number | null = null;
  if (income) {
    const v = Number(income.value);
    pays = income.ruleType === "flat" ? v : (sample * v) / 100;
    if (income.ruleType === "percentage" && income.capAmount) pays = Math.min(pays, Number(income.capAmount));
  } else if (slab?.providerIncome != null) pays = Number(slab.providerIncome);
  if (pays == null || !Number.isFinite(pays)) return null;
  const fee = slab ? Number(slab.customerFee) || 0 : 0;
  let gross = 0;
  for (const role of SCHEME_ROLES) {
    const v = split.values[role].trim();
    if (v !== "") gross += split.modes[role] === "flat" ? Number(v) : (pays * Number(v)) / 100;
    else gross += Number(slab?.roles.find((r) => r.role === role)?.gross ?? 0);
  }
  const keeps = Math.round((pays + fee - gross) * 100) / 100;
  if (keeps >= 0) return null;
  return `Company loses ${inr(-keeps)} per txn on ${inr(sample)} — roles get ${inr(gross)}, provider pays ${inr(pays)} + fee ${inr(fee)}`;
}

type Group = { key: string; serviceId: string; providerId: string | null; rows: FileRow[]; issues: ImportIssue[] };

function planRow(
  r: FileRow,
  service: ServiceRow,
  providerId: string | null,
  providerName: string,
): { issues: ImportIssue[]; key: string | null; slab: Omit<SlabPreview, "id"> | null } {
  const get = (k: string) => r.cells[k] ?? "";
  const has = (k: string) => k in r.cells;
  const issues: ImportIssue[] = [];
  const issue = (column: string, value: string, problem: string, fix = "") =>
    issues.push({ tab: r.tab, row: r.row, column, value, problem, fix });
  const where = r.tab ? `${r.tab} tab, row ${r.row}` : `Row ${r.row}`;

  // Slab bounds: "Slab from" / "Slab to", or one "Slab" cell such as "₹100.00 – ₹199.99", "Up to ₹1,000", "₹3,000+".
  let from = "";
  let to = "";
  if (has("slabfrom") || has("slabto")) {
    from = cleanNumber(get("slabfrom"));
    to = cleanNumber(get("slabto"));
    const fix = "Type rupees like 100 or 199.99, or leave it blank for any amount";
    if (from && !isAmount(from)) issue("Slab from", get("slabfrom"), "is not an amount", fix);
    if (to && !isAmount(to)) issue("Slab to", get("slabto"), "is not an amount", fix);
  } else {
    const raw = get("slab").split("·")[0]!.trim();
    const nums = (raw.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
    if (raw === "" || /any/i.test(raw)) [from, to] = ["", ""];
    else if (/up\s*to/i.test(raw) && nums.length === 1) to = nums[0]!;
    else if (/\+\s*$/.test(raw) && nums.length === 1) from = nums[0]!;
    else if (nums.length >= 2) [from, to] = [nums[0]!, nums[1]!];
    else issue("Slab", raw, "is not a slab", 'Write it like "100 – 199.99", "Up to 1000", "3000+" or "Any amount"');
  }
  if (issues.length) return { issues, key: null, slab: null };
  if (to && Number(to) <= 0) issue("Slab to", to, "must be more than 0", "Leave it blank for any amount");
  if (from && to && Number(from) > Number(to)) issue("Slab from", from, `is more than Slab to (${to})`, "Swap the two amounts");
  if (issues.length) return { issues, key: null, slab: null };

  const minAmount = from || null;
  const maxAmount = to || null;
  const key = boundsKey(minAmount, maxAmount);
  const slab = service.slabs.find((s) => boundsKey(s.minAmount, s.maxAmount) === key) ?? null;
  const savedIncome = service.providerIncomeRules.find((x) => sameScope(x, providerId, minAmount, maxAmount)) ?? null;
  const savedIncomeText = savedIncome ? ruleLabel(savedIncome.ruleType, savedIncome.value, savedIncome.capAmount) : "Not set";
  const withTypes = has("retailertype") || has("providertype");

  // Provider pays: number + "Provider type" (Flat ₹ / % of amount), or "13.95" / "0.465%".
  const fields: FieldDiff[] = [];
  let changes: PendingChange[] = [];
  let income: { ruleType: RuleType; value: string; capAmount: string | null } | null = savedIncome;
  const pType = get("providertype");
  const pRaw = get("providervalue") || get("providerpays");
  const pCap = get("providermax") || get("providercap");
  let providerField: FieldDiff = { label: "Provider pays", before: savedIncomeText, after: savedIncomeText, changed: false };
  if (pType && !typeKind(pType)) {
    issue("Provider type", pType, "is not a type", `Choose ${FLAT} or ${PCT_OF_AMOUNT} from the dropdown`);
  } else {
    const parsed = parseTyped(pRaw, pType);
    if (parsed === "bad") {
      issue("Provider pays", pRaw, "is not a number", numberFix(pRaw, withTypes ? "Provider type" : null, PCT_OF_AMOUNT, "0.5"));
    } else if (parsed) {
      if (parsed.mode === "flat" && pCap) {
        issue("Provider max", pCap, `only works with ${PCT_OF_AMOUNT}`, `Clear Provider max or choose ${PCT_OF_AMOUNT} in Provider type`);
      }
      const draft: IncomeDraft = {
        key: newIncomeKey(),
        replacesId: null,
        providerId,
        ruleType: parsed.mode === "flat" ? "flat" : "percentage",
        value: parsed.value,
        capAmount: parsed.mode === "percent" ? cleanNumber(pCap) : "",
        minAmount: from,
        maxAmount: to,
        note: null,
      };
      const err = incomeRowError(draft);
      if (err) {
        const capErr = /cap/i.test(err);
        issue(capErr ? "Provider max" : "Provider pays", capErr ? pCap : pRaw, `is not allowed: ${err}`);
      } else {
        const next = { ruleType: draft.ruleType, value: draft.value, capAmount: draft.capAmount || null };
        income = next;
        const same =
          savedIncome &&
          savedIncome.ruleType === next.ruleType &&
          Number(savedIncome.value) === Number(next.value) &&
          amountBound(savedIncome.capAmount) === amountBound(next.capAmount);
        if (!same) {
          changes = incomeChanges(service, draft, providerName);
          providerField = { ...providerField, after: ruleLabel(next.ruleType, next.value, next.capAmount), changed: true };
        }
      }
    }
  }
  fields.push(providerField);

  // Role split on this slab: number + "<Role> type" (Flat ₹ / Share %), or "0.5" / "80%".
  const initial: SlabSplit = slab
    ? slabSplitOf(slab)
    : {
        modes: { retailer: "percent", distributor: "percent", super_distributor: "percent" },
        values: { retailer: "", distributor: "", super_distributor: "" },
      };
  const next: SlabSplit = { modes: { ...initial.modes }, values: { ...initial.values } };
  for (const role of SCHEME_ROLES) {
    const k = ROLE_KEY[role];
    const label = ROLE_LABEL[role];
    const rType = get(`${k}type`);
    const rRaw = get(`${k}value`) || get(k);
    if (rType && !typeKind(rType)) {
      issue(`${label} type`, rType, "is not a type", `Choose ${FLAT} or ${SHARE} from the dropdown`);
      continue;
    }
    const parsed = parseTyped(rRaw, rType);
    if (parsed === null) continue;
    if (parsed === "bad") {
      issue(label, rRaw, "is not a number", numberFix(rRaw, withTypes ? `${label} type` : null, SHARE, "60"));
      continue;
    }
    const err = roleSplitError(role, parsed.mode, parsed.value);
    if (err) {
      issue(label, rRaw, `is not allowed: ${err}`);
      continue;
    }
    next.modes[role] = parsed.mode;
    next.values[role] = parsed.value;
  }
  if (issues.length) return { issues, key, slab: null };

  const splitChanges = slabSplitChanges({ row: service, initial, next, providerId, minAmount, maxAmount });
  for (const role of SCHEME_ROLES) {
    const changed = splitChanges.some((c) => c.body.role === role);
    const before = splitText(initial.modes[role], initial.values[role]);
    fields.push({ label: ROLE_LABEL[role], before, after: changed ? splitText(next.modes[role], next.values[role]) : before, changed });
  }
  changes = [...changes, ...splitChanges];
  return {
    issues,
    key,
    slab: {
      slab: slabLabel(minAmount, maxAmount),
      minAmount,
      maxAmount,
      status: changes.length === 0 ? "unchanged" : !slab && !savedIncome ? "new" : "changed",
      where,
      fields,
      changes,
      inverse: changes.map((c) => inverseOf(c, service)),
      loss: lossOf(slab, income, next, minAmount, maxAmount),
    },
  };
}

/** Saved slabs of this provider scope that the file no longer lists (provider pays + slab-only role splits). */
function removals(service: ServiceRow, providerId: string | null, inFile: Set<string>): Array<Omit<SlabPreview, "id">> {
  const gone = new Map<string, { min: string | null; max: string | null; income: IncomeRule[]; shares: SlabShareView[] }>();
  const slot = (min: string | null, max: string | null) => {
    const k = boundsKey(min, max);
    if (!gone.has(k)) gone.set(k, { min, max, income: [], shares: [] });
    return gone.get(k)!;
  };
  for (const r of service.providerIncomeRules) {
    if (r.providerId === providerId && !inFile.has(boundsKey(r.minAmount, r.maxAmount))) slot(r.minAmount, r.maxAmount).income.push(r);
  }
  for (const r of service.slabShares ?? []) {
    const bounded = r.minAmount != null || r.maxAmount != null;
    if (bounded && r.providerId === providerId && !inFile.has(boundsKey(r.minAmount, r.maxAmount))) slot(r.minAmount, r.maxAmount).shares.push(r);
  }
  const svc = service.serviceName;
  return [...gone.values()].map((g) => {
    const range = slabLabel(g.min, g.max);
    const changes: PendingChange[] = [
      ...g.income.map(
        (r): PendingChange => ({
          label: `${svc} · end provider income slab`,
          detail: `${range}: ${ruleLabel(r.ruleType, r.value, r.capAmount)}`,
          method: "delete",
          url: `${INCOME_URL}/${r.id}`,
          body: {},
        }),
      ),
      ...g.shares.map(
        (r): PendingChange => ({
          label: `${svc} · end ${ROLE_LABEL[r.role]} slab share`,
          detail: `${range}: ${shareText(r)}`,
          method: "delete",
          url: `${SHARES_URL}/${r.id}`,
          body: {},
        }),
      ),
    ];
    const fields: FieldDiff[] = [
      ...g.income.map((r) => ({ label: "Provider pays", before: ruleLabel(r.ruleType, r.value, r.capAmount), after: "Removed", changed: true })),
      ...g.shares.map((r) => ({ label: ROLE_LABEL[r.role], before: shareText(r), after: "Removed", changed: true })),
    ];
    return {
      slab: range,
      minAmount: g.min,
      maxAmount: g.max,
      status: "removed" as const,
      where: "Not in the file",
      fields,
      changes,
      inverse: changes.map((c) => inverseOf(c, service)),
      loss: null,
    };
  });
}

/**
 * One preview per service (and provider) in the file. `scoped(providerId)` is that provider's saved rate card
 * (the loaded card for its own provider). A service with any problem is listed with its issues and no slabs.
 */
export function planImport(
  parsed: ParsedImport,
  data: RateCardData,
  scoped: (providerId: string | null) => RateCardData | undefined,
  opts: { removeMissing: boolean },
): ServicePreview[] {
  const choices = [ALL_PROVIDERS, ...data.providers.map((p) => p.name)].join(", ");
  const groups = new Map<string, Group>();
  const groupOf = (serviceId: string, providerId: string | null) => {
    const key = `${serviceId}|${providerId ?? ""}`;
    if (!groups.has(key)) groups.set(key, { key, serviceId, providerId, rows: [], issues: [] });
    return groups.get(key)!;
  };
  for (const r of parsed.rows) {
    const raw = r.cells.provider ?? "";
    const p = resolveProvider(raw, data);
    // An unknown provider blocks the service; the row is still checked so every problem is listed at once.
    const g = groupOf(r.serviceId, p === "unknown" ? data.providerId : p);
    if (p === "unknown") {
      g.issues.push({ tab: r.tab, row: r.row, column: "Provider", value: raw, problem: "is not a provider", fix: `Pick one of: ${choices}` });
    }
    g.rows.push(r);
  }

  const since = fileVersion(parsed);
  return [...groups.values()].map((g): ServicePreview => {
    const card = scoped(g.providerId) ?? data;
    const service = card.services.find((s) => s.serviceId === g.serviceId) ?? data.services.find((s) => s.serviceId === g.serviceId)!;
    const providerName = g.providerId ? (data.providers.find((p) => p.id === g.providerId)?.name ?? "This provider") : ALL_PROVIDERS;
    const issues = [...g.issues];
    const slabs: SlabPreview[] = [];
    const firstRow = new Map<string, FileRow>();
    for (const r of g.rows) {
      const res = planRow(r, service, g.providerId, providerName);
      if (res.key) {
        const dup = firstRow.get(res.key);
        if (dup) {
          issues.push({
            tab: r.tab,
            row: r.row,
            column: "Slab from",
            value: "",
            problem: `this slab is already on row ${dup.row}`,
            fix: "Keep one row per slab — delete or merge the other row",
          });
          continue;
        }
        firstRow.set(res.key, r);
      }
      issues.push(...res.issues);
      if (res.slab) slabs.push({ ...res.slab, id: `${g.key}|${res.key}` });
    }
    if (opts.removeMissing && g.rows.length > 0 && issues.length === 0) {
      for (const s of removals(service, g.providerId, new Set(firstRow.keys()))) {
        slabs.push({ ...s, id: `${g.key}|${boundsKey(s.minAmount, s.maxAmount)}|removed` });
      }
    }
    const counts: Record<SlabStatus, number> = { new: 0, changed: 0, unchanged: 0, removed: 0 };
    for (const s of slabs) counts[s.status] += 1;
    return {
      key: g.key,
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      categoryName: service.categoryName,
      providerId: g.providerId,
      providerName,
      slabs,
      issues,
      rowsRead: g.rows.length,
      counts,
      stale: changedSince(service.lastChangedAt, since),
    };
  });
}

/** Stale-file banner text, or null. */
export function staleWarning(parsed: ParsedImport, previews: ServicePreview[]): string | null {
  const stale = previews.filter((p) => p.stale);
  if (stale.length === 0) return null;
  const when = parsed.exportedAt && Number.isFinite(Date.parse(parsed.exportedAt))
    ? new Date(parsed.exportedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "an earlier date";
  const names = [...new Set(stale.map((p) => p.serviceName))];
  return `This file was exported on ${when}. Rates changed after that — export again to avoid overwriting newer changes. Changed since: ${names.slice(0, 6).join(", ")}${names.length > 6 ? ` and ${names.length - 6} more` : ""}.`;
}

// ── What gets saved ──

export type ImportPick = { services: Set<string>; excluded: Set<string> };

/** Every error-free service is ticked; every change inside it is ticked. */
export function defaultPick(previews: ServicePreview[]): ImportPick {
  return { services: new Set(previews.filter((p) => p.issues.length === 0).map((p) => p.key)), excluded: new Set() };
}

export const slabTicked = (pick: ImportPick, service: ServicePreview, slab: SlabPreview) =>
  pick.services.has(service.key) && service.issues.length === 0 && slab.status !== "unchanged" && !pick.excluded.has(slab.id);

export type ImportPair = { change: PendingChange; inverse: PendingChange; serviceKey: string };

export function importSave(previews: ServicePreview[], pick: ImportPick) {
  const picked = previews.flatMap((service) => service.slabs.filter((slab) => slabTicked(pick, service, slab)).map((slab) => ({ service, slab })));
  const pairs: ImportPair[] = picked.flatMap(({ service, slab }) =>
    slab.changes.map((change, i) => ({ change, inverse: slab.inverse[i]!, serviceKey: service.key })),
  );
  const compare: CompareRow[] = picked.map(({ service, slab }) => ({
    service: service.serviceName,
    provider: service.providerName,
    slab: slab.slab,
    isNew: slab.status === "new",
    fields: slab.fields.filter((f) => f.changed).map(({ label, before, after }) => ({ label, before, after })),
  }));
  const losses = picked
    .filter(({ slab }) => slab.loss && slab.status !== "removed")
    .map(({ service, slab }) => `${service.serviceName} · ${slab.slab}: ${slab.loss}`);
  return {
    pairs,
    compare,
    losses,
    slabs: picked.length,
    removed: picked.filter(({ slab }) => slab.status === "removed").length,
    services: new Set(picked.map(({ service }) => service.key)).size,
  };
}

/** POST /admin/rate-card/imports body for the changes that saved (restore steps in replay order). */
export function importRecordBody(fileName: string, reason: string, previews: ServicePreview[], saved: ImportPair[]) {
  const byKey = new Map(previews.map((p) => [p.key, p]));
  const counts = new Map<string, number>();
  for (const p of saved) counts.set(p.serviceKey, (counts.get(p.serviceKey) ?? 0) + 1);
  return {
    fileName,
    reason,
    services: [...counts].map(([key, changes]) => {
      const p = byKey.get(key)!;
      return { serviceId: p.serviceId, serviceName: p.serviceName, providerName: p.providerName, changes };
    }),
    changes: saved.map((p) => p.change),
    inverseChanges: saved.map((p) => p.inverse).reverse(),
  };
}

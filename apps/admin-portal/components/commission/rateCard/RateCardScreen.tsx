"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronRight,
  Layers,
  LayoutGrid,
  HelpCircle,
  Info,
  Pencil,
  Plus,
  Receipt,
  Search,
  Sparkles,
  TableProperties,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { getServiceIcon } from "@/lib/serviceIcons";
import { readXlsx } from "@/lib/xlsxWorkbook";
import { toast } from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { openBrandedPdf } from "@/lib/brandedExport";
import { downloadCsv } from "@/lib/taxCommissionUtils";
import {
  downloadRateCardWorkbook,
  planRateCardImport,
  planRateCardXlsxImport,
  rateCardCsv,
  rateCardReport,
  sheetFillRequest,
  sheetReady,
} from "./rateCardTransfer";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { SaveConfirmModal } from "./SaveConfirmModal";
import { SlabEditorModal } from "./SlabEditorModal";
import { TaxSummary } from "./TaxSummary";
import { usePendingSave } from "./usePendingSave";
import { draftOfIncome, endAllSlabsRequest, endSlabRequest, newIncomeKey, type IncomeDraft } from "./IncomeSlabModal";
import { ROLE_LABEL, SCHEME_ROLES, inr, pct, slabLabel, type RateCardData, type RoleSplit, type SchemeRole, type ServiceRow, type Slab } from "./types";
import { Btn, CategoryBlock, ServiceTable, Chip, SlabHeaderRow, openBlockEdge } from "./ui";

type ShowFilter = "all" | "loss" | "unset";

/** Zebra rows: services alternate light tints; an open service and its slab rows sit on a blue band. */
const ROW_BG = {
  even: "var(--admin-card)",
  odd: "rgba(42,92,221,0.035)",
  open: "rgba(42,92,221,0.10)",
  slabEven: "var(--admin-card)",
  slabOdd: "rgba(42,92,221,0.045)",
};

/** Company loses money on a slab, or a role earns ₹0 on it. */
function hasLossOrMissing(row: ServiceRow): boolean {
  return row.slabs.some((s) => s.underwater || s.missingRoles.length > 0);
}

/** A slab with no "Provider pays" yet. */
function hasUnsetIncome(row: ServiceRow): boolean {
  return row.slabs.some((s) => s.providerIncome == null);
}

/** Problems that tint a row light red and get a tag next to the name (both densities). */
function rowIssues(row: ServiceRow) {
  const loss = row.slabs.filter((s) => s.underwater).length;
  const unset = row.slabs.filter((s) => s.providerIncome == null).length;
  const zeroRoles = [...new Set(row.slabs.flatMap((s) => s.missingRoles))];
  return { loss, unset, zeroRoles, any: loss > 0 || unset > 0 || zeroRoles.length > 0 };
}

const ISSUE_BG = { even: "rgba(220,38,38,0.045)", odd: "rgba(220,38,38,0.075)" };
const ISSUE_EDGE = "inset 3px 0 0 #F87171";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function IssueTags({ loss, unset, zeroRoles }: { loss: number; unset: number; zeroRoles: SchemeRole[] }) {
  if (!loss && !unset && zeroRoles.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {loss > 0 ? (
        <Chip tone="red" title="Company pays out more than the provider pays on these slabs">
          <AlertTriangle size={11} /> Loss{loss > 1 ? ` · ${plural(loss, "slab")}` : ""}
        </Chip>
      ) : null}
      {unset > 0 ? (
        <Chip tone="red" title="Provider pays is not set — nobody earns until it is">
          Not set{unset > 1 ? ` · ${plural(unset, "slab")}` : ""}
        </Chip>
      ) : null}
      {zeroRoles.length > 0 ? (
        <Chip tone="amber" title="These roles earn ₹0 on at least one slab">
          ₹0: {zeroRoles.map((r) => ROLE_LABEL[r]).join(", ")}
        </Chip>
      ) : null}
    </span>
  );
}

function RoleCell({ r }: { r: RoleSplit | undefined }) {
  if (!r) return <span>—</span>;
  return (
    <div className="text-right">
      <p className="font-semibold tabular-nums" style={{ color: r.source === "none" ? B.danger : B.blue }}>
        {inr(r.gross)}
      </p>
      <p className="text-[11px]" style={{ color: r.source === "none" ? B.danger : B.muted }}>
        {r.source === "share"
          ? `${r.shareFlat != null ? "Flat" : `${pct(r.sharePercent)} share`}${r.shareSlab ? " · slab" : ""}`
          : r.source === "rule"
            ? "Fixed rule"
            : r.source === "none"
              ? "None"
              : "Override"}
      </p>
    </div>
  );
}

function SlabCells({ slab, dense = false }: { slab: Slab; dense?: boolean }) {
  const pad = dense ? "px-3 py-1" : "px-3 py-2.5";
  return (
    <>
      <td className={`${pad} text-right`}>
        {slab.providerIncome != null ? (
          <span className="font-semibold tabular-nums" style={{ color: B.blue }}>
            {inr(slab.providerIncome)}
          </span>
        ) : (
          <Chip tone="amber">Not set</Chip>
        )}
      </td>
      {SCHEME_ROLES.map((role) => (
        <td key={role} className={pad}>
          <RoleCell r={slab.roles.find((x) => x.role === role)} />
        </td>
      ))}
      <td className={`${pad} text-right`}>
        {slab.underwater ? (
          <span className="font-bold tabular-nums" style={{ color: B.danger }}>
            Loses {inr(Math.abs(Number(slab.companyKeeps)))}
          </span>
        ) : (
          <span className="font-bold tabular-nums" style={{ color: B.greenDark }}>
            {inr(slab.companyKeeps)}
          </span>
        )}
      </td>
    </>
  );
}

const slabKey = (s: Slab) => `${s.minAmount ?? ""}|${s.maxAmount ?? ""}`;

/** The saved "Provider pays" row behind a slab line (same bounds), if any. */
function incomeRuleForSlab(row: ServiceRow, s: Slab) {
  return row.providerIncomeRules.find((r) => r.minAmount === s.minAmount && r.maxAmount === s.maxAmount) ?? null;
}

/** Something slab-level to remove: a provider income slab or a slab-only role share. */
function canDeleteAll(row: ServiceRow): boolean {
  return row.providerIncomeRules.length > 0 || row.slabs.some((s) => s.roles.some((r) => r.shareSlab && r.shareId));
}

function IconAction({
  title,
  tone,
  active,
  onClick,
  children,
}: {
  title: string;
  tone: "blue" | "red" | "green";
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const color = tone === "red" ? B.danger : tone === "green" ? B.greenDark : B.blueLight;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition ${tone === "red" ? "hover:bg-red-50" : "hover:bg-[rgba(42,92,221,0.10)]"}`}
      style={{ color, background: active ? "rgba(42,92,221,0.12)" : undefined }}
    >
      {children}
    </button>
  );
}

function ServiceChips({ row }: { row: ServiceRow }) {
  const ref = row.reference;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {ref?.incomeRows && row.providerIncomeRules.length === 0 ? (
        <Chip tone="blue" title="Provider sheet numbers are ready to review. Open the row and tap Suggested.">
          <Sparkles size={11} /> Suggested
        </Chip>
      ) : null}
      {ref?.askProvider ? (
        <Chip tone="amber">
          <HelpCircle size={11} /> Ask provider
        </Chip>
      ) : null}
      {ref?.mode === "fixed" ? <Chip tone="muted">Fixed mode</Chip> : null}
      {row.tax.source === "service" ? <Chip tone="muted">Custom tax</Chip> : null}
    </div>
  );
}

export function RateCardScreen() {
  const [providerId, setProviderId] = useState("");
  const [data, setData] = useState<RateCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const viewParam = searchParams.get("view");
  const [show, setShow] = useState<ShowFilter>(viewParam === "loss" ? "loss" : "all");
  const [seenViewParam, setSeenViewParam] = useState(viewParam);
  if (seenViewParam !== viewParam) {
    setSeenViewParam(viewParam);
    setShow(viewParam === "loss" ? "loss" : "all");
  }
  const [category, setCategory] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  /** Compact rows fit more services on screen; remembered in this browser. */
  const [dense, setDense] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("rateCardDensity") === "compact");
  function changeDensity(next: boolean) {
    setDense(next);
    window.localStorage.setItem("rateCardDensity", next ? "compact" : "comfortable");
  }

  /** Slab open in the add / edit popup. `slabKey` null = a new slab. */
  const [slabEditor, setSlabEditor] = useState<{ serviceId: string; slabKey: string | null; draft: IncomeDraft } | null>(null);

  const { saveReq, setSaveReq, saving, runSave } = usePendingSave(() => {
    setVersion((v) => v + 1);
    setSlabEditor(null);
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchApi<RateCardData>("/admin/rate-card", providerId ? { providerId } : undefined);
      setData(d);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load the rate card. Check your connection and refresh."));
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const providerName = useMemo(
    () => data?.providers.find((p) => p.id === providerId)?.name ?? "This provider",
    [data, providerId],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Array<{ category: string; rows: ServiceRow[] }> = [];
    for (const s of data?.services ?? []) {
      if (q && !`${s.serviceName} ${s.serviceCode} ${s.categoryName}`.toLowerCase().includes(q)) continue;
      if (category && s.categoryName !== category) continue;
      if (show === "loss" && !hasLossOrMissing(s)) continue;
      if (show === "unset" && !hasUnsetIncome(s)) continue;
      const last = out[out.length - 1];
      if (last && last.category === s.categoryName) last.rows.push(s);
      else out.push({ category: s.categoryName, rows: [s] });
    }
    return out;
  }, [data, query, category, show]);

  const lossCount = useMemo(() => (data?.services ?? []).filter(hasLossOrMissing).length, [data]);
  const unsetCount = useMemo(() => (data?.services ?? []).filter(hasUnsetIncome).length, [data]);
  const categories = useMemo(() => [...new Set((data?.services ?? []).map((s) => s.categoryName))], [data]);
  const slabCount = useMemo(() => (data?.services ?? []).reduce((n, s) => n + s.slabs.length, 0), [data]);
  const sheetReadyCount = useMemo(() => (data?.services ?? []).filter(sheetReady).length, [data]);

  const kpis: Array<{
    label: string;
    value: string | number;
    hint: string;
    icon: LucideIcon;
    tone: string;
    /** Filter applied on click; null = no filter of its own. */
    filter: ShowFilter | null;
    href?: string;
  }> = [
    { label: "Services", value: data?.services.length ?? 0, hint: "Show every service", icon: LayoutGrid, tone: B.blueLight, filter: "all" },
    { label: "Slabs", value: slabCount, hint: "Across all services", icon: Layers, tone: B.blue, filter: null },
    { label: "Loss or role ₹0", value: lossCount, hint: "Click to show them", icon: AlertTriangle, tone: B.danger, filter: "loss" },
    { label: "Rate not set", value: unsetCount, hint: "Provider pays missing", icon: HelpCircle, tone: "#B45309", filter: "unset" },
    {
      label: "Agent TDS",
      value: data?.tenantTax.tdsApplies ? pct(data.tenantTax.tdsPercent) : "Off",
      hint: "Edit in Tax settings",
      icon: Receipt,
      tone: B.greenDark,
      filter: null,
      href: "/tax-commission/tax",
    },
  ];

  function toggle(row: ServiceRow) {
    setExpanded((cur) => (cur === row.serviceId ? null : row.serviceId));
  }

  function newSlabDraft(s: Slab | null): IncomeDraft {
    return {
      key: newIncomeKey(),
      replacesId: null,
      providerId: providerId || null,
      ruleType: "flat",
      value: "",
      capAmount: "",
      minAmount: s?.minAmount != null ? String(Number(s.minAmount)) : "",
      maxAmount: s?.maxAmount != null ? String(Number(s.maxAmount)) : "",
      note: null,
    };
  }

  const importInput = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);

  function exportPdf() {
    if (!data) return;
    if (!openBrandedPdf(rateCardReport(data, providerId ? providerName : "All providers"))) {
      toast.error("Allow pop-ups for this site to export the PDF");
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !data) return;
    const isXlsx = /\.xlsx$/i.test(file.name);
    if (!isXlsx && !/\.csv$/i.test(file.name)) {
      setImportErrors([`"${file.name}" is not an Excel (.xlsx) or CSV file. Use the file from Export → Excel or CSV.`]);
      return;
    }
    let plan;
    try {
      plan = isXlsx
        ? planRateCardXlsxImport(await readXlsx(file), data, providerId || null, providerName)
        : planRateCardImport(await file.text(), data, providerId || null, providerName);
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : "Could not read this file. Save it again in Excel and retry."]);
      return;
    }
    if (plan.errors.length) {
      setImportErrors(plan.errors);
      return;
    }
    if (plan.changes.length === 0) {
      toast.success(`Nothing to change — all ${plan.rowsRead} rows already match the rate card`);
      return;
    }
    setSaveReq({
      title: "Import rate card — compare before saving",
      changes: plan.changes,
      compare: plan.compare,
      warnings: [
        `${plan.rowsRead} rows read · ${plan.unchangedRows} already match · ${plan.compare.length} slabs change. Slabs not in the file stay as they are.`,
      ],
    });
  }

  /** ✎ / 🗑 for a slab line ("+" sets provider income when none covers it); `withAdd` adds "Add slab". */
  function slabActions(row: ServiceRow, s: Slab, withAdd = false) {
    const rule = incomeRuleForSlab(row, s);
    const key = slabKey(s);
    const editingThis = slabEditor?.serviceId === row.serviceId && slabEditor.slabKey === key;
    return (
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          {withAdd ? addSlabButton(row) : null}
          <IconAction
            title={rule ? "Edit slab" : "Set what the provider pays for this slab"}
            tone={rule ? "blue" : "green"}
            active={editingThis}
            onClick={() => setSlabEditor({ serviceId: row.serviceId, slabKey: key, draft: rule ? draftOfIncome(rule) : newSlabDraft(s) })}
          >
            {rule ? <Pencil size={14} /> : <Plus size={14} />}
          </IconAction>
          {rule ? (
            <IconAction title="Delete slab" tone="red" onClick={() => setSaveReq(endSlabRequest(row, rule))}>
              <Trash2 size={14} />
            </IconAction>
          ) : null}
        </div>
      </td>
    );
  }

  function addSlabButton(row: ServiceRow) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setSlabEditor({ serviceId: row.serviceId, slabKey: null, draft: newSlabDraft(null) });
        }}
        className="mr-1 inline-flex items-center gap-0.5 whitespace-nowrap rounded-lg border px-1.5 py-0.5 text-[11px] font-bold transition hover:bg-[rgba(18,183,106,0.10)]"
        style={{ borderColor: "rgba(18,183,106,0.45)", color: B.greenDark }}
        title={`Add a new slab to ${row.serviceName}`}
      >
        <Plus size={12} /> Slab
      </button>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: B.badgeGrad }}>
            <TableProperties size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Rate card
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              One row per service: what the provider pays, what each role earns, what the company keeps.
            </p>
          </div>
        </div>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
            Provider
          </span>
          <select
            className="min-w-[200px] rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: B.border, background: "var(--admin-card)" }}
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setExpanded(null);
            }}
          >
            <option value="">All providers</option>
            {data?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k) => {
            const active = k.filter !== null && k.filter === show && !category && !query;
            const tile = (
              <>
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                  <k.icon size={14} style={{ color: k.tone }} /> {k.label}
                </span>
                <span className="mt-1 block text-2xl font-bold tabular-nums" style={{ color: k.tone }}>
                  {k.value}
                </span>
                <span className="block text-[11px]" style={{ color: B.muted }}>
                  {k.hint}
                </span>
              </>
            );
            const cls = "rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-px hover:shadow-sm";
            const style = {
              borderColor: active ? k.tone : B.border,
              background: active ? `color-mix(in srgb, ${k.tone} 8%, var(--admin-card))` : "var(--admin-card)",
            };
            return k.href ? (
              <Link key={k.label} href={k.href} className={cls} style={style}>
                {tile}
              </Link>
            ) : (
              <button
                key={k.label}
                type="button"
                className={cls}
                style={style}
                onClick={() => {
                  setShow(k.filter ?? "all");
                  setCategory("");
                  setQuery("");
                }}
              >
                {tile}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-2xl border" style={{ borderColor: "#BFDBFE", background: "rgba(42,92,221,0.04)" }}>
        <button
          type="button"
          onClick={() => setHowOpen((v) => !v)}
          aria-expanded={howOpen}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold"
          style={{ color: B.blueLight }}
        >
          <Info size={15} /> How it works
          <ChevronRight size={14} className={`ml-auto transition-transform duration-200 ${howOpen ? "rotate-90" : ""}`} />
        </button>
        {howOpen && data ? (
          <div className="space-y-3 border-t px-4 py-3 text-xs" style={{ borderColor: "#BFDBFE", color: B.blue }}>
            <p>
              Click a service to see its slabs. ✎ edits a slab and its commission split, 🗑 ends it, + Slab adds one — each opens a
              popup with a live calculation (TDS included). &quot;Fill from sheet&quot; adds the provider sheet slabs to services that
              have none yet. A read-only view with net after TDS for every role is on{" "}
              <Link href="/tax-commission/setup" className="font-semibold underline-offset-2 hover:underline" style={{ color: B.blueLight }}>
                Commission overview
              </Link>
              .
            </p>
            <div className="rounded-xl border p-3" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-bold">
                  <Receipt size={14} style={{ color: B.blueLight }} /> Default tax
                  <span className="font-normal" style={{ color: B.muted }}>
                    · used by every service without its own tax · provider side: output GST{" "}
                    {pct(data.tenantTax.providerOutputGstPercent)} · TDS {pct(data.tenantTax.providerTdsPercent)}
                  </span>
                </p>
                <Link
                  href="/tax-commission/tax"
                  className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                  style={{ color: B.blueLight }}
                >
                  <Pencil size={12} /> Edit in Tax
                </Link>
              </div>
              <TaxSummary tax={data.tenantTax} className="mt-2" />
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <section className="min-w-0 rounded-2xl border" style={{ borderColor: B.border, background: B.card }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: B.border }}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold" style={{ color: B.blue }}>
                Services {data ? `(${groups.reduce((n, g) => n + g.rows.length, 0)} of ${data.services.length})` : ""}
              </p>
              <select
                aria-label="Filter by category"
                className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
                style={{ borderColor: B.border, background: "var(--admin-card)", color: B.blue }}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by status"
                className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: show === "all" ? B.border : "#FCA5A5",
                  background: "var(--admin-card)",
                  color: show === "all" ? B.blue : B.danger,
                }}
                value={show}
                onChange={(e) => setShow(e.target.value as ShowFilter)}
              >
                <option value="all">All services</option>
                <option value="loss">Loss or role on ₹0 ({lossCount})</option>
                <option value="unset">Provider pays not set ({unsetCount})</option>
              </select>
              {category || show !== "all" || query ? (
                <button
                  type="button"
                  className="text-xs font-bold hover:underline"
                  style={{ color: B.blueLight }}
                  onClick={() => {
                    setCategory("");
                    setShow("all");
                    setQuery("");
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex rounded-xl border p-0.5 text-xs font-semibold"
                style={{ borderColor: B.border }}
                role="radiogroup"
                aria-label="Row density"
              >
                {(
                  [
                    [false, "Comfortable"],
                    [true, "Compact"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={dense === value}
                    onClick={() => changeDensity(value)}
                    className="rounded-lg px-2.5 py-1 transition"
                    style={dense === value ? { background: B.blueLight, color: "#fff" } : { color: B.muted }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-xl border px-3 py-1.5" style={{ borderColor: B.border }}>
                <Search size={14} style={{ color: B.muted }} />
                <input
                  className="w-48 bg-transparent text-sm outline-none"
                  placeholder="Search service"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <ExportMenu
                disabled={!data || data.services.length === 0}
                onPdf={exportPdf}
                onExcel={() => data && downloadRateCardWorkbook(data, providerId ? providerName : "All providers")}
                onCsv={() => data && downloadCsv(`rate-card-${new Date().toISOString().slice(0, 10)}.csv`, rateCardCsv(data))}
              />
              {sheetReadyCount > 0 ? (
                <Btn
                  variant="success"
                  disabled={saving}
                  onClick={() => data && setSaveReq(sheetFillRequest(data))}
                  title="Fill Provider pays from the provider sheet for services that have none yet. You review it before it saves."
                >
                  <Sparkles size={14} /> Fill {sheetReadyCount} from sheet
                </Btn>
              ) : null}
              <Btn
                variant="secondary"
                disabled={!data || saving}
                onClick={() => importInput.current?.click()}
                title="Import the Excel (or CSV) from Export after editing it"
              >
                <Upload size={14} /> Import
              </Btn>
              <input
                ref={importInput}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={onImportFile}
              />
            </div>
          </div>

          {loadError ? (
            <p className="px-4 py-8 text-sm font-semibold" style={{ color: B.danger }}>
              {loadError}
            </p>
          ) : loading && !data ? (
            <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
              Loading rate card…
            </p>
          ) : groups.length === 0 ? (
            <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
              {query || category || show !== "all"
                ? "No service matches these filters. Clear the filters to see every service."
                : "No active services."}
            </p>
          ) : (
            <div className="max-xl:overflow-x-auto">
              <div className="min-w-[860px]">
                  {groups.map((g, gi) => (
                    <CategoryBlock key={g.category} label={g.category} count={g.rows.length} spaced={gi > 0}>
                      {g.rows.map((row, rowIndex) => {
                        const open = expanded === row.serviceId;
                        const single = row.slabs.length === 1 ? row.slabs[0] : null;
                        const Icon = getServiceIcon(row.serviceCode);
                        const issues = rowIssues(row);
                        return (
                          <ServiceTable key={row.serviceId} widths={["", "11%", "11%", "11%", "11%", "12%", "150px"]} open={open} head={<>
                            <tr
                              className="cursor-pointer border-t transition hover:brightness-[0.98]"
                              style={{
                                borderColor: B.border,
                                background: open
                                  ? ROW_BG.open
                                  : issues.any
                                    ? rowIndex % 2
                                      ? ISSUE_BG.odd
                                      : ISSUE_BG.even
                                    : rowIndex % 2
                                      ? ROW_BG.odd
                                      : ROW_BG.even,
                                boxShadow: [open ? openBlockEdge("top") : null, issues.any ? ISSUE_EDGE : null].filter(Boolean).join(", ") || undefined,
                              }}
                              onClick={() => toggle(row)}
                              aria-expanded={open}
                            >
                              <td className={`px-4 align-top ${dense ? "py-1.5" : "py-2.5"}`}>
                                <div className="flex items-start gap-2">
                                  <ChevronRight
                                    size={16}
                                    className={`mt-1 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                                    style={{ color: open ? B.blueLight : B.muted }}
                                  />
                                  <span
                                    className={`flex shrink-0 items-center justify-center rounded-xl ${dense ? "h-7 w-7" : "h-9 w-9"}`}
                                    style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                                  >
                                    <Icon size={dense ? 14 : 17} />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-1.5 font-semibold" style={{ color: B.blue }}>
                                      {row.serviceName}
                                      <IssueTags {...issues} />
                                    </p>
                                    <p className="text-[11px]" style={{ color: B.muted }}>
                                      {single
                                        ? `1 slab · ${slabLabel(single.minAmount, single.maxAmount)}`
                                        : `${row.slabs.length} slabs`}
                                    </p>
                                    {dense ? null : <ServiceChips row={row} />}
                                  </div>
                                </div>
                              </td>
                              <td colSpan={5} />
                              <td className="w-[150px] px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex items-center justify-end">
                                  {addSlabButton(row)}
                                  {canDeleteAll(row) ? (
                                    <IconAction
                                      title={`Delete all ${row.slabs.length} slabs of ${row.serviceName}`}
                                      tone="red"
                                      onClick={() => setSaveReq(endAllSlabsRequest(row))}
                                    >
                                      <Trash2 size={14} />
                                    </IconAction>
                                  ) : null}
                                </span>
                              </td>
                            </tr>
                            {open ? (
                              <SlabHeaderRow
                                cells={[
                                  { label: "Slab" },
                                  { label: "Provider pays" },
                                  ...SCHEME_ROLES.map((r) => ({ label: ROLE_LABEL[r], title: "Gross, before TDS" })),
                                  { label: "Company keeps" },
                                  { label: "Actions" },
                                ]}
                              />
                            ) : null}
</>}>
                            {open
                              ? row.slabs.map((s, slabIndex) => {
                                  const bad = s.underwater || s.providerIncome == null || s.missingRoles.length > 0;
                                  return (
                                  <tr
                                    key={slabKey(s)}
                                    className="rc-slab-in cursor-pointer border-t transition hover:brightness-[0.97]"
                                    style={{
                                      borderColor: B.border,
                                      background: bad
                                        ? slabIndex % 2
                                          ? ISSUE_BG.odd
                                          : ISSUE_BG.even
                                        : slabIndex % 2
                                          ? ROW_BG.slabOdd
                                          : ROW_BG.slabEven,
                                      boxShadow: openBlockEdge("middle"),
                                      animationDelay: `${Math.min(slabIndex, 12) * 18}ms`,
                                    }}
                                    title="Open this slab"
                                    onClick={() => {
                                      const rule = incomeRuleForSlab(row, s);
                                      setSlabEditor({
                                        serviceId: row.serviceId,
                                        slabKey: slabKey(s),
                                        draft: rule ? draftOfIncome(rule) : newSlabDraft(s),
                                      });
                                    }}
                                  >
                                    <td className={`pl-[4.25rem] pr-3 text-xs ${dense ? "py-1" : "py-2"}`} style={{ color: B.muted }}>
                                      <span className="flex flex-wrap items-center gap-1.5">
                                        {slabLabel(s.minAmount, s.maxAmount)} · on {inr(s.sampleAmount)}
                                        <IssueTags
                                          loss={s.underwater ? 1 : 0}
                                          unset={s.providerIncome == null ? 1 : 0}
                                          zeroRoles={s.missingRoles}
                                        />
                                      </span>
                                    </td>
                                    <SlabCells slab={s} dense={dense} />
                                    {slabActions(row, s)}
                                  </tr>
                                  );
                                })
                              : null}
                            {open ? (
                              <tr className="rc-slab-in border-t" style={{ borderColor: B.border, boxShadow: openBlockEdge("bottom") }}>
                                <td colSpan={7} className="px-3 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSlabEditor({ serviceId: row.serviceId, slabKey: null, draft: newSlabDraft(null) })}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-1.5 text-xs font-bold transition hover:bg-[rgba(18,183,106,0.08)]"
                                    style={{ borderColor: "rgba(18,183,106,0.5)", color: B.greenDark }}
                                  >
                                    <Plus size={13} /> Add slab to {row.serviceName}
                                  </button>
                                  {canDeleteAll(row) ? (
                                    <button
                                      type="button"
                                      onClick={() => setSaveReq(endAllSlabsRequest(row))}
                                      className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl border py-1.5 text-xs font-bold transition hover:bg-[#FEF2F2]"
                                      style={{ borderColor: "#FCA5A5", color: B.danger }}
                                    >
                                      <Trash2 size={13} /> Delete all {row.slabs.length} slabs
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            ) : null}
                          </ServiceTable>
                        );
                      })}
                    </CategoryBlock>
                  ))}
                </div>
            </div>
          )}
        </section>
      </div>

      {slabEditor && data
        ? (() => {
            const row = data.services.find((s) => s.serviceId === slabEditor.serviceId);
            if (!row) return null;
            const slab = slabEditor.slabKey ? (row.slabs.find((s) => slabKey(s) === slabEditor.slabKey) ?? null) : null;
            return (
              <SlabEditorModal
                key={`${slabEditor.serviceId}-${slabEditor.slabKey ?? "new"}-${slabEditor.draft.key}`}
                row={row}
                slab={slab}
                initialDraft={slabEditor.draft}
                providerId={providerId || null}
                providerName={providerName}
                onClose={() => setSlabEditor(null)}
                onSave={setSaveReq}
              />
            );
          })()
        : null}

      {saveReq ? (
        <SaveConfirmModal
          title={saveReq.title}
          changes={saveReq.changes}
          warnings={saveReq.warnings}
          compare={saveReq.compare}
          busy={saving}
          onConfirm={(reason) => void runSave(reason)}
          onClose={() => setSaveReq(null)}
        />
      ) : null}

      {importErrors ? (
        <Modal
          title="Import stopped"
          eyebrow="Rate card CSV"
          subtitle="Nothing was saved. Fix these rows in the file and import it again."
          icon={<AlertTriangle size={22} />}
          iconTone="red"
          onClose={() => setImportErrors(null)}
          wide={importErrors.length > 6}
        >
          <ul
            className="max-h-[50vh] space-y-1.5 overflow-y-auto rounded-2xl border p-3 text-xs"
            style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}
          >
            {importErrors.map((err) => (
              <li key={err} className="flex items-start gap-1.5 font-semibold">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {err}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px]" style={{ color: B.muted }}>
            Template: Export → Excel (or CSV). Pick Flat ₹ or Share % in the type column and type the number. Blank cells keep
            what is saved; 0 sets ₹0.
            Service name or code both work.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Btn variant="destructive" onClick={() => setImportErrors(null)}>
              Close
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                setImportErrors(null);
                importInput.current?.click();
              }}
            >
              Choose another file
            </Btn>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

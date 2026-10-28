"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
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
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { openBrandedPdf } from "@/lib/brandedExport";
import { downloadCsv } from "@/lib/taxCommissionUtils";
import { downloadRateCardWorkbook, planRateCardImport, rateCardCsv, rateCardReport } from "./rateCardTransfer";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { SaveConfirmModal } from "./SaveConfirmModal";
import { SlabEditorModal } from "./SlabEditorModal";
import { TaxSummary } from "./TaxSummary";
import { usePendingSave } from "./usePendingSave";
import { draftOfIncome, endSlabRequest, newIncomeKey, type IncomeDraft } from "./IncomeSlabModal";
import { ROLE_LABEL, SCHEME_ROLES, inr, pct, slabLabel, type RateCardData, type RoleSplit, type ServiceRow, type Slab } from "./types";
import { Btn, Chip } from "./ui";

type ShowFilter = "all" | "loss" | "unset";

/** Zebra rows: services alternate light tints; an open service and its slab rows sit on a blue band. */
const ROW_BG = {
  even: "var(--admin-card)",
  odd: "rgba(42,92,221,0.035)",
  open: "rgba(42,92,221,0.10)",
  slabEven: "rgba(42,92,221,0.05)",
  slabOdd: "rgba(42,92,221,0.085)",
};

/** Company loses money on a slab, or a role earns ₹0 on it. */
function hasLossOrMissing(row: ServiceRow): boolean {
  return row.slabs.some((s) => s.underwater || s.missingRoles.length > 0);
}

/** A slab with no "Provider pays" yet. */
function hasUnsetIncome(row: ServiceRow): boolean {
  return row.slabs.some((s) => s.providerIncome == null);
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

function SlabCells({ slab }: { slab: Slab }) {
  return (
    <>
      <td className="px-3 py-2.5 text-right">
        {slab.providerIncome != null ? (
          <span className="font-semibold tabular-nums" style={{ color: B.blue }}>
            {inr(slab.providerIncome)}
          </span>
        ) : (
          <Chip tone="amber">Not set</Chip>
        )}
      </td>
      {SCHEME_ROLES.map((role) => (
        <td key={role} className="px-3 py-2.5">
          <RoleCell r={slab.roles.find((x) => x.role === role)} />
        </td>
      ))}
      <td className="px-3 py-2.5 text-right">
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
  const missing = new Set(row.slabs.flatMap((s) => s.missingRoles));
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
      {missing.size > 0 ? (
        <Chip tone="red">No commission: {[...missing].map((r) => ROLE_LABEL[r]).join(", ")}</Chip>
      ) : null}
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
  const [query, setQuery] = useState("");
  const viewParam = useSearchParams().get("view");
  const [show, setShow] = useState<ShowFilter>(viewParam === "loss" ? "loss" : "all");
  const [seenViewParam, setSeenViewParam] = useState(viewParam);
  if (seenViewParam !== viewParam) {
    setSeenViewParam(viewParam);
    setShow(viewParam === "loss" ? "loss" : "all");
  }
  const [category, setCategory] = useState("");

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
    if (!/\.csv$/i.test(file.name)) {
      setImportErrors([`"${file.name}" is not a CSV. In Excel use File → Save As → CSV (UTF-8), then import that file.`]);
      return;
    }
    const plan = planRateCardImport(await file.text(), data, providerId || null, providerName);
    if (plan.errors.length) {
      setImportErrors(plan.errors);
      return;
    }
    if (plan.changes.length === 0) {
      toast.success(`Nothing to change — all ${plan.rowsRead} rows already match the rate card`);
      return;
    }
    setSaveReq({
      title: "Import rate card",
      changes: plan.changes,
      warnings: [
        `${plan.rowsRead} rows read · ${plan.unchangedRows} already match · ${plan.changes.length} changes to save. Slabs not in the file stay as they are.`,
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
        className="mr-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold text-white transition hover:brightness-105"
        style={{ background: B.green }}
        title={`Add a new slab to ${row.serviceName}`}
      >
        <Plus size={12} /> Add slab
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
        <section className="rounded-2xl border p-4" style={{ borderColor: B.border, background: B.card }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: B.blue }}>
                <Receipt size={15} style={{ color: B.blueLight }} /> Default tax
              </p>
              <p className="text-xs" style={{ color: B.muted }}>
                Used by every service without its own tax. Provider side: output GST {pct(data.tenantTax.providerOutputGstPercent)} ·
                TDS {pct(data.tenantTax.providerTdsPercent)}.
              </p>
            </div>
            <Link
              href="/tax-commission/tax"
              className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition hover:brightness-105"
              style={{ borderColor: B.border, background: "var(--admin-card)", color: B.blue }}
            >
              <Pencil size={14} /> Edit in Tax
            </Link>
          </div>
          <TaxSummary tax={data.tenantTax} className="mt-3" />
        </section>
      ) : null}

      <div
        className="flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs"
        style={{ borderColor: "#BFDBFE", background: "rgba(42,92,221,0.05)", color: B.blue }}
      >
        <Info size={15} className="mt-0.5 shrink-0" style={{ color: B.blueLight }} />
        <p>
          Click a service to see its slabs. ✎ edits a slab and its commission split, 🗑 ends it, + Add slab adds one — each
          opens a popup with a live calculation. The default split for every slab and &quot;Fill from provider sheet&quot; are on{" "}
          <Link href="/tax-commission/setup" className="font-semibold underline-offset-2 hover:underline" style={{ color: B.blueLight }}>
            Commission setup
          </Link>
          .
        </p>
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
              <Btn
                variant="secondary"
                disabled={!data || saving}
                onClick={() => importInput.current?.click()}
                title="Import the CSV from Export → CSV after editing it"
              >
                <Upload size={14} /> Import CSV
              </Btn>
              <input ref={importInput} type="file" accept=".csv,text/csv" className="hidden" onChange={onImportFile} />
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: B.border, color: B.muted }}>
                    <th className="px-4 py-2.5 font-bold">Service</th>
                    <th className="px-3 py-2.5 text-right font-bold">Provider pays</th>
                    {SCHEME_ROLES.map((r) => (
                      <th key={r} className="px-3 py-2.5 text-right font-bold" title="Gross, before TDS">
                        {ROLE_LABEL[r]}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-bold">Company keeps</th>
                    <th className="w-[150px] px-2 py-2.5 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.category}>
                      <tr style={{ background: "var(--admin-secondary)" }}>
                        <td colSpan={7} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
                          {g.category}
                        </td>
                      </tr>
                      {g.rows.map((row, rowIndex) => {
                        const open = expanded === row.serviceId;
                        const single = row.slabs.length === 1 ? row.slabs[0] : null;
                        return (
                          <Fragment key={row.serviceId}>
                            <tr
                              className="cursor-pointer border-t transition hover:brightness-[0.98]"
                              style={{
                                borderColor: B.border,
                                background: open ? ROW_BG.open : rowIndex % 2 ? ROW_BG.odd : ROW_BG.even,
                                boxShadow: open ? `inset 3px 0 0 ${B.blueLight}` : undefined,
                              }}
                              onClick={() => toggle(row)}
                              aria-expanded={open}
                            >
                              <td className="px-4 py-2.5 align-top">
                                <div className="flex items-start gap-1.5">
                                  {open ? (
                                    <ChevronDown size={16} className="mt-0.5 shrink-0" style={{ color: B.blueLight }} />
                                  ) : (
                                    <ChevronRight size={16} className="mt-0.5 shrink-0" style={{ color: B.muted }} />
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-semibold" style={{ color: B.blue }}>
                                      {row.serviceName}
                                    </p>
                                    <p className="text-[11px]" style={{ color: B.muted }}>
                                      {single
                                        ? `1 slab · ${slabLabel(single.minAmount, single.maxAmount)}`
                                        : `${row.slabs.length} slabs`}
                                    </p>
                                    <ServiceChips row={row} />
                                  </div>
                                </div>
                              </td>
                              <td colSpan={5} />
                              <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                {addSlabButton(row)}
                              </td>
                            </tr>
                            {open
                              ? row.slabs.map((s, slabIndex) => (
                                  <tr
                                    key={slabKey(s)}
                                    className="cursor-pointer border-t transition hover:brightness-[0.97]"
                                    style={{
                                      borderColor: B.border,
                                      background: slabIndex % 2 ? ROW_BG.slabOdd : ROW_BG.slabEven,
                                      boxShadow: `inset 3px 0 0 ${B.blueLight}`,
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
                                    <td className="py-2 pl-11 pr-3 text-xs" style={{ color: B.muted }}>
                                      {slabLabel(s.minAmount, s.maxAmount)} · on {inr(s.sampleAmount)}
                                    </td>
                                    <SlabCells slab={s} />
                                    {slabActions(row, s)}
                                  </tr>
                                ))
                              : null}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
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
            Template: Export → CSV. Types are flat or percent. Blank provider / role cells keep what is saved; 0 sets ₹0.
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

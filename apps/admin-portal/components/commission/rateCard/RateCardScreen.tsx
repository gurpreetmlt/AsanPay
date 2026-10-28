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
import { downloadBrandedExcel, openBrandedPdf } from "@/lib/brandedExport";
import { downloadCsv } from "@/lib/taxCommissionUtils";
import { planRateCardImport, rateCardCsv, rateCardReport } from "./rateCardTransfer";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { PreviewPanel } from "./PreviewPanel";
import { SaveConfirmModal } from "./SaveConfirmModal";
import { ServiceEditor } from "./ServiceEditor";
import { TaxSummary } from "./TaxSummary";
import { usePendingSave } from "./usePendingSave";
import {
  IncomeSlabFields,
  draftOfIncome,
  endSlabRequest,
  incomeChanges,
  incomeRowError,
  newIncomeKey,
  type IncomeDraft,
} from "./IncomeSlabModal";
import {
  ROLE_LABEL,
  SCHEME_ROLES,
  inr,
  pct,
  ruleLabel,
  slabLabel,
  type PreviewData,
  type PreviewDraft,
  type RateCardData,
  type RoleSplit,
  type SchemeRole,
  type ServiceRow,
  type Slab,
} from "./types";
import { Btn, Chip, NumberField, SplitModeSwitch, type SplitMode } from "./ui";
import { roleSplitError, slabSplitChanges, slabSplitOf, type SlabSplit } from "./roleSplit";

const DEFAULT_PREVIEW_AMOUNT = "2000";

/** Company loses money on a slab, or a role earns ₹0 on it. */
function hasLossOrMissing(row: ServiceRow): boolean {
  return row.slabs.some((s) => s.underwater || s.missingRoles.length > 0);
}

/** No slabs → the server's sample (₹2,000 within service limits); slabs → ₹2,000 if a slab covers it. */
function defaultAmountFor(row: ServiceRow | undefined): string {
  const first = row?.slabs[0];
  if (!row || !first) return DEFAULT_PREVIEW_AMOUNT;
  if (row.slabs.length === 1 && first.minAmount == null && first.maxAmount == null) {
    return String(Number(first.sampleAmount));
  }
  const target = Number(DEFAULT_PREVIEW_AMOUNT);
  const covers = row.slabs.some(
    (s) => (s.minAmount == null || Number(s.minAmount) <= target) && (s.maxAmount == null || Number(s.maxAmount) >= target),
  );
  return covers ? DEFAULT_PREVIEW_AMOUNT : String(Number(first.sampleAmount));
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
  const [lossOnly, setLossOnly] = useState(viewParam === "loss");
  const [seenViewParam, setSeenViewParam] = useState(viewParam);
  if (seenViewParam !== viewParam) {
    setSeenViewParam(viewParam);
    setLossOnly(viewParam === "loss");
  }

  /** Slab edited in place under its table row; stays open until the save goes through. */
  const [inlineSlab, setInlineSlab] = useState<{
    serviceId: string;
    rowKey: string;
    initial: IncomeDraft;
    draft: IncomeDraft;
    /** This slab's own role split, edited from the same card. */
    initialSplit: SlabSplit;
    modes: Record<SchemeRole, SplitMode>;
    values: Record<SchemeRole, string>;
  } | null>(null);

  const { saveReq, setSaveReq, saving, runSave } = usePendingSave(() => {
    setVersion((v) => v + 1);
    setInlineSlab(null);
  });

  const [previewServiceId, setPreviewServiceId] = useState("");
  const [previewAmount, setPreviewAmount] = useState(DEFAULT_PREVIEW_AMOUNT);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);
  /** Unsaved edits of the open service editor — the preview shows them before Save. */
  const [editorDraft, setEditorDraft] = useState<{ serviceId: string; draft: PreviewDraft } | null>(null);

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

  // Falls back to the first service until the admin picks one (or after a provider switch hides it).
  const activePreviewId =
    data?.services.some((s) => s.serviceId === previewServiceId) ? previewServiceId : (data?.services[0]?.serviceId ?? "");
  const amountValid = Number(previewAmount.trim()) > 0;

  const previewDraft = editorDraft?.serviceId === activePreviewId ? editorDraft.draft : null;
  const previewDraftKey = previewDraft ? JSON.stringify(previewDraft) : "";

  useEffect(() => {
    if (!activePreviewId || !amountValid) return;
    const amt = previewAmount.trim();
    const draft = previewDraftKey ? (JSON.parse(previewDraftKey) as PreviewDraft) : null;
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const r = await api.post("/admin/rate-card/preview", {
          serviceId: activePreviewId,
          amount: amt,
          providerId: providerId || null,
          ...(draft ? { draft } : {}),
        });
        if (seq !== previewSeq.current) return;
        if (!r.data.success) throw new Error(r.data.message);
        setPreview(r.data.data as PreviewData);
        setPreviewError(null);
      } catch (err) {
        if (seq !== previewSeq.current) return;
        setPreviewError(apiErrorMessage(err, "Preview could not be calculated. Try again."));
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [activePreviewId, amountValid, previewAmount, providerId, version, previewDraftKey]);

  const providerName = useMemo(
    () => data?.providers.find((p) => p.id === providerId)?.name ?? "This provider",
    [data, providerId],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Array<{ category: string; rows: ServiceRow[] }> = [];
    for (const s of data?.services ?? []) {
      if (q && !`${s.serviceName} ${s.serviceCode} ${s.categoryName}`.toLowerCase().includes(q)) continue;
      if (lossOnly && !hasLossOrMissing(s)) continue;
      const last = out[out.length - 1];
      if (last && last.category === s.categoryName) last.rows.push(s);
      else out.push({ category: s.categoryName, rows: [s] });
    }
    return out;
  }, [data, query, lossOnly]);

  const lossCount = useMemo(() => (data?.services ?? []).filter(hasLossOrMissing).length, [data]);

  function toggle(row: ServiceRow) {
    if (expanded === row.serviceId) setInlineSlab((cur) => (cur?.serviceId === row.serviceId ? null : cur));
    setExpanded((cur) => (cur === row.serviceId ? null : row.serviceId));
    if (activePreviewId !== row.serviceId) {
      setPreviewServiceId(row.serviceId);
      setPreviewAmount(defaultAmountFor(row));
    }
  }

  const previewServices = data?.services ?? [];

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

  function openInline(row: ServiceRow, s: Slab, draft: IncomeDraft) {
    const rowKey = slabKey(s);
    const split = slabSplitOf(s);
    setInlineSlab((cur) =>
      cur?.serviceId === row.serviceId && cur.rowKey === rowKey
        ? null
        : { serviceId: row.serviceId, rowKey, initial: draft, draft, initialSplit: split, modes: split.modes, values: split.values },
    );
  }

  /** ✎ / 🗑 for a slab line; "+" when no "Provider pays" row covers it yet. */
  function slabActions(row: ServiceRow, s: Slab) {
    const rule = incomeRuleForSlab(row, s);
    const key = slabKey(s);
    const editingThis = inlineSlab?.serviceId === row.serviceId && inlineSlab.rowKey === key;
    return (
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end gap-0.5">
          {rule ? (
            <>
              <IconAction title="Edit slab" tone="blue" active={editingThis} onClick={() => openInline(row, s, draftOfIncome(rule))}>
                <Pencil size={14} />
              </IconAction>
              <IconAction title="Delete slab" tone="red" onClick={() => setSaveReq(endSlabRequest(row, rule))}>
                <Trash2 size={14} />
              </IconAction>
            </>
          ) : (
            <IconAction
              title="Set what the provider pays for this slab"
              tone="green"
              active={editingThis}
              onClick={() =>
                openInline(row, s, {
                  key: newIncomeKey(),
                  replacesId: null,
                  providerId: providerId || null,
                  ruleType: "flat",
                  value: "",
                  capAmount: "",
                  minAmount: s.minAmount != null ? String(Number(s.minAmount)) : "",
                  maxAmount: s.maxAmount != null ? String(Number(s.maxAmount)) : "",
                  note: null,
                })
              }
            >
              <Plus size={14} />
            </IconAction>
          )}
        </div>
      </td>
    );
  }

  /** Inline slab editor, rendered as a full-width row right under the slab it edits. */
  function inlineRow(row: ServiceRow, s: Slab) {
    if (!inlineSlab || inlineSlab.serviceId !== row.serviceId || inlineSlab.rowKey !== slabKey(s)) return null;
    const { initial, draft, initialSplit, modes, values } = inlineSlab;
    const editing = Boolean(initial.replacesId);
    const error = incomeRowError(draft);
    const slabChanged = (["ruleType", "value", "capAmount", "minAmount", "maxAmount"] as const).some(
      (k) => draft[k].trim() !== initial[k].trim(),
    );
    const includeSlab = !editing || slabChanged;
    const roleErrors = SCHEME_ROLES.map((r) => roleSplitError(r, modes[r], values[r]));
    // The split follows the slab range being saved (new bounds when the range itself is edited).
    const splitChanges = slabSplitChanges({
      row,
      initial: initialSplit,
      next: { modes, values },
      providerId: providerId || null,
      minAmount: draft.minAmount.trim() || null,
      maxAmount: draft.maxAmount.trim() || null,
    });
    const changes = [...(includeSlab && !error ? incomeChanges(row, draft, providerName) : []), ...splitChanges];
    const canSave = changes.length > 0 && !(includeSlab && error) && !roleErrors.some(Boolean);

    // Live estimate on this slab's sample amount (before TDS).
    const sample = Number(s.sampleAmount);
    const toP = (v: string | number) => Math.round(Number(v) * 100);
    let incomeP: number | null = s.providerIncome != null ? toP(s.providerIncome) : null;
    if (!error) {
      incomeP =
        draft.ruleType === "flat"
          ? toP(draft.value)
          : Math.round(sample * Number(draft.value));
      if (draft.ruleType === "percentage" && draft.capAmount.trim() !== "") incomeP = Math.min(incomeP, toP(draft.capAmount));
    }
    const roleP = SCHEME_ROLES.map((r) => {
      const v = values[r].trim();
      if (v === "" || roleErrors[SCHEME_ROLES.indexOf(r)]) return 0;
      if (modes[r] === "flat") return toP(v);
      return incomeP != null ? Math.round((incomeP * Number(v)) / 100) : 0;
    });
    const keepsP = (incomeP ?? 0) + toP(s.customerFee) - roleP.reduce((a, b) => a + b, 0);
    // TDS on each role's gross, rounded down — same as the payout.
    const tdsScaled = row.tax.tdsApplies ? Math.round(Number(row.tax.tdsPercent) * 10_000) : 0;
    const tdsP = roleP.map((g) => (g > 0 && tdsScaled > 0 ? Math.floor((g * tdsScaled) / 1_000_000) : 0));
    const tdsTotalP = tdsP.reduce((a, b) => a + b, 0);
    const setRole = (r: SchemeRole, patch: { mode?: SplitMode; value?: string }) =>
      setInlineSlab((cur) =>
        cur
          ? {
              ...cur,
              modes: patch.mode ? { ...cur.modes, [r]: patch.mode } : cur.modes,
              values: patch.value !== undefined ? { ...cur.values, [r]: patch.value } : cur.values,
            }
          : cur,
      );

    return (
      <tr>
        <td colSpan={7} className="px-4 pb-3 pt-1">
          <div
            className="rounded-2xl border p-4"
            style={{ borderColor: "#93C5FD", background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
          >
            <div className="mb-3 flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: editing ? "rgba(42,92,221,0.12)" : "rgba(18,183,106,0.14)",
                  color: editing ? B.blueLight : B.greenDark,
                }}
              >
                {editing ? <Pencil size={16} /> : <Plus size={16} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: B.blue }}>
                  {editing ? "Edit slab" : "Set slab"} · {row.serviceName}
                </p>
                <p className="text-[11px]" style={{ color: B.muted }}>
                  {editing
                    ? `Now: ${slabLabel(initial.minAmount || null, initial.maxAmount || null)} → ${ruleLabel(initial.ruleType, initial.value, initial.capAmount || null)}`
                    : "What the provider pays the company for this amount range"}
                </p>
              </div>
            </div>
            <IncomeSlabFields
              wide
              draft={draft}
              onChange={(next) => setInlineSlab((cur) => (cur ? { ...cur, draft: next } : cur))}
              showError={draft !== initial}
            />

            <div className="mt-4 rounded-xl border p-3" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
                  Commission split
                </p>
                <p className="text-[11px]" style={{ color: B.muted }}>
                  This slab only ({slabLabel(draft.minAmount || null, draft.maxAmount || null)}) · % = share of what the provider pays · ₹ = flat per txn · blank = ₹0
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {SCHEME_ROLES.map((r, i) => (
                  <div key={r} className="text-xs">
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="font-semibold" style={{ color: B.muted }}>
                        {ROLE_LABEL[r]}
                      </span>
                      <SplitModeSwitch
                        label={ROLE_LABEL[r]}
                        mode={modes[r]}
                        onChange={(m) => setRole(r, { mode: m })}
                      />
                    </div>
                    <NumberField
                      label=""
                      value={values[r]}
                      onChange={(v) => setRole(r, { value: v })}
                      suffix={modes[r] === "percent" ? "%" : undefined}
                      prefix={modes[r] === "flat" ? "₹" : undefined}
                      placeholder="Off"
                      error={roleErrors[i]}
                    />
                    {!roleErrors[i] ? (
                      <p className="mt-1 text-[11px] tabular-nums" style={{ color: B.muted }}>
                        ≈ {inr(roleP[i]! / 100)} on {inr(s.sampleAmount)} · net {inr((roleP[i]! - tdsP[i]!) / 100)} after TDS
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold tabular-nums"
                style={{
                  background: keepsP < 0 ? "#FEF2F2" : "rgba(18,183,106,0.08)",
                  color: keepsP < 0 ? B.danger : B.greenDark,
                }}
              >
                <span>
                  On {inr(s.sampleAmount)}: provider pays {incomeP != null ? inr(incomeP / 100) : "not set"} · TDS{" "}
                  {row.tax.tdsApplies ? pct(row.tax.tdsPercent) : "off"} held {inr(tdsTotalP / 100)}
                </span>
                <span>{keepsP < 0 ? `Company loses ${inr(-keepsP / 100)}` : `Company keeps ${inr(keepsP / 100)}`}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <span className="mr-auto text-[11px]" style={{ color: B.muted }}>
                {changes.length > 0 ? `${changes.length} change${changes.length === 1 ? "" : "s"} to save` : "No changes yet"}
              </span>
              <Btn variant="destructive" onClick={() => setInlineSlab(null)}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                disabled={!canSave}
                onClick={() =>
                  setSaveReq({
                    title: `${editing ? "Edit" : "Set"} slab · ${row.serviceName}`,
                    changes,
                    warnings: keepsP < 0 ? [`On ${inr(s.sampleAmount)} the roles get more than the provider pays — company loses money.`] : [],
                  })
                }
              >
                Save
              </Btn>
            </div>
          </div>
        </td>
      </tr>
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
          Shares pay only once provider income is saved for a service; until then fixed rules keep paying.
          &quot;Suggested&quot; fills the form from the provider rate sheet — nothing changes until you review and Save.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 rounded-2xl border" style={{ borderColor: B.border, background: B.card }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: B.border }}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold" style={{ color: B.blue }}>
                Services {data ? `(${data.services.length})` : ""}
              </p>
              <div className="flex rounded-xl border p-0.5 text-xs font-semibold" style={{ borderColor: B.border }}>
                <button
                  type="button"
                  onClick={() => setLossOnly(false)}
                  className="rounded-lg px-2.5 py-1 transition"
                  style={!lossOnly ? { background: B.blueLight, color: "#fff" } : { color: B.muted }}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setLossOnly(true)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 transition"
                  style={lossOnly ? { background: B.danger, color: "#fff" } : { color: lossCount ? B.danger : B.muted }}
                  title="Services where the company loses money or a role earns ₹0"
                >
                  <AlertTriangle size={12} /> Loss &amp; missing ({lossCount})
                </button>
              </div>
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
                onExcel={() => data && downloadBrandedExcel(rateCardReport(data, providerId ? providerName : "All providers"))}
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
              {query
                ? `No service matches "${query}"${lossOnly ? " in Loss & missing" : ""}.`
                : lossOnly
                  ? "No service loses money and every role earns on every slab."
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
                    <th className="w-[84px] px-2 py-2.5 text-right font-bold">Actions</th>
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
                      {g.rows.map((row) => {
                        const open = expanded === row.serviceId;
                        const single = row.slabs.length === 1 ? row.slabs[0] : null;
                        return (
                          <Fragment key={row.serviceId}>
                            <tr
                              className="cursor-pointer border-t transition hover:bg-[var(--admin-secondary)]"
                              style={{ borderColor: B.border }}
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
                                        ? `${slabLabel(single.minAmount, single.maxAmount)} · on ${inr(single.sampleAmount)}`
                                        : `${row.slabs.length} slabs`}
                                    </p>
                                    <ServiceChips row={row} />
                                  </div>
                                </div>
                              </td>
                              {single ? (
                                <>
                                  <SlabCells slab={single} />
                                  {slabActions(row, single)}
                                </>
                              ) : (
                                <td colSpan={6} />
                              )}
                            </tr>
                            {single ? inlineRow(row, single) : null}
                            {!single && open
                              ? row.slabs.map((s) => (
                                  <Fragment key={slabKey(s)}>
                                    <tr
                                      className="cursor-pointer border-t transition hover:bg-[var(--admin-secondary)]"
                                      style={{ borderColor: B.border }}
                                      onClick={() => {
                                        setPreviewServiceId(row.serviceId);
                                        setPreviewAmount(String(Number(s.sampleAmount)));
                                      }}
                                    >
                                      <td className="py-2 pl-11 pr-3 text-xs" style={{ color: B.muted }}>
                                        {slabLabel(s.minAmount, s.maxAmount)} · on {inr(s.sampleAmount)}
                                      </td>
                                      <SlabCells slab={s} />
                                      {slabActions(row, s)}
                                    </tr>
                                    {inlineRow(row, s)}
                                  </Fragment>
                                ))
                              : null}
                            {open ? (
                              <tr>
                                <td colSpan={7} className="px-3 pb-4 pt-1">
                                  <ServiceEditor
                                    key={`${row.serviceId}-${data?.at ?? ""}`}
                                    row={row}
                                    providerId={providerId || null}
                                    providerName={providerName}
                                    onRequestSave={setSaveReq}
                                    onDraftChange={(draft) =>
                                      setEditorDraft((cur) =>
                                        draft
                                          ? { serviceId: row.serviceId, draft }
                                          : cur?.serviceId === row.serviceId
                                            ? null
                                            : cur,
                                      )
                                    }
                                  />
                                </td>
                              </tr>
                            ) : null}
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

        <div>
          <PreviewPanel
            services={previewServices}
            serviceId={activePreviewId}
            onServiceChange={(id) => {
              setPreviewServiceId(id);
              setPreviewAmount(defaultAmountFor(previewServices.find((s) => s.serviceId === id)));
            }}
            amount={previewAmount}
            onAmountChange={setPreviewAmount}
            preview={preview}
            hasUnsavedChanges={Boolean(previewDraft)}
            loading={previewLoading}
            error={amountValid ? previewError : "Enter an amount more than ₹0"}
          />
        </div>
      </div>

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

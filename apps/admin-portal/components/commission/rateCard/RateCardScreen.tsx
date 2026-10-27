"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { ChevronDown, ChevronRight, HelpCircle, Info, Search, Sparkles, TableProperties } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { PreviewPanel } from "./PreviewPanel";
import { SaveConfirmModal } from "./SaveConfirmModal";
import { ServiceEditor } from "./ServiceEditor";
import { TenantTaxCard } from "./TenantTaxCard";
import {
  ROLE_LABEL,
  SCHEME_ROLES,
  inr,
  pct,
  slabLabel,
  type PendingChange,
  type PreviewData,
  type RateCardData,
  type RoleSplit,
  type ServiceRow,
  type Slab,
} from "./types";
import { Chip } from "./ui";

type SaveRequest = { title: string; changes: PendingChange[]; warnings: string[] };

const DEFAULT_PREVIEW_AMOUNT = "2000";

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
        {r.source === "share" ? `${pct(r.sharePercent)} share` : r.source === "rule" ? "Fixed rule" : r.source === "none" ? "None" : "Override"}
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

  const [saveReq, setSaveReq] = useState<SaveRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const [previewServiceId, setPreviewServiceId] = useState("");
  const [previewAmount, setPreviewAmount] = useState(DEFAULT_PREVIEW_AMOUNT);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);

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

  useEffect(() => {
    if (!activePreviewId || !amountValid) return;
    const amt = previewAmount.trim();
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const r = await api.post("/admin/rate-card/preview", {
          serviceId: activePreviewId,
          amount: amt,
          providerId: providerId || null,
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
  }, [activePreviewId, amountValid, previewAmount, providerId, version]);

  const providerName = useMemo(
    () => data?.providers.find((p) => p.id === providerId)?.name ?? "This provider",
    [data, providerId],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Array<{ category: string; rows: ServiceRow[] }> = [];
    for (const s of data?.services ?? []) {
      if (q && !`${s.serviceName} ${s.serviceCode} ${s.categoryName}`.toLowerCase().includes(q)) continue;
      const last = out[out.length - 1];
      if (last && last.category === s.categoryName) last.rows.push(s);
      else out.push({ category: s.categoryName, rows: [s] });
    }
    return out;
  }, [data, query]);

  function toggle(row: ServiceRow) {
    setExpanded((cur) => (cur === row.serviceId ? null : row.serviceId));
    if (activePreviewId !== row.serviceId) {
      setPreviewServiceId(row.serviceId);
      setPreviewAmount(defaultAmountFor(row));
    }
  }

  async function runSave(reason: string) {
    if (!saveReq) return;
    setSaving(true);
    let done = 0;
    try {
      for (const c of saveReq.changes) {
        const body = { ...c.body, reason };
        const r = c.method === "delete" ? await api.delete(c.url, { data: body }) : await api.post(c.url, body);
        if (!r.data.success) throw new Error(r.data.message);
        const warning = (r.data.data as { warning?: string | null } | undefined)?.warning;
        if (warning) toast(warning, { icon: "⚠️" });
        done += 1;
      }
      toast.success(done === 1 ? "Change saved" : `${done} changes saved`);
      setSaveReq(null);
    } catch (err) {
      const failed = saveReq.changes[done];
      toast.error(
        `${failed ? `${failed.label}: ` : ""}${apiErrorMessage(err, "Save failed. Try again.")}${
          done > 0 ? ` (${done} earlier change${done === 1 ? "" : "s"} saved)` : ""
        }`,
      );
      if (done > 0) setSaveReq(null);
    } finally {
      setSaving(false);
      if (done > 0) setVersion((v) => v + 1);
    }
  }

  const previewServices = data?.services ?? [];

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
        <TenantTaxCard key={data.at} tax={data.tenantTax} onRequestSave={setSaveReq} />
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
            <p className="text-sm font-bold" style={{ color: B.blue }}>
              Services {data ? `(${data.services.length})` : ""}
            </p>
            <label className="flex items-center gap-2 rounded-xl border px-3 py-1.5" style={{ borderColor: B.border }}>
              <Search size={14} style={{ color: B.muted }} />
              <input
                className="w-48 bg-transparent text-sm outline-none"
                placeholder="Search service"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
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
              {query ? `No service matches "${query}".` : "No active services."}
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
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.category}>
                      <tr style={{ background: "var(--admin-secondary)" }}>
                        <td colSpan={6} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
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
                              {single ? <SlabCells slab={single} /> : <td colSpan={5} />}
                            </tr>
                            {!single
                              ? row.slabs.map((s) => (
                                  <tr
                                    key={`${s.minAmount}-${s.maxAmount}`}
                                    className="cursor-pointer border-t"
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
                                  </tr>
                                ))
                              : null}
                            {open ? (
                              <tr>
                                <td colSpan={6} className="px-3 pb-4 pt-1">
                                  <ServiceEditor
                                    key={`${row.serviceId}-${data?.at ?? ""}`}
                                    row={row}
                                    providerId={providerId || null}
                                    providerName={providerName}
                                    onRequestSave={setSaveReq}
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
    </div>
  );
}

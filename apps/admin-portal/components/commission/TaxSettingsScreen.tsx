"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info, Pencil, Receipt, Search, Undo2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { Modal } from "@/components/ui/Modal";
import { SaveConfirmModal } from "./rateCard/SaveConfirmModal";
import { TenantTaxCard } from "./rateCard/TenantTaxCard";
import { gstModeLabel } from "./rateCard/TaxSummary";
import { usePendingSave, type SaveRequest } from "./rateCard/usePendingSave";
import { pct, samePercent, type RateCardData, type ServiceRow, type TaxView } from "./rateCard/types";
import { Btn, CategoryHeaderRow, Chip, GstModeSwitch, TogglePercentField, percentError } from "./rateCard/ui";

type TaxDraft = Pick<TaxView, "tdsApplies" | "gstOnFeeApplies" | "gstOnFeeInclusive"> & {
  tdsPercent: string;
  gstOnFeePercent: string;
};

const num = (v: string) => String(Number(v));

function taxDraftOf(t: TaxView): TaxDraft {
  return {
    tdsApplies: t.tdsApplies,
    tdsPercent: num(t.tdsPercent),
    gstOnFeeApplies: t.gstOnFeeApplies,
    gstOnFeePercent: num(t.gstOnFeePercent),
    gstOnFeeInclusive: t.gstOnFeeInclusive,
  };
}

function taxDetail(t: TaxDraft): string {
  return `Agent TDS ${t.tdsApplies ? pct(t.tdsPercent) : "off"} · GST on fee ${
    t.gstOnFeeApplies ? `${pct(t.gstOnFeePercent)} ${t.gstOnFeeInclusive ? "included in fee" : "added on top"}` : "off"
  }`;
}

function ServiceTaxModal({
  row,
  onClose,
  onRequestSave,
}: {
  row: ServiceRow;
  onClose: () => void;
  onRequestSave: (req: SaveRequest) => void;
}) {
  const base = taxDraftOf(row.tax);
  const [tax, setTax] = useState<TaxDraft>(base);
  const isCustom = row.tax.source === "service";

  const errors = {
    tds: tax.tdsApplies ? percentError(tax.tdsPercent, "Agent TDS %") : null,
    gst: tax.gstOnFeeApplies ? percentError(tax.gstOnFeePercent, "GST on fee %") : null,
  };
  const dirty =
    tax.tdsApplies !== base.tdsApplies ||
    !samePercent(tax.tdsPercent, base.tdsPercent) ||
    tax.gstOnFeeApplies !== base.gstOnFeeApplies ||
    !samePercent(tax.gstOnFeePercent, base.gstOnFeePercent) ||
    tax.gstOnFeeInclusive !== base.gstOnFeeInclusive;
  const hasError = Boolean(errors.tds || errors.gst);

  function save() {
    onRequestSave({
      title: `Save tax · ${row.serviceName}`,
      warnings:
        tax.gstOnFeeInclusive !== base.gstOnFeeInclusive
          ? ["GST on fee mode changes what customers pay for this service. Confirm with your CA."]
          : [],
      changes: [
        {
          label: `${row.serviceName} · tax`,
          detail: `${isCustom ? `${taxDetail(base)} → ` : ""}${taxDetail(tax)}`,
          method: "post",
          url: "/admin/rate-card/tax",
          body: { serviceId: row.serviceId, ...tax },
        },
      ],
    });
  }

  function useDefault() {
    onRequestSave({
      title: `Use default tax · ${row.serviceName}`,
      warnings: [],
      changes: [
        {
          label: `${row.serviceName} · tax`,
          detail: `${taxDetail(base)} → default tax settings`,
          method: "delete",
          url: `/admin/rate-card/tax/${row.serviceId}`,
          body: {},
        },
      ],
    });
  }

  return (
    <Modal
      title={row.serviceName}
      eyebrow={row.categoryName}
      subtitle={isCustom ? "This service has its own tax. Saving starts a new version from now." : "Uses the default tax now. Saving gives it its own tax."}
      icon={<Receipt size={22} />}
      iconTone="blue"
      onClose={onClose}
    >
      <div className="rounded-2xl border p-4" style={{ borderColor: B.border, background: "linear-gradient(180deg,#F7F9FF,transparent)" }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TogglePercentField
            label="Agent TDS"
            on={tax.tdsApplies}
            onToggle={(v) => setTax((t) => ({ ...t, tdsApplies: v }))}
            value={tax.tdsPercent}
            onChange={(v) => setTax((t) => ({ ...t, tdsPercent: v }))}
            error={errors.tds}
          />
          <TogglePercentField
            label="GST on customer fee"
            on={tax.gstOnFeeApplies}
            onToggle={(v) => setTax((t) => ({ ...t, gstOnFeeApplies: v }))}
            value={tax.gstOnFeePercent}
            onChange={(v) => setTax((t) => ({ ...t, gstOnFeePercent: v }))}
            error={errors.gst}
          />
        </div>
        <div className="mt-3">
          <GstModeSwitch
            inclusive={tax.gstOnFeeInclusive}
            onChange={(v) => setTax((t) => ({ ...t, gstOnFeeInclusive: v }))}
            disabled={!tax.gstOnFeeApplies}
          />
        </div>
      </div>

      {isCustom ? (
        <Btn variant="secondary" className="mt-3 w-full" onClick={useDefault}>
          <Undo2 size={14} /> Use default tax instead
        </Btn>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn variant="destructive" onClick={onClose}>
          Cancel
        </Btn>
        <Btn variant="primary" disabled={!dirty || hasError} onClick={save}>
          Continue
        </Btn>
      </div>
      {hasError ? (
        <p className="mt-2 text-xs font-semibold text-red-600">Fix the fields in red to continue</p>
      ) : !dirty ? (
        <p className="mt-2 text-xs" style={{ color: B.muted }}>
          Change a value to continue.
        </p>
      ) : null}
    </Modal>
  );
}

export function TaxSettingsScreen() {
  const [data, setData] = useState<RateCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [customOnly, setCustomOnly] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { saveReq, setSaveReq, saving, runSave } = usePendingSave(() => setVersion((v) => v + 1));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchApi<RateCardData>("/admin/rate-card"));
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load tax settings. Check your connection and refresh."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const serviceParam = useSearchParams().get("service");
  const [seenServiceParam, setSeenServiceParam] = useState<string | null>(null);
  if (serviceParam && seenServiceParam !== serviceParam) {
    setSeenServiceParam(serviceParam);
    setEditId(serviceParam);
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Array<{ category: string; rows: ServiceRow[] }> = [];
    for (const s of data?.services ?? []) {
      if (q && !`${s.serviceName} ${s.serviceCode} ${s.categoryName}`.toLowerCase().includes(q)) continue;
      if (customOnly && s.tax.source !== "service") continue;
      const last = out[out.length - 1];
      if (last && last.category === s.categoryName) last.rows.push(s);
      else out.push({ category: s.categoryName, rows: [s] });
    }
    return out;
  }, [data, query, customOnly]);

  const customCount = useMemo(() => (data?.services ?? []).filter((s) => s.tax.source === "service").length, [data]);
  const editRow = data?.services.find((s) => s.serviceId === editId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: B.badgeGrad }}>
          <Receipt size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Tax settings
          </h1>
          <p className="text-sm" style={{ color: B.muted }}>
            The only place to change TDS and GST. Every save is versioned with a reason in Rate audit.
          </p>
        </div>
      </div>

      {data ? <TenantTaxCard key={data.at} tax={data.tenantTax} onRequestSave={setSaveReq} /> : null}

      <div
        className="flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs"
        style={{ borderColor: "#BFDBFE", background: "rgba(42,92,221,0.05)", color: B.blue }}
      >
        <Info size={15} className="mt-0.5 shrink-0" style={{ color: B.blueLight }} />
        <p>
          Services marked Custom use their own tax; the rest follow the default above. Changes apply from now to new
          transactions. The Rate card shows these values read-only.
        </p>
      </div>

      <section className="rounded-2xl border" style={{ borderColor: B.border, background: B.card }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: B.border }}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold" style={{ color: B.blue }}>
              Tax per service {data ? `(${data.services.length})` : ""}
            </p>
            <div className="flex rounded-xl border p-0.5 text-xs font-semibold" style={{ borderColor: B.border }}>
              {[
                { v: false, label: "All" },
                { v: true, label: `Custom only (${customCount})` },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setCustomOnly(o.v)}
                  className="rounded-lg px-2.5 py-1 transition"
                  style={customOnly === o.v ? { background: B.blueLight, color: "#fff" } : { color: B.muted }}
                >
                  {o.label}
                </button>
              ))}
            </div>
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
        </div>

        {loadError ? (
          <p className="px-4 py-8 text-sm font-semibold" style={{ color: B.danger }}>
            {loadError}
          </p>
        ) : loading && !data ? (
          <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
            Loading tax settings…
          </p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
            {query ? `No service matches "${query}".` : customOnly ? "No service has its own tax — all use the default." : "No active services."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: B.border, color: B.muted }}>
                  <th className="px-4 py-2.5 font-bold">Service</th>
                  <th className="px-3 py-2.5 text-right font-bold">Agent TDS</th>
                  <th className="px-3 py-2.5 text-right font-bold">GST on fee</th>
                  <th className="px-3 py-2.5 font-bold">GST mode</th>
                  <th className="px-3 py-2.5 font-bold">Source</th>
                  <th className="px-4 py-2.5 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => (
                  <Fragment key={g.category}>
                    <CategoryHeaderRow label={g.category} count={g.rows.length} colSpan={6} spaced={gi > 0} />
                    {g.rows.map((row) => (
                      <tr key={row.serviceId} className="border-t" style={{ borderColor: B.border }}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold" style={{ color: B.blue }}>
                            {row.serviceName}
                          </p>
                          <p className="font-mono text-[11px]" style={{ color: B.muted }}>
                            {row.serviceCode}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: B.blue }}>
                          {row.tax.tdsApplies ? pct(row.tax.tdsPercent) : "Off"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: B.blue }}>
                          {row.tax.gstOnFeeApplies ? pct(row.tax.gstOnFeePercent) : "Off"}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: B.muted }}>
                          {gstModeLabel(row.tax)}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.tax.source === "service" ? <Chip tone="blue">Custom</Chip> : <Chip tone="muted">Default</Chip>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Btn variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setEditId(row.serviceId)}>
                            <Pencil size={13} /> Edit
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editRow && !saveReq ? (
        <ServiceTaxModal
          key={`${editRow.serviceId}-${data?.at ?? ""}`}
          row={editRow}
          onClose={() => setEditId(null)}
          onRequestSave={(req) => {
            setEditId(null);
            setSaveReq(req);
          }}
        />
      ) : null}

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

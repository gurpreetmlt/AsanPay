"use client";

import { AlertTriangle, Calculator, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { B } from "@/lib/brand";
import { ROLE_LABEL, inr, pct, type PreviewData, type ServiceRow } from "./types";
import { Chip, NumberField } from "./ui";

function Line({ label, value, sub, muted, strong }: { label: string; value: ReactNode; sub?: ReactNode; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <div className="min-w-0">
        <p className={strong ? "font-bold" : "font-medium"} style={{ color: muted ? B.muted : B.blue }}>
          {label}
        </p>
        {sub ? (
          <p className="text-[11px]" style={{ color: B.muted }}>
            {sub}
          </p>
        ) : null}
      </div>
      <p className={`shrink-0 tabular-nums ${strong ? "font-bold" : "font-semibold"}`} style={{ color: muted ? B.muted : B.blue }}>
        {value}
      </p>
    </div>
  );
}

const SOURCE_LABEL = { share: "Share", rule: "Fixed rule", override: "Override", none: "None" } as const;

export function PreviewPanel({
  services,
  serviceId,
  onServiceChange,
  amount,
  onAmountChange,
  preview,
  hasUnsavedChanges = false,
  loading,
  error,
}: {
  services: ServiceRow[];
  serviceId: string;
  onServiceChange: (id: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  preview: PreviewData | null;
  /** The open editor has unsaved edits for this service — they are included in the numbers. */
  hasUnsavedChanges?: boolean;
  loading: boolean;
  error: string | null;
}) {
  const p = preview;
  const lossAbs = p ? Math.abs(Number(p.companyKeeps)) : 0;
  const afterCostsNegative = p ? Number(p.companyKeepsAfterCosts) < 0 : false;
  const hasPerTxnCost = p?.providerCosts.some((c) => c.perTxn && c.amount != null) ?? false;

  return (
    <section className="rounded-2xl border p-5 lg:sticky lg:top-4" style={{ borderColor: B.border, background: B.card }}>
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{ background: "rgba(42,92,221,0.12)", color: B.blueLight }}
        >
          <Calculator size={20} />
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold" style={{ color: B.blue }}>
            Live preview
            {hasUnsavedChanges ? <Chip tone="amber">Unsaved changes</Chip> : null}
          </h2>
          <p className="text-xs" style={{ color: B.muted }}>
            {hasUnsavedChanges
              ? "Includes your unsaved changes — Save to apply them to new txns."
              : "Who earns what on one txn (saved rates, no agent overrides)."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_120px] gap-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
            Service
          </span>
          <select
            className="w-full rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: B.border, background: "var(--admin-card)" }}
            value={serviceId}
            onChange={(e) => onServiceChange(e.target.value)}
          >
            {services.map((s) => (
              <option key={s.serviceId} value={s.serviceId}>
                {s.serviceName}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="Amount" value={amount} onChange={onAmountChange} prefix="₹" />
      </div>

      {error ? (
        <p className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "#FEF2F2", color: B.danger }}>
          {error}
        </p>
      ) : null}

      {!p ? (
        <p className="mt-4 flex items-center gap-2 text-sm" style={{ color: B.muted }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "Calculating…" : "Pick a service and amount."}
        </p>
      ) : (
        <div className={`mt-4 space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="rounded-2xl border px-3 py-2" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
            <Line
              label="Customer pays"
              value={inr(p.customerPays)}
              sub={
                Number(p.customerFeeCharged) > 0
                  ? p.gstOnFeeInclusive
                    ? `${inr(p.amount)} + fee ${inr(p.customerFeeCharged)} (incl. GST ${inr(p.customerFeeGst)})`
                    : `${inr(p.amount)} + fee ${inr(p.customerFee)} + GST ${inr(p.customerFeeGst)}`
                  : "No customer fee"
              }
            />
            <Line
              label="Provider pays"
              value={p.providerIncome != null ? inr(p.providerIncome) : <Chip tone="amber">Not set</Chip>}
              sub={
                p.providerIncome != null && p.providerNetReceivable != null
                  ? `${inr(p.providerIncome)} + GST ${inr(p.providerGst)} − TDS ${inr(p.providerTds)} = net receivable ${inr(p.providerNetReceivable)}`
                  : "Shares stay off until provider income is set"
              }
            />
          </div>

          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: B.border }}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ background: "var(--admin-secondary)", color: B.muted }}>
                  <th className="px-3 py-2 font-bold">Role</th>
                  <th className="px-2 py-2 text-right font-bold">Gross</th>
                  <th className="px-2 py-2 text-right font-bold">TDS {p.tax.tdsApplies ? pct(p.tax.tdsPercent) : "off"}</th>
                  <th className="px-3 py-2 text-right font-bold">Net</th>
                </tr>
              </thead>
              <tbody>
                {p.roles.map((r) => (
                  <tr key={r.role} className="border-t" style={{ borderColor: B.border }}>
                    <td className="px-3 py-2">
                      <p className="font-semibold" style={{ color: B.blue }}>
                        {ROLE_LABEL[r.role]}
                      </p>
                      <p className="text-[11px]" style={{ color: r.source === "none" ? B.danger : B.muted }}>
                        {r.source === "share" ? `${pct(r.sharePercent)} share` : SOURCE_LABEL[r.source]}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{inr(r.gross)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: B.muted }}>
                      {inr(r.tds)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: B.blue }}>
                      {inr(r.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {p.missingRoles.length > 0 ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: B.danger }}>
              <AlertTriangle size={13} /> No commission set: {p.missingRoles.map((r) => ROLE_LABEL[r]).join(", ")}
            </p>
          ) : null}

          <div className="rounded-2xl border px-3 py-2" style={{ borderColor: B.border }}>
            {Number(p.customerFeeCharged) > 0 ? (
              <Line
                label="Fee income (excl. GST)"
                value={inr(p.customerFee)}
                sub={`GST on fee ${inr(p.customerFeeGst)} ${p.gstOnFeeInclusive ? "included in fee" : "added on top"} — owed to government`}
                muted
              />
            ) : null}
            <Line label="Paid to roles (gross)" value={`− ${inr(p.totalGross)}`} muted />
            {p.underwater ? (
              <div
                className="mt-1 flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold"
                style={{ background: "#FEF2F2", color: B.danger }}
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle size={15} /> Company loses {inr(lossAbs)}
                </span>
                <span className="tabular-nums">{inr(p.companyKeeps)}</span>
              </div>
            ) : (
              <Line label="Company keeps" value={inr(p.companyKeeps)} strong />
            )}
          </div>

          {p.providerCosts.length > 0 ? (
            <div className="rounded-2xl border border-dashed px-3 py-2" style={{ borderColor: B.border }}>
              <p className="pt-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                Provider cost (from rate sheet)
              </p>
              {p.providerCosts.map((c) => (
                <Line
                  key={c.label}
                  label={c.label}
                  value={c.amount != null ? `${c.perTxn ? "− " : ""}${inr(c.amount)}` : "—"}
                  sub={c.inputGst ? `+ 18% input GST ${inr(c.inputGst)} (claimable)` : c.gstIncluded ? "GST included" : undefined}
                  muted
                />
              ))}
              {hasPerTxnCost ? (
                <Line
                  label="Company keeps after per-txn costs"
                  value={<span style={{ color: afterCostsNegative ? B.danger : undefined }}>{inr(p.companyKeepsAfterCosts)}</span>}
                  strong
                />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

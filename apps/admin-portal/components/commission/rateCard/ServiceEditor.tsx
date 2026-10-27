"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HelpCircle, IndianRupee, Pencil, Plus, Receipt, Sparkles, Trash2, Undo2, Users, Wallet, X } from "lucide-react";
import { B } from "@/lib/brand";
import {
  ROLE_LABEL,
  SCHEME_ROLES,
  feePayerLabel,
  pct,
  ruleLabel,
  samePercent,
  slabLabel,
  type PendingChange,
  type RuleType,
  type SchemeRole,
  type ServiceRow,
} from "./types";
import { Btn, Chip, NumberField, percentError } from "./ui";
import { TaxSummary } from "./TaxSummary";

type IncomeDraft = {
  key: string;
  ruleType: RuleType;
  value: string;
  capAmount: string;
  minAmount: string;
  maxAmount: string;
  note: string | null;
};

type FeeDraft = {
  key: string;
  /** Editing an existing row: same provider / role / slab, so saving closes that row. */
  replacesId: string | null;
  providerId: string | null;
  role: SchemeRole | null;
  ruleType: RuleType;
  value: string;
  minAmount: string;
  maxAmount: string;
};

const num = (v: string) => String(Number(v));

function sharesDraftOf(row: ServiceRow): Record<SchemeRole, string> {
  return {
    retailer: row.shares.retailer ? num(row.shares.retailer.sharePercent) : "",
    distributor: row.shares.distributor ? num(row.shares.distributor.sharePercent) : "",
    super_distributor: row.shares.super_distributor ? num(row.shares.super_distributor.sharePercent) : "",
  };
}

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

function incomeRowError(r: IncomeDraft): string | null {
  const v = r.value.trim();
  if (v === "") return "Enter what the provider pays for this slab";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "Provider income must be 0 or more";
  if (r.ruleType === "percentage" && n > 100) return "Percentage cannot exceed 100";
  if (r.capAmount.trim() !== "" && r.ruleType !== "percentage") return "Cap applies only to a percentage — clear the cap";
  if (r.capAmount.trim() !== "" && !(Number(r.capAmount) > 0)) return "Cap must be more than ₹0";
  if (r.minAmount.trim() !== "" && r.maxAmount.trim() !== "" && Number(r.minAmount) > Number(r.maxAmount)) {
    return "Slab min cannot be more than slab max";
  }
  return null;
}

function feeRowError(r: FeeDraft): string | null {
  const v = r.value.trim();
  if (v === "") return "Enter the customer fee for this slab";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "Customer fee must be 0 or more";
  if (r.ruleType === "percentage" && n > 100) return "Percentage cannot exceed 100";
  if (r.minAmount.trim() !== "" && r.maxAmount.trim() !== "" && Number(r.minAmount) > Number(r.maxAmount)) {
    return "Slab min cannot be more than slab max";
  }
  return null;
}

export function ServiceEditor({
  row,
  providerId,
  providerName,
  onRequestSave,
}: {
  row: ServiceRow;
  providerId: string | null;
  providerName: string;
  onRequestSave: (req: { title: string; changes: PendingChange[]; warnings: string[] }) => void;
}) {
  const [shares, setShares] = useState(() => sharesDraftOf(row));
  const [pendingIncome, setPendingIncome] = useState<IncomeDraft[]>([]);
  const [endIncomeIds, setEndIncomeIds] = useState<string[]>([]);
  const [pendingFees, setPendingFees] = useState<FeeDraft[]>([]);
  const [endFeeIds, setEndFeeIds] = useState<string[]>([]);

  const ref = row.reference;
  const scopeLabel = providerId ? providerName : "All providers";
  const hasIncome = row.providerIncomeRules.length > 0;

  const shareTotal = SCHEME_ROLES.reduce((s, r) => s + (Number(shares[r]) || 0), 0);
  const shareErrors = Object.fromEntries(
    SCHEME_ROLES.map((r) => [r, shares[r].trim() === "" ? null : percentError(shares[r], `${ROLE_LABEL[r]} share`)]),
  ) as Record<SchemeRole, string | null>;

  const incomeErrors = pendingIncome.map(incomeRowError);
  const feeErrors = pendingFees.map(feeRowError);

  const changes = useMemo<PendingChange[]>(() => {
    const out: PendingChange[] = [];
    const svc = row.serviceName;
    const scopeName = (id: string | null) => (id ? providerName : "All providers");

    for (const id of endIncomeIds) {
      const r = row.providerIncomeRules.find((x) => x.id === id);
      if (!r) continue;
      out.push({
        label: `${svc} · end provider income (${r.providerId ? providerName : "All providers"})`,
        detail: `${slabLabel(r.minAmount, r.maxAmount)}: ${ruleLabel(r.ruleType, r.value, r.capAmount)}`,
        method: "delete",
        url: `/admin/rate-card/provider-income/${r.id}`,
        body: {},
      });
    }
    for (const p of pendingIncome) {
      out.push({
        label: `${svc} · provider income (${scopeLabel})`,
        detail: `${slabLabel(p.minAmount || null, p.maxAmount || null)}: ${ruleLabel(p.ruleType, p.value, p.capAmount || null)}`,
        method: "post",
        url: "/admin/rate-card/provider-income",
        body: {
          serviceId: row.serviceId,
          providerId,
          ruleType: p.ruleType,
          value: p.value.trim(),
          capAmount: p.capAmount.trim() || null,
          minAmount: p.minAmount.trim() || null,
          maxAmount: p.maxAmount.trim() || null,
        },
      });
    }
    for (const id of endFeeIds) {
      const f = row.customerFeeRules.find((x) => x.id === id);
      if (!f) continue;
      out.push({
        label: `${svc} · end customer fee (${scopeName(f.providerId)})`,
        detail: `${slabLabel(f.minAmount, f.maxAmount)} · ${feePayerLabel(f.role)}: ${ruleLabel(f.ruleType, f.value)}`,
        method: "delete",
        url: `/admin/rate-card/customer-fee/${f.id}`,
        body: {},
      });
    }
    for (const f of pendingFees) {
      const old = f.replacesId ? row.customerFeeRules.find((x) => x.id === f.replacesId) : null;
      out.push({
        label: `${svc} · customer fee (${scopeName(f.providerId)})`,
        detail: `${slabLabel(f.minAmount || null, f.maxAmount || null)} · ${feePayerLabel(f.role)}: ${
          old ? `${ruleLabel(old.ruleType, old.value)} → ` : ""
        }${ruleLabel(f.ruleType, f.value)}`,
        method: "post",
        url: "/admin/rate-card/customer-fee",
        body: {
          serviceId: row.serviceId,
          providerId: f.providerId,
          role: f.role,
          ruleType: f.ruleType,
          value: f.value.trim(),
          minAmount: f.minAmount.trim() || null,
          maxAmount: f.maxAmount.trim() || null,
        },
      });
    }
    for (const role of SCHEME_ROLES) {
      const cur = row.shares[role];
      const next = shares[role].trim();
      if (next === "" && cur && providerId && cur.providerId === null) {
        out.push({
          label: `${svc} · ${ROLE_LABEL[role]} share (${scopeLabel})`,
          detail: `${pct(cur.sharePercent)} → 0% for ${scopeLabel} only (All providers share stays)`,
          method: "post",
          url: "/admin/rate-card/shares",
          body: { serviceId: row.serviceId, providerId, role, sharePercent: "0" },
        });
      } else if (next === "" && cur) {
        out.push({
          label: `${svc} · end ${ROLE_LABEL[role]} share`,
          detail: `${pct(cur.sharePercent)} of provider income stops`,
          method: "delete",
          url: `/admin/rate-card/shares/${cur.id}`,
          body: {},
        });
      } else if (next !== "" && (!cur || !samePercent(next, cur.sharePercent))) {
        out.push({
          label: `${svc} · ${ROLE_LABEL[role]} share (${scopeLabel})`,
          detail: `${cur ? pct(cur.sharePercent) : "none"} → ${pct(next)} of provider income`,
          method: "post",
          url: "/admin/rate-card/shares",
          body: { serviceId: row.serviceId, providerId, role, sharePercent: next },
        });
      }
    }
    return out;
  }, [row, endIncomeIds, pendingIncome, endFeeIds, pendingFees, shares, providerId, providerName, scopeLabel]);

  const hasErrors =
    incomeErrors.some(Boolean) || feeErrors.some(Boolean) || Object.values(shareErrors).some(Boolean);

  function discard() {
    setShares(sharesDraftOf(row));
    setPendingIncome([]);
    setEndIncomeIds([]);
    setPendingFees([]);
    setEndFeeIds([]);
  }

  function save() {
    const warnings: string[] = [];
    if (shareTotal > 100) {
      warnings.push(`Shares add up to ${Number(shareTotal.toFixed(4))}% — more than the provider pays. Company loses money on every txn.`);
    }
    if (!hasIncome && pendingIncome.length > 0 && SCHEME_ROLES.some((r) => shares[r].trim() !== "")) {
      warnings.push("Saving provider income turns shares on for this service — payouts switch from fixed rules to shares.");
    }
    if (pendingFees.length > 0 || endFeeIds.length > 0) {
      warnings.push("Customer fee changes what agents are charged on every new txn of this service.");
    }
    onRequestSave({ title: `Save ${row.serviceName}`, changes, warnings });
  }

  function applySuggestion() {
    if (!ref?.incomeRows) return;
    setPendingIncome(
      ref.incomeRows.map((s) => ({
        key: newKey(),
        ruleType: s.ruleType,
        value: s.value ?? "",
        capAmount: s.capAmount ?? "",
        minAmount: s.minAmount ?? "",
        maxAmount: s.maxAmount ?? "",
        note: s.note,
      })),
    );
  }

  const patchIncome = (key: string, patch: Partial<IncomeDraft>) =>
    setPendingIncome((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const patchFee = (key: string, patch: Partial<FeeDraft>) =>
    setPendingFees((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const sectionStyle = { borderColor: B.border, background: "var(--admin-card)" };

  return (
    <div className="space-y-4 rounded-2xl border p-4" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
      {ref?.note || ref?.askProvider || ref?.mode === "fixed" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: B.muted }}>
          {ref.mode === "fixed" ? <Chip tone="blue">Fixed mode</Chip> : <Chip tone="muted">Share mode</Chip>}
          {ref.askProvider ? (
            <Chip tone="amber">
              <HelpCircle size={12} /> Ask provider
            </Chip>
          ) : null}
          {ref.note ? <span>{ref.note}</span> : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Provider income */}
        <div className="flex h-full flex-col rounded-2xl border p-4" style={sectionStyle}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
              <Wallet size={14} /> Provider pays
            </p>
            {ref?.incomeRows ? (
              <button
                type="button"
                onClick={applySuggestion}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition hover:brightness-95"
                style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                title="Fill the form with the provider sheet numbers. Nothing is saved until you review and Save."
              >
                <Sparkles size={12} /> Suggested
              </button>
            ) : null}
          </div>

          {row.providerIncomeRules.length === 0 && pendingIncome.length === 0 ? (
            <p className="text-xs" style={{ color: B.muted }}>
              Not set. Shares stay off and fixed rules pay until provider income is saved.
            </p>
          ) : null}

          <ul className="space-y-2">
            {row.providerIncomeRules.map((r) => {
              const ending = endIncomeIds.includes(r.id);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
                  style={{ borderColor: B.border, opacity: ending ? 0.55 : 1 }}
                >
                  <div className={ending ? "line-through" : ""}>
                    <p className="font-semibold" style={{ color: B.blue }}>
                      {ruleLabel(r.ruleType, r.value, r.capAmount)}
                    </p>
                    <p style={{ color: B.muted }}>
                      {slabLabel(r.minAmount, r.maxAmount)} · {r.providerId ? providerName : "All providers"}
                    </p>
                  </div>
                  {ending ? (
                    <Btn variant="secondary" className="px-2 py-1 text-xs" onClick={() => setEndIncomeIds((ids) => ids.filter((x) => x !== r.id))}>
                      <Undo2 size={13} /> Keep
                    </Btn>
                  ) : (
                    <Btn variant="destructive" className="px-2 py-1 text-xs" onClick={() => setEndIncomeIds((ids) => [...ids, r.id])}>
                      <Trash2 size={13} /> End
                    </Btn>
                  )}
                </li>
              );
            })}
          </ul>

          {pendingIncome.length > 0 ? (
            <div className="mt-2 space-y-2">
              {pendingIncome.map((p, i) => (
                <div key={p.key} className="rounded-xl border p-3" style={{ borderColor: "#93C5FD", background: "rgba(42,92,221,0.04)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <Chip tone="blue">New · {scopeLabel}</Chip>
                    <button
                      type="button"
                      aria-label="Remove this slab"
                      onClick={() => setPendingIncome((rows) => rows.filter((r) => r.key !== p.key))}
                      className="rounded-lg p-1 transition hover:bg-red-50"
                      style={{ color: B.danger }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
                        Type
                      </span>
                      <select
                        className="w-full rounded-xl border px-2 py-2 text-sm"
                        style={{ borderColor: B.border, background: "var(--admin-card)" }}
                        value={p.ruleType}
                        onChange={(e) =>
                          patchIncome(p.key, {
                            ruleType: e.target.value as RuleType,
                            capAmount: e.target.value === "flat" ? "" : p.capAmount,
                          })
                        }
                      >
                        <option value="percentage">% of amount</option>
                        <option value="flat">Flat ₹</option>
                      </select>
                    </label>
                    <NumberField
                      label={p.ruleType === "percentage" ? "Rate" : "Amount"}
                      value={p.value}
                      onChange={(v) => patchIncome(p.key, { value: v })}
                      suffix={p.ruleType === "percentage" ? "%" : undefined}
                      prefix={p.ruleType === "flat" ? "₹" : undefined}
                      placeholder={p.ruleType === "percentage" ? "e.g. 0.5" : "e.g. 1.50"}
                    />
                    <NumberField label="Slab from" value={p.minAmount} onChange={(v) => patchIncome(p.key, { minAmount: v })} prefix="₹" placeholder="Any" />
                    <NumberField label="Slab to" value={p.maxAmount} onChange={(v) => patchIncome(p.key, { maxAmount: v })} prefix="₹" placeholder="Any" />
                    {p.ruleType === "percentage" ? (
                      <NumberField
                        label="Cap (max ₹ per txn)"
                        value={p.capAmount}
                        onChange={(v) => patchIncome(p.key, { capAmount: v })}
                        prefix="₹"
                        placeholder="No cap"
                        className="col-span-2"
                      />
                    ) : null}
                  </div>
                  {p.note ? (
                    <p className="mt-2 text-[11px]" style={{ color: "#B45309" }}>
                      Suggested: {p.note}
                    </p>
                  ) : null}
                  {incomeErrors[i] ? <p className="mt-1 text-xs font-semibold text-red-600">{incomeErrors[i]}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-auto pt-3">
            <Btn
              variant="success"
              className="w-full"
              onClick={() =>
                setPendingIncome((rows) => [
                  ...rows,
                  { key: newKey(), ruleType: "percentage", value: "", capAmount: "", minAmount: "", maxAmount: "", note: null },
                ])
              }
            >
              <Plus size={14} /> Add slab
            </Btn>
          </div>
        </div>

        {/* Customer fee — same rows as Commission → Customer fees */}
        <div className="flex h-full flex-col rounded-2xl border p-4" style={sectionStyle}>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
            <IndianRupee size={14} /> Customer fee
          </p>

          {row.customerFeeRules.length === 0 && pendingFees.length === 0 ? (
            <p className="text-xs" style={{ color: B.muted }}>
              No customer fee — agents are charged ₹0 extra on this service.
            </p>
          ) : null}

          <ul className="space-y-2">
            {row.customerFeeRules
              .filter((f) => !pendingFees.some((p) => p.replacesId === f.id))
              .map((f) => {
                const ending = endFeeIds.includes(f.id);
                return (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
                    style={{ borderColor: B.border, opacity: ending ? 0.55 : 1 }}
                  >
                    <div className={ending ? "line-through" : ""}>
                      <p className="font-semibold" style={{ color: B.blue }}>
                        {ruleLabel(f.ruleType, f.value)}
                      </p>
                      <p style={{ color: B.muted }}>
                        {slabLabel(f.minAmount, f.maxAmount)} · {feePayerLabel(f.role)} · {f.providerId ? providerName : "All providers"}
                      </p>
                    </div>
                    {ending ? (
                      <Btn variant="secondary" className="px-2 py-1 text-xs" onClick={() => setEndFeeIds((ids) => ids.filter((x) => x !== f.id))}>
                        <Undo2 size={13} /> Keep
                      </Btn>
                    ) : (
                      <div className="flex gap-1.5">
                        <Btn
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() =>
                            setPendingFees((rows) => [
                              ...rows,
                              {
                                key: newKey(),
                                replacesId: f.id,
                                providerId: f.providerId,
                                role: f.role,
                                ruleType: f.ruleType,
                                value: String(Number(f.value)),
                                minAmount: f.minAmount ?? "",
                                maxAmount: f.maxAmount ?? "",
                              },
                            ])
                          }
                        >
                          <Pencil size={13} /> Edit
                        </Btn>
                        <Btn variant="destructive" className="px-2 py-1 text-xs" onClick={() => setEndFeeIds((ids) => [...ids, f.id])}>
                          <Trash2 size={13} /> End
                        </Btn>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>

          {pendingFees.length > 0 ? (
            <div className="mt-2 space-y-2">
              {pendingFees.map((f, i) => (
                <div key={f.key} className="rounded-xl border p-3" style={{ borderColor: "#93C5FD", background: "rgba(42,92,221,0.04)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <Chip tone="blue">
                      {f.replacesId ? "Editing" : "New"} · {f.providerId ? providerName : "All providers"}
                    </Chip>
                    <button
                      type="button"
                      aria-label={f.replacesId ? "Cancel this edit" : "Remove this slab"}
                      onClick={() => setPendingFees((rows) => rows.filter((r) => r.key !== f.key))}
                      className="rounded-lg p-1 transition hover:bg-red-50"
                      style={{ color: B.danger }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
                        Type
                      </span>
                      <select
                        className="w-full rounded-xl border px-2 py-2 text-sm"
                        style={{ borderColor: B.border, background: "var(--admin-card)" }}
                        value={f.ruleType}
                        onChange={(e) => patchFee(f.key, { ruleType: e.target.value as RuleType })}
                      >
                        <option value="flat">Flat ₹</option>
                        <option value="percentage">% of amount</option>
                      </select>
                    </label>
                    <NumberField
                      label={f.ruleType === "percentage" ? "Rate" : "Amount"}
                      value={f.value}
                      onChange={(v) => patchFee(f.key, { value: v })}
                      suffix={f.ruleType === "percentage" ? "%" : undefined}
                      prefix={f.ruleType === "flat" ? "₹" : undefined}
                      placeholder={f.ruleType === "percentage" ? "e.g. 1" : "e.g. 10"}
                    />
                    <NumberField
                      label="Slab from"
                      value={f.minAmount}
                      onChange={(v) => patchFee(f.key, { minAmount: v })}
                      prefix="₹"
                      placeholder="Any"
                      disabled={Boolean(f.replacesId)}
                    />
                    <NumberField
                      label="Slab to"
                      value={f.maxAmount}
                      onChange={(v) => patchFee(f.key, { maxAmount: v })}
                      prefix="₹"
                      placeholder="Any"
                      disabled={Boolean(f.replacesId)}
                    />
                    <label className="col-span-2 block text-xs">
                      <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
                        Charged to
                      </span>
                      <select
                        className="w-full rounded-xl border px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ borderColor: B.border, background: "var(--admin-card)" }}
                        value={f.role ?? ""}
                        disabled={Boolean(f.replacesId)}
                        onChange={(e) => patchFee(f.key, { role: (e.target.value || null) as SchemeRole | null })}
                      >
                        <option value="">All roles</option>
                        {SCHEME_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]} only
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {f.replacesId ? (
                    <p className="mt-2 text-[11px]" style={{ color: B.muted }}>
                      Slab and role stay the same; end this fee and add a new slab to change them.
                    </p>
                  ) : null}
                  {feeErrors[i] ? <p className="mt-1 text-xs font-semibold text-red-600">{feeErrors[i]}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-auto space-y-2 pt-3">
            <Btn
              variant="success"
              className="w-full"
              onClick={() =>
                setPendingFees((rows) => [
                  ...rows,
                  {
                    key: newKey(),
                    replacesId: null,
                    providerId,
                    role: null,
                    ruleType: "flat",
                    value: "",
                    minAmount: "",
                    maxAmount: "",
                  },
                ])
              }
            >
              <Plus size={14} /> Add fee slab
            </Btn>
            <p className="text-[11px]" style={{ color: B.muted }}>
              Same fees as Commission → Customer fees. GST on the fee follows Tax → Tax settings.
            </p>
          </div>
        </div>

        {/* Shares */}
        <div className="flex h-full flex-col rounded-2xl border p-4" style={sectionStyle}>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
            <Users size={14} /> Share of provider income
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SCHEME_ROLES.map((role) => (
              <NumberField
                key={role}
                label={ROLE_LABEL[role]}
                value={shares[role]}
                onChange={(v) => setShares((s) => ({ ...s, [role]: v }))}
                suffix="%"
                placeholder="Off"
                error={shareErrors[role]}
              />
            ))}
          </div>
          <div
            className="mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold"
            style={{
              background: shareTotal > 100 ? "#FEF2F2" : "rgba(18,183,106,0.08)",
              color: shareTotal > 100 ? B.danger : B.greenDark,
            }}
          >
            <span>Roles {pct(shareTotal)}</span>
            <span>{shareTotal > 100 ? `Over by ${pct(shareTotal - 100)}` : `Company keeps ${pct(100 - shareTotal)}`}</span>
          </div>
          {providerId && SCHEME_ROLES.some((r) => row.shares[r] && row.shares[r]!.providerId === null) ? (
            <p className="mt-2 text-[11px]" style={{ color: B.muted }}>
              Showing the All providers share. Saving here creates a {providerName}-only share.
            </p>
          ) : null}

          {row.fixedRules.length > 0 ? (
            <div className="mt-3 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                Fixed rules {hasIncome ? "(used when no share is set)" : "(paying now)"}
              </p>
              {row.fixedRules
                .filter((r) => r.role !== "admin")
                .map((r) => (
                  <p key={r.id} className="text-xs" style={{ color: B.blue }}>
                    {ROLE_LABEL[r.role as SchemeRole]} · {ruleLabel(r.ruleType, r.value)} ·{" "}
                    <span style={{ color: B.muted }}>{slabLabel(r.minAmount, r.maxAmount)}</span>
                  </p>
                ))}
            </div>
          ) : null}
          <p className="mt-auto pt-3 text-[11px]" style={{ color: B.muted }}>
            Fixed ₹ / % rules stay in{" "}
            <Link href="/tax-commission/schemes" className="font-semibold underline-offset-2 hover:underline" style={{ color: B.blueLight }}>
              Schemes
            </Link>
            .
          </p>
        </div>

        {/* Tax — read-only; edited under Tax → Tax settings */}
        <div className="flex h-full flex-col rounded-2xl border p-4" style={sectionStyle}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
              <Receipt size={14} /> Tax
            </p>
            {row.tax.source === "service" ? <Chip tone="blue">Custom</Chip> : <Chip tone="muted">Uses default</Chip>}
          </div>
          <TaxSummary tax={row.tax} />
          <div className="mt-auto pt-3">
            <Link
              href={`/tax-commission/tax?service=${row.serviceId}`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition hover:brightness-105"
              style={{ borderColor: B.border, background: "var(--admin-card)", color: B.blue }}
            >
              <Pencil size={14} /> Edit in Tax
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: B.border }}>
        <p className="text-xs font-semibold" style={{ color: changes.length ? B.blueLight : B.muted }}>
          {changes.length ? `${changes.length} unsaved change${changes.length === 1 ? "" : "s"}` : "No changes"}
          {hasErrors ? <span className="ml-2 text-red-600">Fix the fields in red to save</span> : null}
        </p>
        <div className="flex gap-2">
          <Btn variant="destructive" disabled={changes.length === 0} onClick={discard}>
            Discard
          </Btn>
          <Btn variant="primary" disabled={changes.length === 0 || hasErrors} onClick={save}>
            Save changes
          </Btn>
        </div>
      </div>
    </div>
  );
}

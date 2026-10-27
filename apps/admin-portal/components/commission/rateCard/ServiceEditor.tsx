"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HelpCircle, Plus, Receipt, Sparkles, Trash2, Undo2, Users, Wallet, X } from "lucide-react";
import { B } from "@/lib/brand";
import {
  ROLE_LABEL,
  SCHEME_ROLES,
  pct,
  ruleLabel,
  samePercent,
  slabLabel,
  type PendingChange,
  type RuleType,
  type SchemeRole,
  type ServiceRow,
  type TaxView,
} from "./types";
import { Btn, Chip, GstModeSwitch, NumberField, TogglePercentField, percentError } from "./ui";

type IncomeDraft = {
  key: string;
  ruleType: RuleType;
  value: string;
  capAmount: string;
  minAmount: string;
  maxAmount: string;
  note: string | null;
};

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
  const [tax, setTax] = useState<TaxDraft>(() => taxDraftOf(row.tax));
  const [resetTax, setResetTax] = useState(false);

  const ref = row.reference;
  const scopeLabel = providerId ? providerName : "All providers";
  const hasIncome = row.providerIncomeRules.length > 0;

  const shareTotal = SCHEME_ROLES.reduce((s, r) => s + (Number(shares[r]) || 0), 0);
  const shareErrors = Object.fromEntries(
    SCHEME_ROLES.map((r) => [r, shares[r].trim() === "" ? null : percentError(shares[r], `${ROLE_LABEL[r]} share`)]),
  ) as Record<SchemeRole, string | null>;

  const taxErrors = {
    tds: tax.tdsApplies ? percentError(tax.tdsPercent, "Agent TDS %") : null,
    gst: tax.gstOnFeeApplies ? percentError(tax.gstOnFeePercent, "GST on fee %") : null,
  };
  const baseTax = taxDraftOf(row.tax);
  const taxDirty =
    !resetTax &&
    (tax.tdsApplies !== baseTax.tdsApplies ||
      !samePercent(tax.tdsPercent, baseTax.tdsPercent) ||
      tax.gstOnFeeApplies !== baseTax.gstOnFeeApplies ||
      !samePercent(tax.gstOnFeePercent, baseTax.gstOnFeePercent) ||
      tax.gstOnFeeInclusive !== baseTax.gstOnFeeInclusive);

  const incomeErrors = pendingIncome.map(incomeRowError);

  const changes = useMemo<PendingChange[]>(() => {
    const out: PendingChange[] = [];
    const svc = row.serviceName;

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
    if (resetTax) {
      out.push({
        label: `${svc} · tax`,
        detail: "Use default tax settings",
        method: "delete",
        url: `/admin/rate-card/tax/${row.serviceId}`,
        body: {},
      });
    } else if (taxDirty) {
      out.push({
        label: `${svc} · tax`,
        detail: `Agent TDS ${tax.tdsApplies ? pct(tax.tdsPercent) : "off"} · GST on fee ${
          tax.gstOnFeeApplies ? `${pct(tax.gstOnFeePercent)} ${tax.gstOnFeeInclusive ? "included in fee" : "added on top"}` : "off"
        }`,
        method: "post",
        url: "/admin/rate-card/tax",
        body: { serviceId: row.serviceId, ...tax },
      });
    }
    return out;
  }, [row, endIncomeIds, pendingIncome, shares, resetTax, taxDirty, tax, providerId, providerName, scopeLabel]);

  const hasErrors =
    incomeErrors.some(Boolean) ||
    Object.values(shareErrors).some(Boolean) ||
    (!resetTax && (Boolean(taxErrors.tds) || Boolean(taxErrors.gst)));

  function discard() {
    setShares(sharesDraftOf(row));
    setPendingIncome([]);
    setEndIncomeIds([]);
    setTax(taxDraftOf(row.tax));
    setResetTax(false);
  }

  function save() {
    const warnings: string[] = [];
    if (shareTotal > 100) {
      warnings.push(`Shares add up to ${Number(shareTotal.toFixed(4))}% — more than the provider pays. Company loses money on every txn.`);
    }
    if (!hasIncome && pendingIncome.length > 0 && SCHEME_ROLES.some((r) => shares[r].trim() !== "")) {
      warnings.push("Saving provider income turns shares on for this service — payouts switch from fixed rules to shares.");
    }
    if (tax.gstOnFeeInclusive !== baseTax.gstOnFeeInclusive && taxDirty) {
      warnings.push("GST on fee mode changes what customers pay for this service. Confirm with your CA.");
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

      <div className="grid gap-4 xl:grid-cols-3">
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

        {/* Tax */}
        <div className="flex h-full flex-col rounded-2xl border p-4" style={sectionStyle}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
              <Receipt size={14} /> Tax
            </p>
            {resetTax ? (
              <Chip tone="amber">Will use default</Chip>
            ) : row.tax.source === "service" ? (
              <Chip tone="blue">Custom</Chip>
            ) : (
              <Chip tone="muted">Uses default</Chip>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <TogglePercentField
              label="Agent TDS"
              on={tax.tdsApplies}
              onToggle={(v) => setTax((t) => ({ ...t, tdsApplies: v }))}
              value={tax.tdsPercent}
              onChange={(v) => setTax((t) => ({ ...t, tdsPercent: v }))}
              disabled={resetTax}
              error={resetTax ? null : taxErrors.tds}
            />
            <TogglePercentField
              label="GST on customer fee"
              on={tax.gstOnFeeApplies}
              onToggle={(v) => setTax((t) => ({ ...t, gstOnFeeApplies: v }))}
              value={tax.gstOnFeePercent}
              onChange={(v) => setTax((t) => ({ ...t, gstOnFeePercent: v }))}
              disabled={resetTax}
              error={resetTax ? null : taxErrors.gst}
            />
          </div>
          <div className="mt-3">
            <GstModeSwitch
              inclusive={tax.gstOnFeeInclusive}
              onChange={(v) => setTax((t) => ({ ...t, gstOnFeeInclusive: v }))}
              disabled={resetTax || !tax.gstOnFeeApplies}
            />
          </div>
          <div className="mt-auto pt-3">
            {row.tax.source === "service" ? (
              resetTax ? (
                <Btn variant="secondary" className="w-full" onClick={() => setResetTax(false)}>
                  <Undo2 size={14} /> Keep custom tax
                </Btn>
              ) : (
                <Btn variant="secondary" className="w-full" onClick={() => setResetTax(true)}>
                  Use default
                </Btn>
              )
            ) : (
              <p className="text-[11px]" style={{ color: B.muted }}>
                Change any value to give this service its own tax settings.
              </p>
            )}
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HelpCircle, IndianRupee, Pencil, Plus, Sparkles, Trash2, Undo2, Users, Wallet, X } from "lucide-react";
import { B } from "@/lib/brand";
import {
  ROLE_LABEL,
  SCHEME_ROLES,
  feePayerLabel,
  inr,
  pct,
  ruleLabel,
  samePercent,
  slabLabel,
  type PendingChange,
  type PreviewDraft,
  type RuleType,
  type PreviewData,
  type SchemeRole,
  type ServiceRow,
  type Slab,
} from "./types";
import { flatError, flatRuleOf, initialModeOf, modesOf, roleSplitChanges, sharesDraftOf } from "./roleSplit";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { Btn, Chip, NumberField, SplitModeSwitch, percentError } from "./ui";
import {
  IncomeSlabModal,
  draftOfIncome,
  endSlabRequest,
  incomeChanges,
  incomeRowError,
  type IncomeDraft,
} from "./IncomeSlabModal";

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

const slabKeyOf = (s: Slab) => `${s.minAmount ?? ""}|${s.maxAmount ?? ""}`;

/** Slab the live calculation opens on: the one covering ₹2,000 with provider income, else the first. */
function defaultCalcKey(row: ServiceRow): string {
  const covers = (s: Slab) =>
    (s.minAmount == null || Number(s.minAmount) <= 2000) && (s.maxAmount == null || Number(s.maxAmount) >= 2000);
  const s =
    row.slabs.find((x) => x.providerIncome != null && covers(x)) ??
    row.slabs.find((x) => x.providerIncome != null) ??
    row.slabs[0];
  return s ? slabKeyOf(s) : "";
}

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

const bound = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : Number(v));


function feeRowError(r: FeeDraft): string | null {
  const v = r.value.trim();
  if (v === "") return "Enter the customer fee for this slab";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "Customer fee must be 0 or more";
  if (r.ruleType === "percentage" && n > 100) return "Percentage cannot exceed 100";
  if (r.maxAmount.trim() !== "" && !(Number(r.maxAmount) > 0)) return "Slab to must be more than ₹0 — leave it blank for any amount";
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
  onDraftChange,
}: {
  row: ServiceRow;
  providerId: string | null;
  providerName: string;
  onRequestSave: (req: { title: string; changes: PendingChange[]; warnings: string[] }) => void;
  /** Unsaved edits for the live preview; null when there are none (or the editor closes). */
  onDraftChange?: (draft: PreviewDraft | null) => void;
}) {
  const [shares, setShares] = useState(() => sharesDraftOf(row));
  const [modes, setModes] = useState(() => modesOf(row));
  const [pendingIncome, setPendingIncome] = useState<IncomeDraft[]>([]);
  const [endIncomeIds, setEndIncomeIds] = useState<string[]>([]);
  const [slabModal, setSlabModal] = useState<IncomeDraft | null>(null);
  const [pendingFees, setPendingFees] = useState<FeeDraft[]>([]);
  const [endFeeIds, setEndFeeIds] = useState<string[]>([]);

  const ref = row.reference;
  const scopeLabel = providerId ? providerName : "All providers";
  const hasIncome = row.providerIncomeRules.length > 0;

  const shareTotal = SCHEME_ROLES.reduce((s, r) => s + (modes[r] === "percent" ? Number(shares[r]) || 0 : 0), 0);
  const shareErrors = Object.fromEntries(
    SCHEME_ROLES.map((r) => [
      r,
      shares[r].trim() === ""
        ? null
        : modes[r] === "flat"
          ? flatError(shares[r], ROLE_LABEL[r])
          : percentError(shares[r], `${ROLE_LABEL[r]} share`),
    ]),
  ) as Record<SchemeRole, string | null>;

  // Live calculation: server preview of one amount with every unsaved edit applied (same math as payout).
  const [calcAmount, setCalcAmount] = useState(() => {
    const s = row.slabs.find((x) => slabKeyOf(x) === defaultCalcKey(row));
    return s ? String(Number(s.sampleAmount)) : "2000";
  });
  const [calc, setCalc] = useState<PreviewData | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const calcSeq = useRef(0);

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
    for (const p of pendingIncome) out.push(...incomeChanges(row, p, providerName));
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
    const nowIso = new Date().toISOString();
    for (const role of SCHEME_ROLES) {
      out.push(...roleSplitChanges({ row, role, mode: modes[role], value: shares[role], providerId, scopeLabel, nowIso }));
    }
    return out;
  }, [row, endIncomeIds, pendingIncome, endFeeIds, pendingFees, shares, modes, providerId, providerName, scopeLabel]);

  const hasErrors =
    incomeErrors.some(Boolean) || feeErrors.some(Boolean) || Object.values(shareErrors).some(Boolean);

  // Valid unsaved edits only — a half-typed value keeps the last good preview instead of an error.
  const draft = useMemo<PreviewDraft | null>(() => {
    const out: PreviewDraft = {};
    const shareDraft: Partial<Record<SchemeRole, string>> = {};
    const flatDraft: Partial<Record<SchemeRole, string>> = {};
    for (const role of SCHEME_ROLES) {
      const next = shares[role].trim();
      if (shareErrors[role] || next.endsWith(".")) continue;
      const cur = row.shares[role];
      const wasFlat = initialModeOf(row, role) === "flat";
      if (modes[role] === "flat") {
        const flatRule = flatRuleOf(row, role);
        const changed = wasFlat ? next === "" || Number(next) !== Number(flatRule!.value) : next !== "" || Boolean(cur);
        if (changed) flatDraft[role] = next;
        continue;
      }
      if (wasFlat) flatDraft[role] = "";
      const changed = next === "" ? Boolean(cur) : !cur || !samePercent(next, cur.sharePercent);
      if (changed) shareDraft[role] = next;
    }
    if (Object.keys(shareDraft).length) out.shares = shareDraft;
    if (Object.keys(flatDraft).length) out.flats = flatDraft;
    if (endIncomeIds.length) out.endIncomeIds = endIncomeIds;
    const income = pendingIncome.filter((_, i) => !incomeErrors[i]);
    if (income.length) {
      out.addIncome = income.map((p) => ({
        providerId: p.providerId,
        ruleType: p.ruleType,
        value: p.value.trim(),
        capAmount: p.capAmount.trim() || null,
        minAmount: p.minAmount.trim() || null,
        maxAmount: p.maxAmount.trim() || null,
        replacesId: p.replacesId,
      }));
    }
    if (endFeeIds.length) out.endFeeIds = endFeeIds;
    const fees = pendingFees.filter((_, i) => !feeErrors[i]);
    if (fees.length) {
      out.addFees = fees.map((f) => ({
        providerId: f.providerId,
        role: f.role,
        ruleType: f.ruleType,
        value: f.value.trim(),
        minAmount: f.minAmount.trim() || null,
        maxAmount: f.maxAmount.trim() || null,
        replacesId: f.replacesId,
      }));
    }
    return Object.keys(out).length ? out : null;
  }, [shares, modes, row, shareErrors, endIncomeIds, pendingIncome, incomeErrors, endFeeIds, pendingFees, feeErrors]);

  const draftKey = draft ? JSON.stringify(draft) : "";

  useEffect(() => {
    const amt = calcAmount.trim();
    if (!(Number(amt) > 0)) return;
    const d = draftKey ? (JSON.parse(draftKey) as PreviewDraft) : null;
    const seq = ++calcSeq.current;
    const t = setTimeout(async () => {
      setCalcBusy(true);
      try {
        const r = await api.post("/admin/rate-card/preview", {
          serviceId: row.serviceId,
          amount: amt,
          providerId,
          ...(d ? { draft: d } : {}),
        });
        if (seq !== calcSeq.current) return;
        if (!r.data.success) throw new Error(r.data.message);
        setCalc(r.data.data as PreviewData);
        setCalcError(null);
      } catch (err) {
        if (seq !== calcSeq.current) return;
        setCalcError(apiErrorMessage(err, "Live calculation failed. Check the fields in red."));
      } finally {
        if (seq === calcSeq.current) setCalcBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [draftKey, calcAmount, row, providerId]);
  const draftCb = useRef(onDraftChange);
  useEffect(() => {
    draftCb.current = onDraftChange;
  }, [onDraftChange]);
  useEffect(() => {
    draftCb.current?.(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => () => draftCb.current?.(null), []);

  function discard() {
    setShares(sharesDraftOf(row));
    setModes(modesOf(row));
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

  /** Popup Continue → the shared review popup (reason + Save) for just this slab. */
  function saveSlab(d: IncomeDraft) {
    setSlabModal(null);
    onRequestSave({
      title: d.replacesId ? `Edit slab · ${row.serviceName}` : `Add slab · ${row.serviceName}`,
      changes: incomeChanges(row, d, providerName),
      warnings: [],
    });
  }

  function endSlab(r: ServiceRow["providerIncomeRules"][number]) {
    onRequestSave(endSlabRequest(row, r));
  }

  function applySuggestion() {
    if (!ref?.incomeRows) return;
    setPendingIncome(
      ref.incomeRows.map((s) => ({
        key: newKey(),
        replacesId: null,
        providerId,
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
    <div
      className="space-y-4 rounded-2xl border p-4"
      style={{ borderColor: "#93C5FD", background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(42,92,221,0.12)", color: B.blueLight }}
        >
          <Pencil size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: B.blue }}>
            Edit service · {row.serviceName}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: B.muted }}>
            {ref?.mode === "fixed" ? <Chip tone="blue">Fixed mode</Chip> : <Chip tone="muted">Share mode</Chip>}
            {ref?.askProvider ? (
              <Chip tone="amber">
                <HelpCircle size={12} /> Ask provider
              </Chip>
            ) : null}
            {ref?.note ? <span>{ref.note}</span> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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

          {row.providerIncomeRules.length > 0 ? (
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: B.border }}>
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]" style={{ background: "var(--admin-secondary)", color: B.muted }}>
                <span className="font-semibold">
                  {row.providerIncomeRules.length} slab{row.providerIncomeRules.length === 1 ? "" : "s"}
                  {endIncomeIds.length > 0 ? ` · ${endIncomeIds.length} marked to end` : ""}
                </span>
                {endIncomeIds.length === row.providerIncomeRules.length ? (
                  <button type="button" className="font-bold hover:underline" style={{ color: B.blueLight }} onClick={() => setEndIncomeIds([])}>
                    Keep all
                  </button>
                ) : (
                  <button
                    type="button"
                    className="font-bold hover:underline"
                    style={{ color: B.danger }}
                    title="Mark every slab to end — use with Suggested to replace the whole table in one save"
                    onClick={() => setEndIncomeIds(row.providerIncomeRules.map((r) => r.id))}
                  >
                    End all
                  </button>
                )}
              </div>
              <div className="max-h-[380px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-[1]" style={{ background: "var(--admin-card)" }}>
                    <tr style={{ color: B.muted }}>
                      <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">Slab</th>
                      <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide">Company gets</th>
                      <th className="w-[84px] px-3 py-2" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...row.providerIncomeRules]
                      .sort((a, b) => (bound(a.minAmount) ?? -1) - (bound(b.minAmount) ?? -1))
                      .map((r) => {
                        const ending = endIncomeIds.includes(r.id);
                        return (
                          <tr
                            key={r.id}
                            className="border-t transition-colors hover:bg-[var(--admin-secondary)]"
                            style={{ borderColor: B.border, opacity: ending ? 0.5 : 1 }}
                          >
                            <td className="px-3 py-2" style={{ color: B.muted }}>
                              <span className={ending ? "line-through" : ""}>{slabLabel(r.minAmount, r.maxAmount)}</span>
                              {r.providerId ? (
                                <span className="ml-1.5">
                                  <Chip tone="muted">{providerName}</Chip>
                                </span>
                              ) : null}
                            </td>
                            <td className={`px-3 py-2 text-right font-bold tabular-nums ${ending ? "line-through" : ""}`} style={{ color: B.blue }}>
                              {ruleLabel(r.ruleType, r.value, r.capAmount)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                {ending ? (
                                  <button
                                    type="button"
                                    title="Keep this slab"
                                    aria-label="Keep this slab"
                                    onClick={() => setEndIncomeIds((ids) => ids.filter((x) => x !== r.id))}
                                    className="rounded-lg p-1.5 transition hover:bg-[rgba(42,92,221,0.10)]"
                                    style={{ color: B.blueLight }}
                                  >
                                    <Undo2 size={14} />
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      title="Edit slab"
                                      aria-label={`Edit slab ${slabLabel(r.minAmount, r.maxAmount)}`}
                                      onClick={() => setSlabModal(draftOfIncome(r))}
                                      className="rounded-lg p-1.5 transition hover:bg-[rgba(42,92,221,0.10)]"
                                      style={{ color: B.blueLight }}
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      title="End slab"
                                      aria-label={`End slab ${slabLabel(r.minAmount, r.maxAmount)}`}
                                      onClick={() => endSlab(r)}
                                      className="rounded-lg p-1.5 transition hover:bg-red-50"
                                      style={{ color: B.danger }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {pendingIncome.length > 0 ? (
            <div className="mt-2 space-y-2">
              {pendingIncome.map((p, i) => (
                <div key={p.key} className="rounded-xl border p-3" style={{ borderColor: "#93C5FD", background: "rgba(42,92,221,0.04)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <Chip tone="blue">
                      {p.replacesId ? "Editing" : "New"} · {p.providerId ? providerName : "All providers"}
                    </Chip>
                    <button
                      type="button"
                      aria-label={p.replacesId ? "Cancel this edit" : "Remove this slab"}
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
                setSlabModal({
                  key: newKey(),
                  replacesId: null,
                  providerId,
                  ruleType: "flat",
                  value: "",
                  capAmount: "",
                  minAmount: "",
                  maxAmount: "",
                  note: null,
                })
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

        {/* Commission split — the service default for every slab */}
        <div className="flex flex-col rounded-2xl border p-4 lg:col-span-2" style={sectionStyle}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
              <Users size={14} /> Commission split
              {calcBusy ? <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: B.blueLight }} /> : null}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: B.muted }}>
                Example txn
              </span>
              {row.slabs.length > 1 ? (
                <select
                  aria-label="Pick a slab for the example"
                  className="max-w-[170px] rounded-lg border px-2 py-1 text-xs"
                  style={{ borderColor: B.border, background: "var(--admin-card)", color: B.blue }}
                  value=""
                  onChange={(e) => e.target.value && setCalcAmount(e.target.value)}
                >
                  <option value="">Pick slab…</option>
                  {row.slabs.map((s) => (
                    <option key={slabKeyOf(s)} value={String(Number(s.sampleAmount))}>
                      {slabLabel(s.minAmount, s.maxAmount)}
                    </option>
                  ))}
                </select>
              ) : null}
              <label className="flex items-center rounded-lg border px-2" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
                <span className="pr-1 text-xs" style={{ color: B.muted }}>
                  ₹
                </span>
                <input
                  aria-label="Example transaction amount"
                  inputMode="decimal"
                  className="w-[78px] bg-transparent py-1 text-xs tabular-nums outline-none"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(e.target.value.replace(/[^\d.]/g, ""))}
                />
              </label>
            </div>
          </div>
          <p className="mb-3 text-[11px]" style={{ color: B.muted }}>
            Default for every slab · % = share of what the provider pays · ₹ = flat per txn · blank = off. A slab&apos;s own
            split (✎ on its table row) wins over this default.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {SCHEME_ROLES.map((role) => {
              const live = calc?.roles.find((r) => r.role === role);
              return (
                <div key={role} className="text-xs">
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="font-semibold" style={{ color: B.muted }}>
                      {ROLE_LABEL[role]}
                    </span>
                    <SplitModeSwitch
                      label={ROLE_LABEL[role]}
                      mode={modes[role]}
                      onChange={(m) => setModes((s) => ({ ...s, [role]: m }))}
                      disabled={Boolean(providerId)}
                      disabledReason="Flat ₹ is set for All providers — pick All providers to switch"
                    />
                  </div>
                  <NumberField
                    label=""
                    value={shares[role]}
                    onChange={(v) => setShares((s) => ({ ...s, [role]: v }))}
                    suffix={modes[role] === "percent" ? "%" : undefined}
                    prefix={modes[role] === "flat" ? "₹" : undefined}
                    placeholder="Off"
                    error={shareErrors[role]}
                  />
                  {!shareErrors[role] && live && calc ? (
                    <p className="mt-1 text-[11px] tabular-nums" style={{ color: live.source === "none" ? B.danger : B.muted }}>
                      ≈ {inr(live.gross)} on {inr(calc.amount)} · net {inr(live.net)} after TDS
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {shareTotal > 100 ? (
            <p className="mt-2 text-xs font-semibold text-red-600">
              % shares add up to {pct(shareTotal)} — more than the provider pays.
            </p>
          ) : null}
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold tabular-nums"
            style={{
              background: calc?.underwater ? "#FEF2F2" : "rgba(18,183,106,0.08)",
              color: calc?.underwater ? B.danger : B.greenDark,
            }}
          >
            {!(Number(calcAmount) > 0) ? (
              <span className="text-red-600">Enter an example amount more than ₹0</span>
            ) : calcError ? (
              <span className="text-red-600">{calcError}</span>
            ) : calc ? (
              <>
                <span>
                  On {inr(calc.amount)}: provider pays {calc.providerIncome != null ? inr(calc.providerIncome) : "not set"}
                  {Number(calc.customerFee) > 0 ? ` · fee ${inr(calc.customerFee)}` : ""} · TDS held {inr(calc.totalTds)}
                </span>
                <span>
                  {calc.underwater ? `Company loses ${inr(Math.abs(Number(calc.companyKeeps)))}` : `Company keeps ${inr(calc.companyKeeps)}`}
                </span>
              </>
            ) : (
              <span>Calculating…</span>
            )}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: B.muted }}>
            TDS {row.tax.tdsApplies ? pct(row.tax.tdsPercent) : "off"} on agent commission
            {row.tax.source === "service" ? " (custom for this service)" : " (same for all services)"} · change it in{" "}
            <Link
              href={`/tax-commission/tax?service=${row.serviceId}`}
              className="font-semibold underline-offset-2 hover:underline"
              style={{ color: B.blueLight }}
            >
              Tax settings
            </Link>
            . Updates as you type — unsaved slabs, fees and splits included.
          </p>
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
          <p className="mt-2 text-[11px]" style={{ color: B.muted }}>
            Fixed ₹ / % rules stay in{" "}
            <Link href="/tax-commission/schemes" className="font-semibold underline-offset-2 hover:underline" style={{ color: B.blueLight }}>
              Schemes
            </Link>
            .
          </p>
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

      {slabModal ? (
        <IncomeSlabModal
          initial={slabModal}
          serviceName={row.serviceName}
          scopeName={slabModal.providerId ? providerName : "All providers"}
          onClose={() => setSlabModal(null)}
          onContinue={saveSlab}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { B } from "@/lib/brand";
import {
  ROLE_LABEL,
  inr,
  pct,
  ruleLabel,
  slabLabel,
  type IncomeRule,
  type PendingChange,
  type RuleType,
  type ServiceRow,
} from "./types";
import { Btn, NumberField } from "./ui";

export type IncomeDraft = {
  key: string;
  /** Editing an existing row: saving adds the new row and ends this one. */
  replacesId: string | null;
  providerId: string | null;
  ruleType: RuleType;
  value: string;
  capAmount: string;
  minAmount: string;
  maxAmount: string;
  note: string | null;
};

let keySeq = 0;
export const newIncomeKey = () => `slab${++keySeq}`;

export const amountBound = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : Number(v));

export function incomeRowError(r: IncomeDraft): string | null {
  const v = r.value.trim();
  if (v === "") return "Enter what the provider pays for this slab";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "Provider income must be 0 or more";
  if (r.ruleType === "percentage" && n > 100) return "Percentage cannot exceed 100";
  if (r.capAmount.trim() !== "" && r.ruleType !== "percentage") return "Cap applies only to a percentage — clear the cap";
  if (r.capAmount.trim() !== "" && !(Number(r.capAmount) > 0)) return "Cap must be more than ₹0";
  if (r.maxAmount.trim() !== "" && !(Number(r.maxAmount) > 0)) return "Slab to must be more than ₹0 — leave it blank for any amount";
  if (r.minAmount.trim() !== "" && r.maxAmount.trim() !== "" && Number(r.minAmount) > Number(r.maxAmount)) {
    return "Slab min cannot be more than slab max";
  }
  return null;
}

export function draftOfIncome(r: IncomeRule): IncomeDraft {
  return {
    key: newIncomeKey(),
    replacesId: r.id,
    providerId: r.providerId,
    ruleType: r.ruleType,
    value: String(Number(r.value)),
    capAmount: r.capAmount != null ? String(Number(r.capAmount)) : "",
    minAmount: r.minAmount != null ? String(Number(r.minAmount)) : "",
    maxAmount: r.maxAmount != null ? String(Number(r.maxAmount)) : "",
    note: null,
  };
}

/** Save requests for one new / edited provider income slab. */
export function incomeChanges(row: ServiceRow, p: IncomeDraft, providerName: string): PendingChange[] {
  const svc = row.serviceName;
  const old = p.replacesId ? row.providerIncomeRules.find((x) => x.id === p.replacesId) : null;
  const out: PendingChange[] = [
    {
      label: `${svc} · provider income (${p.providerId ? providerName : "All providers"})`,
      detail: `${
        old ? `${slabLabel(old.minAmount, old.maxAmount)}: ${ruleLabel(old.ruleType, old.value, old.capAmount)} → ` : ""
      }${slabLabel(p.minAmount || null, p.maxAmount || null)}: ${ruleLabel(p.ruleType, p.value, p.capAmount || null)}`,
      method: "post",
      url: "/admin/rate-card/provider-income",
      body: {
        serviceId: row.serviceId,
        providerId: p.providerId,
        ruleType: p.ruleType,
        value: p.value.trim(),
        capAmount: p.capAmount.trim() || null,
        minAmount: p.minAmount.trim() || null,
        maxAmount: p.maxAmount.trim() || null,
      },
    },
  ];
  // Same slab: the server closes the old row itself. New slab bounds: end the old row explicitly.
  if (
    old &&
    (amountBound(old.minAmount) !== amountBound(p.minAmount) || amountBound(old.maxAmount) !== amountBound(p.maxAmount))
  ) {
    out.push({
      label: `${svc} · end old provider income slab`,
      detail: `${slabLabel(old.minAmount, old.maxAmount)}: ${ruleLabel(old.ruleType, old.value, old.capAmount)}`,
      method: "delete",
      url: `/admin/rate-card/provider-income/${old.id}`,
      body: {},
    });
  }
  return out;
}

/** Review popup request for ending one provider income slab. */
export function endSlabRequest(row: ServiceRow, r: IncomeRule) {
  return {
    title: `Delete slab · ${row.serviceName}`,
    changes: [
      {
        label: `${row.serviceName} · end provider income slab`,
        detail: `${slabLabel(r.minAmount, r.maxAmount)}: ${ruleLabel(r.ruleType, r.value, r.capAmount)}`,
        method: "delete" as const,
        url: `/admin/rate-card/provider-income/${r.id}`,
        body: {},
      },
    ],
    warnings: [`Txns in ${slabLabel(r.minAmount, r.maxAmount)} get no provider income until another slab covers it.`],
  };
}

/** Review popup request for ending every slab of a service: provider income slabs + slab-only role shares. */
export function endAllSlabsRequest(row: ServiceRow) {
  const svc = row.serviceName;
  const changes: PendingChange[] = row.providerIncomeRules.map((r) => ({
    label: `${svc} · end provider income slab`,
    detail: `${slabLabel(r.minAmount, r.maxAmount)}: ${ruleLabel(r.ruleType, r.value, r.capAmount)}`,
    method: "delete",
    url: `/admin/rate-card/provider-income/${r.id}`,
    body: {},
  }));
  const seen = new Set<string>();
  for (const s of row.slabs) {
    for (const r of s.roles) {
      if (!r.shareSlab || !r.shareId || seen.has(r.shareId)) continue;
      seen.add(r.shareId);
      changes.push({
        label: `${svc} · end ${ROLE_LABEL[r.role]} slab share`,
        detail: `${slabLabel(s.minAmount, s.maxAmount)}: ${r.shareFlat != null ? `${inr(r.shareFlat)} flat` : pct(r.sharePercent)}`,
        method: "delete",
        url: `/admin/rate-card/shares/${r.shareId}`,
        body: {},
      });
    }
  }
  return {
    title: `Delete all slabs · ${svc}`,
    changes,
    warnings: [
      `All ${row.slabs.length} slab${row.slabs.length === 1 ? "" : "s"} of ${svc} are removed. New ${svc} transactions get no provider income until you add slabs again. The service-wide default split stays.`,
    ],
  };
}

/** Slab form fields + live "range → income" line; shared by the popup and the inline table editor. */
export function IncomeSlabFields({
  draft: d,
  onChange,
  showError,
  wide = false,
}: {
  draft: IncomeDraft;
  onChange: (next: IncomeDraft) => void;
  showError: boolean;
  /** Four fields per row (inline table editor) instead of two (popup). */
  wide?: boolean;
}) {
  const error = incomeRowError(d);
  const patch = (p: Partial<IncomeDraft>) => onChange({ ...d, ...p });
  return (
    <>
      <div className={`grid gap-3 sm:grid-cols-2 ${wide ? "lg:grid-cols-4" : ""}`}>
        <NumberField label="Slab from" value={d.minAmount} onChange={(v) => patch({ minAmount: v })} prefix="₹" placeholder="Any" />
        <NumberField label="Slab to" value={d.maxAmount} onChange={(v) => patch({ maxAmount: v })} prefix="₹" placeholder="Any" />
        <label className="block text-xs">
          <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
            Type
          </span>
          <select
            className="w-full rounded-xl border px-2 py-2 text-sm"
            style={{ borderColor: B.border, background: "var(--admin-card)" }}
            value={d.ruleType}
            onChange={(e) => patch({ ruleType: e.target.value as RuleType, capAmount: e.target.value === "flat" ? "" : d.capAmount })}
          >
            <option value="flat">Flat ₹</option>
            <option value="percentage">% of amount</option>
          </select>
        </label>
        <NumberField
          label={d.ruleType === "percentage" ? "Rate" : "Company gets"}
          value={d.value}
          onChange={(v) => patch({ value: v })}
          suffix={d.ruleType === "percentage" ? "%" : undefined}
          prefix={d.ruleType === "flat" ? "₹" : undefined}
          placeholder={d.ruleType === "percentage" ? "e.g. 0.5" : "e.g. 1.50"}
        />
        {d.ruleType === "percentage" ? (
          <NumberField
            label="Cap (max ₹ per txn)"
            value={d.capAmount}
            onChange={(v) => patch({ capAmount: v })}
            prefix="₹"
            placeholder="No cap"
            className="sm:col-span-2"
          />
        ) : null}
      </div>
      <p className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "rgba(42,92,221,0.08)", color: B.blueLight }}>
        {error
          ? "Leave Slab from / Slab to blank for any amount."
          : `${slabLabel(d.minAmount || null, d.maxAmount || null)} → ${ruleLabel(d.ruleType, d.value, d.capAmount || null)}`}
      </p>
      {showError && error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
    </>
  );
}

/** Add / edit one "Provider pays" slab. Continue hands the draft back; the caller asks for the reason and saves. */
export function IncomeSlabModal({
  initial,
  serviceName,
  scopeName,
  onClose,
  onContinue,
}: {
  initial: IncomeDraft;
  serviceName: string;
  scopeName: string;
  onClose: () => void;
  onContinue: (draft: IncomeDraft) => void;
}) {
  const [d, setD] = useState(initial);
  const editing = Boolean(initial.replacesId);
  const error = incomeRowError(d);

  return (
    <Modal
      title={editing ? "Edit slab" : "Add slab"}
      eyebrow={`${serviceName} · Provider pays`}
      subtitle={
        editing
          ? `Now: ${slabLabel(initial.minAmount || null, initial.maxAmount || null)} → ${ruleLabel(initial.ruleType, initial.value, initial.capAmount || null)}`
          : `What the provider pays the company for one amount range (${scopeName}).`
      }
      icon={editing ? <Pencil size={22} /> : <Plus size={22} />}
      iconTone={editing ? "blue" : "green"}
      onClose={onClose}
    >
      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
      >
        <IncomeSlabFields draft={d} onChange={setD} showError={d !== initial} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn variant="destructive" onClick={onClose}>
          Cancel
        </Btn>
        <Btn variant="primary" disabled={Boolean(error)} onClick={() => onContinue(d)}>
          Continue
        </Btn>
      </div>
    </Modal>
  );
}

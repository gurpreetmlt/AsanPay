"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { B } from "@/lib/brand";
import { ruleLabel, slabLabel, type RuleType } from "./types";
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
  const patch = (p: Partial<IncomeDraft>) => setD((cur) => ({ ...cur, ...p }));
  const showError = d !== initial && error;

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
        <div className="grid gap-3 sm:grid-cols-2">
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
              onChange={(e) =>
                patch({ ruleType: e.target.value as RuleType, capAmount: e.target.value === "flat" ? "" : d.capAmount })
              }
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
        {showError ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
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

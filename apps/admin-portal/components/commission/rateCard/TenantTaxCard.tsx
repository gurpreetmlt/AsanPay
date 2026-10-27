"use client";

import { useState } from "react";
import { Landmark, Pencil, Receipt } from "lucide-react";
import { B } from "@/lib/brand";
import type { PendingChange, TenantTax } from "./types";
import { pct, samePercent } from "./types";
import { Btn, Chip, GstModeSwitch, NumberField, TogglePercentField, percentError } from "./ui";

type Draft = {
  tdsApplies: boolean;
  tdsPercent: string;
  gstOnFeeApplies: boolean;
  gstOnFeePercent: string;
  gstOnFeeInclusive: boolean;
  providerOutputGstPercent: string;
  providerTdsPercent: string;
};

const trim = (v: string) => String(Number(v));

function toDraft(t: TenantTax): Draft {
  return {
    tdsApplies: t.tdsApplies,
    tdsPercent: trim(t.tdsPercent),
    gstOnFeeApplies: t.gstOnFeeApplies,
    gstOnFeePercent: trim(t.gstOnFeePercent),
    gstOnFeeInclusive: t.gstOnFeeInclusive,
    providerOutputGstPercent: trim(t.providerOutputGstPercent),
    providerTdsPercent: trim(t.providerTdsPercent),
  };
}

/** Remount (key) after each reload so the draft resets to saved values. */
export function TenantTaxCard({
  tax,
  onRequestSave,
}: {
  tax: TenantTax;
  onRequestSave: (req: { title: string; changes: PendingChange[]; warnings: string[] }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(tax));

  const errors = {
    tds: draft.tdsApplies ? percentError(draft.tdsPercent, "Agent TDS %") : null,
    gst: draft.gstOnFeeApplies ? percentError(draft.gstOnFeePercent, "GST on fee %") : null,
    pGst: percentError(draft.providerOutputGstPercent, "Output GST billed to provider %"),
    pTds: percentError(draft.providerTdsPercent, "TDS deducted by provider %"),
  };
  const hasError = Object.values(errors).some(Boolean);
  const before = toDraft(tax);
  const dirty =
    draft.tdsApplies !== before.tdsApplies ||
    !samePercent(draft.tdsPercent, before.tdsPercent) ||
    draft.gstOnFeeApplies !== before.gstOnFeeApplies ||
    !samePercent(draft.gstOnFeePercent, before.gstOnFeePercent) ||
    draft.gstOnFeeInclusive !== before.gstOnFeeInclusive ||
    !samePercent(draft.providerOutputGstPercent, before.providerOutputGstPercent) ||
    !samePercent(draft.providerTdsPercent, before.providerTdsPercent);

  function save() {
    const parts = [
      `Agent TDS ${draft.tdsApplies ? pct(draft.tdsPercent) : "off"}`,
      `GST on fee ${draft.gstOnFeeApplies ? `${pct(draft.gstOnFeePercent)} ${draft.gstOnFeeInclusive ? "included in fee" : "added on top"}` : "off"}`,
      `Provider: output GST ${pct(draft.providerOutputGstPercent)} · TDS ${pct(draft.providerTdsPercent)}`,
    ];
    const warnings =
      draft.gstOnFeeInclusive !== before.gstOnFeeInclusive
        ? [
            draft.gstOnFeeInclusive
              ? "GST will be carved out of the fee — customers pay less in total and company fee income drops. Confirm with your CA."
              : "GST will be added on top of the fee — customers pay more in total. Confirm with your CA.",
          ]
        : [];
    onRequestSave({
      title: "Save default tax",
      warnings,
      changes: [
        {
          label: "Default tax (all services without their own tax)",
          detail: parts.join(" · "),
          method: "post",
          url: "/admin/rate-card/tax",
          body: { serviceId: null, ...draft },
        },
      ],
    });
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const disabled = !editing;

  return (
    <section className="rounded-2xl border p-5" style={{ borderColor: B.border, background: B.card }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Default tax
            </h2>
            <Chip tone={tax.source === "builtin" ? "amber" : "muted"}>
              {tax.source === "builtin" ? "Built-in values — not saved yet" : "Tenant default"}
            </Chip>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
            Used by every service that has no tax settings of its own.
          </p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Btn variant="destructive" onClick={() => { setDraft(toDraft(tax)); setEditing(false); }}>
              Cancel
            </Btn>
            <Btn variant="primary" disabled={!dirty || hasError} onClick={save}>
              Save
            </Btn>
          </div>
        ) : (
          <Btn variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit
          </Btn>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="h-full rounded-2xl border p-4" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
            <Receipt size={14} /> Agent and customer
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <TogglePercentField
              label="Agent TDS"
              on={draft.tdsApplies}
              onToggle={(v) => set("tdsApplies", v)}
              value={draft.tdsPercent}
              onChange={(v) => set("tdsPercent", v)}
              disabled={disabled}
              error={errors.tds}
            />
            <TogglePercentField
              label="GST on customer fee"
              on={draft.gstOnFeeApplies}
              onToggle={(v) => set("gstOnFeeApplies", v)}
              value={draft.gstOnFeePercent}
              onChange={(v) => set("gstOnFeePercent", v)}
              disabled={disabled}
              error={errors.gst}
            />
            <GstModeSwitch
              inclusive={draft.gstOnFeeInclusive}
              onChange={(v) => set("gstOnFeeInclusive", v)}
              disabled={disabled || !draft.gstOnFeeApplies}
            />
          </div>
        </div>

        <div className="flex h-full flex-col rounded-2xl border p-4" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
            <Landmark size={14} /> Provider side
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="Output GST billed to provider"
              value={draft.providerOutputGstPercent}
              onChange={(v) => set("providerOutputGstPercent", v)}
              suffix="%"
              disabled={disabled}
              error={errors.pGst}
            />
            <NumberField
              label="TDS deducted by provider"
              value={draft.providerTdsPercent}
              onChange={(v) => set("providerTdsPercent", v)}
              suffix="%"
              disabled={disabled}
              error={errors.pTds}
            />
          </div>
          <p className="mt-auto pt-3 text-xs" style={{ color: B.muted }}>
            Preview shows: Provider pays ₹x + GST ₹y − TDS ₹z = net receivable.
          </p>
        </div>
      </div>
    </section>
  );
}

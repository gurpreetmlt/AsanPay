"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { B } from "@/lib/brand";
import { IncomeSlabFields, incomeChanges, incomeRowError, type IncomeDraft } from "./IncomeSlabModal";
import { roleSplitError, slabSplitChanges, slabSplitOf, type SlabSplit } from "./roleSplit";
import { ROLE_LABEL, SCHEME_ROLES, inr, pct, ruleLabel, slabLabel, type PendingChange, type SchemeRole, type ServiceRow, type Slab } from "./types";
import { Btn, NumberField, SplitModeSwitch, type SplitMode } from "./ui";

const EMPTY_SPLIT: SlabSplit = {
  modes: { retailer: "percent", distributor: "percent", super_distributor: "percent" },
  values: { retailer: "", distributor: "", super_distributor: "" },
};

const toP = (v: string | number) => Math.round(Number(v) * 100);

/** Example amount inside the slab: its upper bound, else lower bound, else ₹2,000. */
function exampleFor(d: IncomeDraft): string {
  const max = d.maxAmount.trim();
  const min = d.minAmount.trim();
  if (max && Number(max) > 0) return String(Number(max));
  if (min && Number(min) > 0) return String(Number(min));
  return "2000";
}

/**
 * Add / edit one slab in a popup: what the provider pays for the range, this slab's own role split
 * (% or ₹ per role), and a live per-slab calculation with TDS. Save hands the writes to the review popup.
 */
export function SlabEditorModal({
  row,
  slab,
  initialDraft,
  providerId,
  providerName,
  onClose,
  onSave,
}: {
  row: ServiceRow;
  /** null = new slab. */
  slab: Slab | null;
  initialDraft: IncomeDraft;
  providerId: string | null;
  providerName: string;
  onClose: () => void;
  onSave: (req: { title: string; changes: PendingChange[]; warnings: string[] }) => void;
}) {
  const editing = Boolean(initialDraft.replacesId) || slab !== null;
  const initialSplit = slab ? slabSplitOf(slab) : EMPTY_SPLIT;
  const [draft, setDraft] = useState(initialDraft);
  const [modes, setModes] = useState<Record<SchemeRole, SplitMode>>(initialSplit.modes);
  const [values, setValues] = useState<Record<SchemeRole, string>>(initialSplit.values);
  const [example, setExample] = useState(() => exampleFor(initialDraft));

  const error = incomeRowError(draft);
  const slabChanged =
    !initialDraft.replacesId ||
    (["ruleType", "value", "capAmount", "minAmount", "maxAmount"] as const).some((k) => draft[k].trim() !== initialDraft[k].trim());
  const roleErrors = SCHEME_ROLES.map((r) => roleSplitError(r, modes[r], values[r]));
  const splitChanges = slabSplitChanges({
    row,
    initial: initialSplit,
    next: { modes, values },
    providerId,
    minAmount: draft.minAmount.trim() || null,
    maxAmount: draft.maxAmount.trim() || null,
  });
  const changes = [...(slabChanged && !error ? incomeChanges(row, draft, providerName) : []), ...splitChanges];
  const canSave = changes.length > 0 && !(slabChanged && error) && !roleErrors.some(Boolean);

  // Live calculation on the example amount (same rounding as the payout: share half-up, TDS down).
  const amountP = toP(example);
  const exampleOk = Number(example) > 0;
  let incomeP: number | null = slab?.providerIncome != null ? toP(slab.providerIncome) : null;
  if (!error && exampleOk) {
    incomeP = draft.ruleType === "flat" ? toP(draft.value) : Math.round((amountP * Number(draft.value)) / 100);
    if (draft.ruleType === "percentage" && draft.capAmount.trim() !== "") incomeP = Math.min(incomeP, toP(draft.capAmount));
  }
  const tdsScaled = row.tax.tdsApplies ? Math.round(Number(row.tax.tdsPercent) * 10_000) : 0;
  const roleCalc = SCHEME_ROLES.map((r, i) => {
    const v = values[r].trim();
    let gross = 0;
    if (v !== "" && !roleErrors[i]) {
      gross = modes[r] === "flat" ? toP(v) : incomeP != null ? Math.round((incomeP * Number(v)) / 100) : 0;
    }
    const tds = gross > 0 && tdsScaled > 0 ? Math.floor((gross * tdsScaled) / 1_000_000) : 0;
    return { role: r, gross, tds, net: gross - tds };
  });
  const feeP = slab ? toP(slab.customerFee) : 0;
  const keepsP = (incomeP ?? 0) + feeP - roleCalc.reduce((a, c) => a + c.gross, 0);
  const tdsTotal = roleCalc.reduce((a, c) => a + c.tds, 0);
  const range = slabLabel(draft.minAmount || null, draft.maxAmount || null);

  return (
    <Modal
      title={editing ? "Edit slab" : "Add new slab"}
      eyebrow={`${row.serviceName} · ${providerId ? providerName : "All providers"}`}
      subtitle={
        initialDraft.replacesId
          ? `Now: ${slabLabel(initialDraft.minAmount || null, initialDraft.maxAmount || null)} → ${ruleLabel(initialDraft.ruleType, initialDraft.value, initialDraft.capAmount || null)}`
          : "Set the amount range, what the provider pays, and what each role earns on it."
      }
      icon={editing ? <Pencil size={22} /> : <Plus size={22} />}
      iconTone={editing ? "blue" : "green"}
      onClose={onClose}
      wide
    >
      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
      >
        <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
          Slab · provider pays
        </p>
        <IncomeSlabFields wide draft={draft} onChange={setDraft} showError={draft !== initialDraft} />
      </div>

      <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
            Commission split
          </p>
          <p className="text-[11px]" style={{ color: B.muted }}>
            This slab only ({range}) · % = share of what the provider pays · ₹ = flat per txn · blank = ₹0
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {SCHEME_ROLES.map((r, i) => (
            <div key={r} className="text-xs">
              <div className="mb-1 flex items-center justify-between gap-1">
                <span className="font-semibold" style={{ color: B.muted }}>
                  {ROLE_LABEL[r]}
                </span>
                <SplitModeSwitch label={ROLE_LABEL[r]} mode={modes[r]} onChange={(m) => setModes((s) => ({ ...s, [r]: m }))} />
              </div>
              <NumberField
                label=""
                value={values[r]}
                onChange={(v) => setValues((s) => ({ ...s, [r]: v }))}
                suffix={modes[r] === "percent" ? "%" : undefined}
                prefix={modes[r] === "flat" ? "₹" : undefined}
                placeholder="0"
                error={roleErrors[i]}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: B.border }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2" style={{ background: "var(--admin-secondary)" }}>
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
            Live calculation
          </span>
          <label className="flex items-center gap-1.5 text-[11px]" style={{ color: B.muted }}>
            Txn amount
            <span className="flex items-center rounded-lg border px-2" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
              <span className="pr-1 text-xs">₹</span>
              <input
                aria-label="Transaction amount for the live calculation"
                inputMode="decimal"
                className="w-[84px] bg-transparent py-1 text-xs tabular-nums outline-none"
                style={{ color: B.blue }}
                value={example}
                onChange={(e) => setExample(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </span>
          </label>
        </div>
        {!exampleOk ? (
          <p className="border-t px-4 py-2 text-xs font-semibold text-red-600" style={{ borderColor: B.border }}>
            Enter a transaction amount more than ₹0
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs" style={{ borderColor: B.border }}>
              <span style={{ color: B.muted }}>Provider pays on {inr(example)}</span>
              <span className="font-bold tabular-nums" style={{ color: incomeP == null ? "#B45309" : B.blue }}>
                {incomeP == null ? "Not set" : inr(incomeP / 100)}
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-t" style={{ borderColor: B.border, color: B.muted }}>
                  <th className="px-4 py-1.5 text-left font-semibold">Role</th>
                  <th className="px-4 py-1.5 text-right font-semibold">Gross</th>
                  <th className="px-4 py-1.5 text-right font-semibold">TDS {row.tax.tdsApplies ? pct(row.tax.tdsPercent) : "off"}</th>
                  <th className="px-4 py-1.5 text-right font-semibold">Net to wallet</th>
                </tr>
              </thead>
              <tbody>
                {roleCalc.map((c) => (
                  <tr key={c.role} className="border-t" style={{ borderColor: B.border }}>
                    <td className="px-4 py-1.5 font-semibold" style={{ color: B.blue }}>
                      {ROLE_LABEL[c.role]}
                      <span className="ml-1 font-normal" style={{ color: B.muted }}>
                        · {values[c.role].trim() === "" ? "₹0" : modes[c.role] === "flat" ? "flat" : pct(values[c.role])}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: B.blue }}>
                      {inr(c.gross / 100)}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: B.muted }}>
                      − {inr(c.tds / 100)}
                    </td>
                    <td className="px-4 py-1.5 text-right font-bold tabular-nums" style={{ color: B.greenDark }}>
                      {inr(c.net / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {feeP > 0 ? (
              <div className="flex items-center justify-between border-t px-4 py-1.5 text-xs" style={{ borderColor: B.border, color: B.muted }}>
                <span>Customer fee (before GST)</span>
                <span className="tabular-nums">+ {inr(feeP / 100)}</span>
              </div>
            ) : null}
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs font-bold tabular-nums"
              style={{
                borderColor: B.border,
                background: keepsP < 0 ? "#FEF2F2" : "rgba(18,183,106,0.08)",
                color: keepsP < 0 ? B.danger : B.greenDark,
              }}
            >
              <span className="font-semibold">TDS held {inr(tdsTotal / 100)}</span>
              <span>{keepsP < 0 ? `Company loses ${inr(-keepsP / 100)}` : `Company keeps ${inr(keepsP / 100)}`}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="mr-auto text-[11px]" style={{ color: B.muted }}>
          {changes.length > 0 ? `${changes.length} change${changes.length === 1 ? "" : "s"} to save` : "No changes yet"}
        </span>
        <Btn variant="destructive" onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          variant={editing ? "primary" : "success"}
          disabled={!canSave}
          onClick={() =>
            onSave({
              title: `${editing ? "Edit" : "Add"} slab · ${row.serviceName}`,
              changes,
              warnings: keepsP < 0 ? [`On ${inr(example)} the roles get more than the provider pays — company loses money.`] : [],
            })
          }
        >
          {editing ? "Save" : "Add slab"}
        </Btn>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import { MARGIN_FIELDS, TYPE_LABEL, margin, type CmsBiller } from "./cmsBillers";
import { Btn, Chip } from "./ui";

type Key = (typeof MARGIN_FIELDS)[number]["key"];
type Draft = Record<Key, string>;

const NUM = /^\d+(\.\d+)?$/;
const micro = (v: string) => Math.round(Number(v) * 1e6);
const show = (m: number) => String(Number((m / 1e6).toFixed(6)));

function fieldError(label: string, v: string): string | null {
  const t = v.trim();
  if (!t) return `Enter the ${label.toLowerCase()} — use 0 if nothing is paid`;
  if (!NUM.test(t)) return `${label} must be a number of 0 or more`;
  if (Number(t) >= 10000) return `${label} must be below 10000`;
  return null;
}

/** Edit one biller's margins; saved with a reason like a one-row upload (Undo from Upload history). */
export function CmsBillerEditModal({
  biller,
  onClose,
  onSaved,
}: {
  biller: CmsBiller;
  onClose: () => void;
  onSaved: (importId: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    companyMargin: margin(biller.companyMargin),
    retailerMargin: margin(biller.retailerMargin),
    distributorMargin: margin(biller.distributorMargin),
    superMargin: margin(biller.superMargin),
  }));
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = (k: Key) => (k === "companyMargin" ? "Company margin" : `${MARGIN_FIELDS.find((f) => f.key === k)!.label} margin`);
  const errors = Object.fromEntries(MARGIN_FIELDS.map(({ key }) => [key, fieldError(label(key), draft[key])])) as Record<Key, string | null>;
  const fieldsOk = MARGIN_FIELDS.every(({ key }) => !errors[key]);
  const split = fieldsOk ? micro(draft.retailerMargin) + micro(draft.distributorMargin) + micro(draft.superMargin) : 0;
  const keeps = fieldsOk ? micro(draft.companyMargin) - split : 0;
  const overSplit = fieldsOk && keeps < 0;
  const changed = fieldsOk && MARGIN_FIELDS.some(({ key }) => micro(draft[key]) !== micro(biller[key]));
  const reasonOk = reason.trim().length >= 3;
  const canSave = fieldsOk && !overSplit && changed && reasonOk && !busy;

  function applyDefaultSplit() {
    const c = draft.companyMargin.trim();
    if (!NUM.test(c)) return;
    const m = micro(c);
    setDraft((d) => ({ ...d, retailerMargin: show(Math.round(m * 0.5)), distributorMargin: show(Math.round(m * 0.1)), superMargin: "0" }));
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.patch(`/admin/cms/billers/${biller.billerId}`, { ...draft, reason: reason.trim() });
      if (!r.data.success) throw new Error(r.data.message);
      onSaved((r.data.data as { id: string }).id);
    } catch (err) {
      setError(apiErrorMessage(err, "The margins were not saved. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Edit biller margins"
      eyebrow="Cash Collection biller"
      subtitle={`${biller.billerName} · ${biller.billerId}`}
      icon={<Pencil size={22} />}
      iconTone="blue"
      onClose={busy ? () => undefined : onClose}
    >
      <div className="rounded-2xl border p-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <Chip tone={biller.billerType === "agent" ? "blue" : biller.billerType === "customer" ? "green" : "muted"}>{TYPE_LABEL[biller.billerType]}</Chip>
          <span style={{ color: B.muted }}>Same unit as the provider sheet · up to 6 decimals</span>
          <button type="button" onClick={applyDefaultSplit} className="ml-auto text-xs font-bold hover:underline" style={{ color: B.blueLight }}>
            Use 50% · 10% · 0% split
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {MARGIN_FIELDS.map(({ key }) => {
            const err = errors[key];
            const isChanged = !err && micro(draft[key]) !== micro(biller[key]);
            return (
              <label key={key} className="block text-xs">
                <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
                  {label(key)}
                </span>
                <input
                  inputMode="decimal"
                  value={draft[key]}
                  disabled={busy}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm tabular-nums outline-none"
                  style={{ borderColor: err ? "#FCA5A5" : isChanged ? B.blueLight : B.border, background: "var(--admin-card)" }}
                />
                <span className={`mt-1 block ${err ? "font-semibold text-red-600" : ""}`} style={err ? undefined : { color: B.muted }}>
                  {err ?? `Saved: ${margin(biller[key])}`}
                </span>
              </label>
            );
          })}
        </div>
        <div
          className="mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
          style={overSplit || !fieldsOk ? { background: "#FEF2F2", color: B.danger } : { background: "rgba(18,183,106,0.10)", color: B.greenDark }}
        >
          {overSplit || !fieldsOk ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
          {!fieldsOk
            ? "Fix the margins above."
            : overSplit
              ? `Retailer + Distributor + Super (${show(split)}) is more than the company margin (${show(micro(draft.companyMargin))}).`
              : `AsanPay keeps ${show(keeps)} per transaction${changed ? "" : " · no change yet"}.`}
        </div>
      </div>

      <label className="mt-4 block text-xs">
        <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
          Reason for this change
        </span>
        <textarea
          rows={2}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="e.g. Provider revised this biller's margin"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ borderColor: touched && !reasonOk ? "#FCA5A5" : B.border, background: "var(--admin-card)" }}
        />
        <span className={`mt-1 block ${touched && !reasonOk ? "font-semibold text-red-600" : ""}`} style={touched && !reasonOk ? undefined : { color: B.muted }}>
          {touched && !reasonOk ? "Enter a reason for this change (at least 3 characters)" : "At least 3 characters · shown in Rate audit"}
        </span>
      </label>

      {error ? (
        <p
          className="mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
          style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn variant="destructive" disabled={busy} onClick={onClose}>
          Cancel
        </Btn>
        <Btn variant="primary" disabled={!canSave} onClick={() => void save()}>
          {busy ? "Saving…" : "Save margins"}
        </Btn>
      </div>
    </Modal>
  );
}

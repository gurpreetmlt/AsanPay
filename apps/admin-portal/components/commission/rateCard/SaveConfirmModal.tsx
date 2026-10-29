"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { B } from "@/lib/brand";
import type { CompareRow, PendingChange } from "./types";
import { Btn } from "./ui";

function ChangeList({ changes }: { changes: PendingChange[] }) {
  return (
    <div className="mt-2 rounded-2xl border p-3" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
      <ul className={`grid gap-2 ${changes.length > 6 ? "sm:grid-cols-2" : ""}`}>
        {changes.map((c, i) => (
          <li
            key={`${c.url}-${i}`}
            className="flex items-start gap-2 rounded-xl border px-3 py-2"
            style={{ borderColor: B.border, background: "var(--admin-card)" }}
          >
            {c.method === "delete" ? (
              <Trash2 size={15} className="mt-0.5 shrink-0" style={{ color: B.danger }} />
            ) : (
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: B.green }} />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: B.blue }}>
                {c.label}
              </p>
              <p className="text-xs" style={{ color: B.muted }}>
                {c.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Before → after table for an import, one block per slab. */
function CompareTable({ rows }: { rows: CompareRow[] }) {
  const newCount = rows.filter((r) => r.isNew).length;
  const valueCount = rows.reduce((n, r) => n + r.fields.length, 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-[11px] font-bold">
        <span className="rounded-full px-2.5 py-1" style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}>
          {rows.length - newCount} slab{rows.length - newCount === 1 ? "" : "s"} change
        </span>
        {newCount > 0 ? (
          <span className="rounded-full px-2.5 py-1" style={{ background: "rgba(18,183,106,0.12)", color: B.greenDark }}>
            {newCount} new slab{newCount === 1 ? "" : "s"}
          </span>
        ) : null}
        <span className="rounded-full px-2.5 py-1" style={{ background: "var(--admin-secondary)", color: B.muted }}>
          {valueCount} value{valueCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="max-h-[48vh] overflow-auto rounded-2xl border" style={{ borderColor: B.border }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-[1]" style={{ background: "color-mix(in srgb, #2A5CDD 12%, var(--admin-card))" }}>
            <tr className="text-left text-[10px] uppercase tracking-wide" style={{ color: B.blueLight }}>
              <th className="px-3 py-2 font-bold">Service · slab</th>
              <th className="px-3 py-2 font-bold">What</th>
              <th className="px-3 py-2 font-bold">Now</th>
              <th className="w-6 px-0 py-2" />
              <th className="px-3 py-2 font-bold">After import</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) =>
              r.fields.map((f, fi) => (
                <tr
                  key={`${ri}-${fi}`}
                  className={fi === 0 ? "border-t" : ""}
                  style={{ borderColor: B.border, background: ri % 2 ? "rgba(42,92,221,0.03)" : "var(--admin-card)" }}
                >
                  {fi === 0 ? (
                    <td className="px-3 py-1.5 align-top" rowSpan={r.fields.length}>
                      <p className="font-bold" style={{ color: B.blue }}>
                        {r.service}
                      </p>
                      <p className="flex items-center gap-1" style={{ color: B.muted }}>
                        {r.slab}
                        {r.isNew ? (
                          <span className="rounded-full px-1.5 text-[10px] font-bold" style={{ background: "rgba(18,183,106,0.12)", color: B.greenDark }}>
                            New
                          </span>
                        ) : null}
                      </p>
                    </td>
                  ) : null}
                  <td className="px-3 py-1.5 font-semibold" style={{ color: B.blue }}>
                    {f.label}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums" style={{ color: B.muted }}>
                    {f.before}
                  </td>
                  <td className="px-0 py-1.5" style={{ color: B.muted }}>
                    <ArrowRight size={12} />
                  </td>
                  <td className="px-3 py-1.5 font-bold tabular-nums" style={{ color: f.after === "Not set" ? B.danger : B.greenDark }}>
                    {f.after}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SaveConfirmModal({
  title,
  changes,
  warnings,
  compare,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  changes: PendingChange[];
  warnings: string[];
  compare?: CompareRow[];
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const reasonOk = reason.trim().length >= 3;
  const onlyEnds = changes.every((c) => c.method === "delete");
  const hasCompare = !!compare && compare.length > 0;

  return (
    <Modal
      title={title}
      eyebrow={hasCompare ? `${compare.length} slab${compare.length === 1 ? "" : "s"} · ${changes.length} saves` : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
      subtitle={
        hasCompare
          ? "Check what each slab is now and what it becomes. Applies from now to new transactions."
          : "Applies from now to new transactions. The reason is saved in Rate audit."
      }
      icon={onlyEnds ? <Trash2 size={22} /> : <ShieldCheck size={22} />}
      iconTone={onlyEnds ? "red" : "blue"}
      onClose={busy ? () => undefined : onClose}
      wide={hasCompare || changes.length > 6}
    >
      {hasCompare ? <CompareTable rows={compare} /> : null}

      <details className={hasCompare ? "mt-3" : "hidden"}>
        <summary className="cursor-pointer text-xs font-semibold" style={{ color: B.blueLight }}>
          Show the {changes.length} saves this makes
        </summary>
        <ChangeList changes={changes} />
      </details>
      {hasCompare ? null : <ChangeList changes={changes} />}

      {warnings.length > 0 ? (
        <div
          className="mt-3 space-y-1 rounded-xl border px-3 py-2 text-xs font-semibold"
          style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: B.danger }}
        >
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      ) : null}

      <label className="mt-4 block text-xs">
        <span className="mb-1 block font-semibold" style={{ color: B.muted }}>
          Reason for this change
        </span>
        <textarea
          autoFocus
          rows={2}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="e.g. Provider rate sheet Oct 2026"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ borderColor: touched && !reasonOk ? "#FCA5A5" : B.border, background: "var(--admin-card)" }}
        />
        <span className={`mt-1 block ${touched && !reasonOk ? "font-semibold text-red-600" : ""}`} style={touched && !reasonOk ? undefined : { color: B.muted }}>
          {touched && !reasonOk
            ? "Enter a reason for this change (at least 3 characters)"
            : "At least 3 characters · shown in Rate audit"}
        </span>
      </label>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn variant="destructive" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
        <Btn variant="primary" disabled={busy || !reasonOk} onClick={() => onConfirm(reason.trim())}>
          {busy ? "Saving…" : "Save"}
        </Btn>
      </div>
    </Modal>
  );
}

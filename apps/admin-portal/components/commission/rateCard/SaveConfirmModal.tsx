"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { B } from "@/lib/brand";
import type { PendingChange } from "./types";
import { Btn } from "./ui";

export function SaveConfirmModal({
  title,
  changes,
  warnings,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  changes: PendingChange[];
  warnings: string[];
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const reasonOk = reason.trim().length >= 3;
  const onlyEnds = changes.every((c) => c.method === "delete");

  return (
    <Modal
      title={title}
      eyebrow={`${changes.length} change${changes.length === 1 ? "" : "s"}`}
      subtitle="Applies from now to new transactions. The reason is saved in Rate audit."
      icon={onlyEnds ? <Trash2 size={22} /> : <ShieldCheck size={22} />}
      iconTone={onlyEnds ? "red" : "blue"}
      onClose={busy ? () => undefined : onClose}
      wide={changes.length > 6}
    >
      <div
        className="rounded-2xl border p-3"
        style={{ borderColor: B.border, background: "var(--admin-secondary)" }}
      >
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

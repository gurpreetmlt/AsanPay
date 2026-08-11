"use client";

import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { B } from "@/lib/brand";

interface DangerConfirmModalProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Animated warning confirm — light + dark (html.dark) readable. */
export function DangerConfirmModal({
  title,
  message,
  confirmLabel = "Delete permanently",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onClose,
}: DangerConfirmModalProps) {
  return (
    <div
      className="danger-confirm-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="danger-confirm-title"
        className="danger-confirm-panel w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          borderColor: "var(--danger-confirm-border)",
          background: "var(--admin-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative flex items-start gap-3 px-5 pb-3 pt-5"
          style={{ background: "var(--danger-confirm-header-bg)" }}
        >
          <div className="danger-confirm-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
            <AlertTriangle size={26} strokeWidth={2.25} style={{ color: B.danger }} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="danger-confirm-title"
              className="text-lg font-bold tracking-tight"
              style={{ color: B.blue }}
            >
              {title}
            </h2>
            <div className="mt-1.5 text-sm leading-relaxed" style={{ color: B.muted }}>
              {message}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 transition disabled:opacity-40"
            style={{ color: B.muted }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-4"
          style={{ borderColor: B.border, background: "var(--admin-card)" }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{
              borderColor: B.border,
              color: B.danger,
              background: "var(--admin-secondary)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="danger-confirm-btn rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: B.danger }}
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

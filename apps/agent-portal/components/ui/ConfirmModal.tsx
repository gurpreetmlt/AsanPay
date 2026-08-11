"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { B } from "@/lib/brand";

export type ConfirmTone = "danger" | "warning" | "info";

interface ConfirmModalProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onClose: () => void;
}

const TONE_BTN: Record<ConfirmTone, string> = {
  danger: "#DC2626",
  warning: "#D97706",
  info: "#2A5CDD",
};

/** Animated confirm — portaled to body so page transforms do not trap fixed layout. */
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  busyLabel = "Working…",
  tone = "danger",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const btn = TONE_BTN[tone];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;

  const accentStyle = { "--confirm-accent": btn } as CSSProperties;

  return createPortal(
    <div
      className="confirm-modal-backdrop fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="confirm-modal-panel w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{
          ...accentStyle,
          borderColor: tone === "danger" ? "#FECACA" : B.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative flex items-start gap-3 px-5 pb-3 pt-5"
          style={{
            background:
              tone === "danger" ? "linear-gradient(180deg, #FEF2F2 0%, #FFFFFF 100%)" : B.secondary,
          }}
        >
          <div
            className="confirm-modal-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: tone === "danger" ? "#FEE2E2" : `${btn}22`,
            }}
          >
            <AlertTriangle size={26} strokeWidth={2.25} style={{ color: btn }} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="confirm-modal-title"
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
            data-tooltip="Close"
            disabled={busy}
            onClick={onClose}
            className="icon-tooltip rounded-lg p-1.5 transition disabled:opacity-40"
            style={{ color: B.muted }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-4"
          style={{ borderColor: B.border }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{
              borderColor: B.border,
              color: tone === "danger" ? "#B91C1C" : B.blue,
              background: B.secondary,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="confirm-modal-action-btn rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ ...accentStyle, background: btn }}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

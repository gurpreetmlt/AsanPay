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

const TONE_ICON: Record<ConfirmTone, string> = {
  danger: "#DC2626",
  warning: "#D97706",
  info: "#2A5CDD",
};

/**
 * Animated confirm popup — replaces window.confirm on admin web.
 * Portaled to document.body so AdminShell page-transform does not trap `position: fixed`.
 */
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
  const icon = TONE_ICON[tone];
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
      className="danger-confirm-backdrop fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="danger-confirm-panel w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          ...accentStyle,
          borderColor: tone === "danger" ? "var(--danger-confirm-border)" : B.border,
          background: "var(--admin-card)",
          color: "var(--admin-text)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative flex items-start gap-3 px-5 pb-3 pt-5"
          style={{
            background:
              tone === "danger" ? "var(--danger-confirm-header-bg)" : "var(--admin-secondary)",
          }}
        >
          <div
            className="danger-confirm-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={tone !== "danger" ? { background: `${icon}22` } : undefined}
          >
            <AlertTriangle size={26} strokeWidth={2.25} style={{ color: icon }} />
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
          style={{ borderColor: B.border, background: "var(--admin-card)" }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{
              borderColor: B.border,
              color: tone === "danger" ? B.danger : B.blue,
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

/** @deprecated Prefer ConfirmModal — same UI */
export function DangerConfirmModal(props: ConfirmModalProps) {
  return <ConfirmModal tone="danger" {...props} />;
}

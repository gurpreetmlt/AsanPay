"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { B } from "@/lib/brand";
import type { ConfirmTone } from "./ConfirmModal";

interface PromptModalProps {
  title: string;
  message?: ReactNode;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  tone?: ConfirmTone;
  multiline?: boolean;
  minLength?: number;
  initialValue?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

const TONE_BTN: Record<ConfirmTone, string> = {
  danger: "#DC2626",
  warning: "#D97706",
  info: "#2A5CDD",
};

/** Animated text prompt — replaces window.prompt on agent web. */
export function PromptModal({
  title,
  message,
  label,
  placeholder = "",
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  busy = false,
  busyLabel = "Working…",
  tone = "info",
  multiline = false,
  minLength = 0,
  initialValue = "",
  onConfirm,
  onClose,
}: PromptModalProps) {
  const btn = TONE_BTN[tone];
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function submit() {
    const trimmed = value.trim();
    if (minLength > 0 && trimmed.length < minLength) {
      setError(`Enter at least ${minLength} characters`);
      return;
    }
    setError(null);
    onConfirm(trimmed);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.25s ease-out",
      }}
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-modal-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{
          borderColor: tone === "danger" ? "#FECACA" : B.border,
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.92) translateY(12px)",
          transition: "opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
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
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: tone === "danger" ? "#FEE2E2" : `${btn}22`,
              animation: visible ? "confirm-icon-pop 0.4s ease-out 0.15s both" : "none",
            }}
          >
            <AlertTriangle size={26} strokeWidth={2.25} style={{ color: btn }} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="prompt-modal-title"
              className="text-lg font-bold tracking-tight"
              style={{ color: B.blue }}
            >
              {title}
            </h2>
            {message ? (
              <div className="mt-1.5 text-sm leading-relaxed" style={{ color: B.muted }}>
                {message}
              </div>
            ) : null}
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

        <div className="space-y-2 px-5 py-4">
          {label ? (
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
              {label}
            </label>
          ) : null}
          {multiline ? (
            <textarea
              autoFocus
              rows={4}
              value={value}
              disabled={busy}
              placeholder={placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: error ? "#FCA5A5" : B.border, background: B.bg, color: B.blue }}
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={value}
              disabled={busy}
              placeholder={placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: error ? "#FCA5A5" : B.border, background: B.bg, color: B.blue }}
            />
          )}
          {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: B.border }}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-50"
            style={{ borderColor: B.border, color: B.blue, background: B.secondary }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
            style={{ background: btn }}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes confirm-icon-pop {
          0% { transform: scale(0.5) rotate(-8deg); opacity: 0; }
          50% { transform: scale(1.15) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

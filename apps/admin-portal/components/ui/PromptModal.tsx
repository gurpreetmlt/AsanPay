"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
  /** multiline textarea when true */
  multiline?: boolean;
  minLength?: number;
  initialValue?: string;
  /** Quick reasons shown as chips; the text box becomes an optional note appended as "Reason — note". "Other" requires a note. */
  presets?: string[];
  onConfirm: (value: string) => void;
  onClose: () => void;
}

const TONE_BTN: Record<ConfirmTone, string> = {
  danger: "#DC2626",
  warning: "#D97706",
  info: "#2A5CDD",
};

/**
 * Animated text prompt — replaces window.prompt on admin web.
 * Portaled to document.body (same as ConfirmModal).
 */
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
  presets,
  onConfirm,
  onClose,
}: PromptModalProps) {
  const btn = TONE_BTN[tone];
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [preset, setPreset] = useState(presets?.[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const hasPresets = !!presets && presets.length > 0;
  const noteRequired = hasPresets && preset === "Other";

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function submit() {
    if (hasPresets) {
      const note = value.trim();
      if (noteRequired && note.length < 3) {
        setError("Write a note — at least 3 characters — when the reason is Other");
        return;
      }
      setError(null);
      onConfirm(noteRequired ? note : note ? `${preset} — ${note}` : preset);
      return;
    }
    const trimmed = value.trim();
    if (minLength > 0 && trimmed.length < minLength) {
      setError(`Enter at least ${minLength} characters`);
      return;
    }
    if (!trimmed && minLength > 0) {
      setError("This field is required");
      return;
    }
    setError(null);
    onConfirm(trimmed);
  }

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-modal-title"
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
            style={tone !== "danger" ? { background: `${btn}22` } : undefined}
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
            data-tooltip="Close"
            disabled={busy}
            onClick={onClose}
            className="icon-tooltip rounded-lg p-1.5 transition disabled:opacity-40"
            style={{ color: B.muted }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {hasPresets ? (
            <>
              <span className="block text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                Reason
              </span>
              <div className="flex flex-wrap gap-2 pb-1">
                {presets!.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busy}
                    data-active={preset === p}
                    onClick={() => {
                      setPreset(p);
                      setError(null);
                    }}
                    className="tab-chip rounded-full border px-3 py-1.5 text-xs font-semibold"
                    style={
                      preset === p
                        ? { background: btn, borderColor: btn, color: "#fff" }
                        : { borderColor: B.border, color: B.blue, background: "var(--admin-bg)" }
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {label || hasPresets ? (
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
              {hasPresets ? (noteRequired ? "Note (required)" : "Note (optional)") : label}
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
              style={{
                borderColor: error ? "#FCA5A5" : B.border,
                background: "var(--admin-bg)",
                color: "var(--admin-text)",
              }}
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
              style={{
                borderColor: error ? "#FCA5A5" : B.border,
                background: "var(--admin-bg)",
                color: "var(--admin-text)",
              }}
            />
          )}
          {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
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
            onClick={submit}
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

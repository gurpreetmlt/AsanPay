"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { B } from "@/lib/brand";

export type ModalIconTone = "blue" | "green" | "red" | "amber";

const ICON_TONE: Record<ModalIconTone, { bg: string; fg: string }> = {
  blue: { bg: B.secondary, fg: B.blueLight },
  green: { bg: "#E7F8EF", fg: B.greenDark },
  red: { bg: "#FEF2F2", fg: "#DC2626" },
  amber: { bg: "#FFF7ED", fg: "#D97706" },
};

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pulsing icon tile left of the title (see popup-design rule). */
  icon?: ReactNode;
  iconTone?: ModalIconTone;
  /** Small uppercase line above the title, e.g. "Step 2 of 2". */
  eyebrow?: string;
  subtitle?: string;
  /** 720px panel for two-column content (stacks below sm). */
  wide?: boolean;
  closeDisabled?: boolean;
}

/** Standard AsanPay popup shell — portaled so page transforms don't trap `fixed`. */
export function Modal({
  title,
  onClose,
  children,
  icon,
  iconTone = "blue",
  eyebrow,
  subtitle,
  wide = false,
  closeDisabled = false,
}: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !closeDisabled) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, closeDisabled]);

  const tone = ICON_TONE[iconTone];
  const modal = (
    <div className="confirm-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`confirm-modal-panel max-h-[92vh] w-full ${wide ? "max-w-[720px]" : "max-w-[440px]"} overflow-y-auto rounded-[20px] bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="flex min-w-0 items-start gap-4">
            {icon ? (
              <div
                className="confirm-modal-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: tone.bg, color: tone.fg, "--confirm-accent": tone.fg } as CSSProperties}
              >
                {icon}
              </div>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? (
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: B.blueLight }}>
                  {eyebrow}
                </p>
              ) : null}
              <h2 className="text-xl font-semibold leading-tight" style={{ color: B.blue }}>
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-xs" style={{ color: B.muted }}>
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="popup-close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6 pt-5">{children}</div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
}

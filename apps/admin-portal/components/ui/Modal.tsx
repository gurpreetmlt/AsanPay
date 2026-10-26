"use client";

import { X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { B } from "@/lib/brand";

export type ModalIconTone = "blue" | "green" | "red" | "amber";

const ICON_TONE: Record<ModalIconTone, { bg: string; fg: string }> = {
  blue: { bg: "rgba(42,92,221,0.12)", fg: B.blueLight },
  green: { bg: "rgba(18,183,106,0.14)", fg: B.greenDark },
  red: { bg: "rgba(220,38,38,0.12)", fg: B.danger },
  amber: { bg: "rgba(217,119,6,0.14)", fg: "#D97706" },
};

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pulsing icon tile left of the title (see popup-design rule). */
  icon?: ReactNode;
  iconTone?: ModalIconTone;
  eyebrow?: string;
  subtitle?: string;
  wide?: boolean;
}

/** Standard popup shell. Portaled so AdminShell page-transform does not trap position:fixed. */
export function Modal({ title, onClose, children, icon, iconTone = "blue", eyebrow, subtitle, wide = false }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted) return null;
  const tone = ICON_TONE[iconTone];

  return createPortal(
    <div
      className="danger-confirm-backdrop fixed inset-0 z-[200] flex items-center justify-center px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`danger-confirm-panel max-h-[92vh] w-full ${wide ? "max-w-[720px]" : "max-w-[440px]"} overflow-y-auto rounded-[20px] shadow-2xl`}
        style={{ background: B.card }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="flex min-w-0 items-start gap-4">
            {icon ? (
              <div
                className="modal-icon-pulse flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition hover:opacity-80"
            style={{ borderColor: B.border, color: B.blue }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6 pt-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

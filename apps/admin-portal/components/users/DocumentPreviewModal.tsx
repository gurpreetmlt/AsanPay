"use client";

import { useEffect } from "react";
import { X, ZoomIn } from "lucide-react";
import { B } from "@/lib/brand";

export function DocumentPreviewModal({
  open,
  title,
  url,
  onClose,
}: {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !url) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border shadow-2xl"
        style={{ borderColor: B.border, background: B.card }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-3.5"
          style={{ borderColor: B.border }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <ZoomIn className="h-4 w-4 shrink-0" style={{ color: B.blueLight }} />
            <h3 className="truncate font-semibold" style={{ color: B.blue }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 transition hover:bg-[var(--admin-secondary)]"
            style={{ color: B.muted }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className="flex max-h-[80vh] items-center justify-center overflow-auto p-4 md:p-6"
          style={{ background: B.bg }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URI / remote KYC previews */}
          <img
            src={url}
            alt={title}
            className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}

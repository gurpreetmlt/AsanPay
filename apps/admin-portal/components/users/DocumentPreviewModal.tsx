"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { B } from "@/lib/brand";

export type DocPreviewSlide = {
  title: string;
  url: string;
};

export function DocumentPreviewModal({
  open,
  title,
  url,
  slides,
  initialIndex = 0,
  onClose,
}: {
  open: boolean;
  /** Single-doc fallback (when `slides` omitted). */
  title?: string;
  url?: string;
  /** Multi-doc slider — preferred for KYC queue / agent detail. */
  slides?: DocPreviewSlide[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);

  const list: DocPreviewSlide[] =
    slides && slides.length > 0
      ? slides
      : url
        ? [{ title: title || "Document", url }]
        : [];

  const n = list.length;
  const current = n > 0 ? list[Math.min(index, n - 1)] : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setIndex(Math.max(0, Math.min(initialIndex, Math.max(0, n - 1))));
  }, [open, initialIndex, n]);

  const goPrev = useCallback(() => {
    if (n <= 1) return;
    setIndex((i) => (i - 1 + n) % n);
  }, [n]);

  const goNext = useCallback(() => {
    if (n <= 1) return;
    setIndex((i) => (i + 1) % n);
  }, [n]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, goPrev, goNext]);

  if (!mounted || !open || !current) return null;

  const heading =
    n > 1 ? `${current.title} (${index + 1}/${n})` : current.title;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div
        className="danger-confirm-panel relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border shadow-2xl"
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
              {heading}
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
          className="relative flex max-h-[80vh] items-center justify-center overflow-auto p-4 md:p-6"
          style={{ background: B.bg }}
        >
          {n > 1 ? (
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-md transition hover:scale-105"
              style={{ borderColor: B.border, color: B.blue }}
              aria-label="Previous document"
            >
              <ChevronLeft size={22} />
            </button>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element -- data-URI / remote KYC previews */}
          <img
            key={current.url}
            src={current.url}
            alt={current.title}
            className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
          />

          {n > 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-md transition hover:scale-105"
              style={{ borderColor: B.border, color: B.blue }}
              aria-label="Next document"
            >
              <ChevronRight size={22} />
            </button>
          ) : null}
        </div>

        {n > 1 ? (
          <div
            className="flex flex-wrap items-center justify-center gap-2 border-t px-4 py-3"
            style={{ borderColor: B.border }}
          >
            {list.map((s, i) => (
              <button
                key={`${s.url}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold transition"
                style={{
                  background: i === index ? B.blue : B.secondary,
                  color: i === index ? "#fff" : B.muted,
                }}
                aria-label={`Show ${s.title}`}
                aria-current={i === index}
              >
                {s.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B, brand } from "@/lib/brand";
import { resolvePromoImageSrc } from "@/lib/promoImage";

export type PromoPlacement = "dashboard" | "login";

export type PromoSlideView = {
  id: string;
  imageUrl: string;
  title: string;
  linkUrl: string;
  placement: PromoPlacement;
};

type Props = {
  placement: PromoPlacement;
  /** Auto-advance interval ms; 0 = off */
  intervalMs?: number;
  className?: string;
  /** Fill parent height (dashboard sidebar). */
  fill?: boolean;
};

/**
 * Reusable promo image slider.
 * - placement="dashboard" → agent dashboard ad column
 * - placement="login" → wire on login screens later (same API)
 */
export function PromoSlider({
  placement,
  intervalMs = 5000,
  className = "",
  fill = false,
}: Props) {
  const [allSlides, setAllSlides] = useState<PromoSlideView[]>([]);
  const [brokenIds, setBrokenIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchApi<PromoSlideView[]>("/promos", { placement });
        if (alive) setAllSlides(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setAllSlides([]);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [placement]);

  // A slide whose file is gone (e.g. uploaded before a redeploy) must not blank the panel.
  const slides = allSlides.filter((s) => !brokenIds.includes(s.id));

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1 || intervalMs <= 0) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [slides.length, intervalMs]);

  const slide = slides[index];

  if (!loaded) {
    return (
      <div
        className={`animate-pulse rounded-2xl bg-slate-200 ${fill ? "h-full min-h-[320px]" : "min-h-[280px]"} ${className}`}
      />
    );
  }

  if (!slide) {
    return (
      <div
        className={`relative flex flex-col overflow-hidden rounded-2xl p-5 text-white shadow-md ${fill ? "h-full min-h-[320px]" : "min-h-[280px]"} ${className}`}
        style={{ background: B.badgeGrad }}
      >
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/80">
          <Megaphone size={14} />
          Promotions
        </div>
        <h3 className="text-xl font-bold leading-snug sm:text-2xl">{brand.name} offers</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/85">
          Add slides in Admin → Platform Control → Promotions.
        </p>
        <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/35 bg-white/10 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-white/90">Ad slot</p>
          <p className="mt-1 text-xs text-white/70">No active slides yet</p>
        </div>
      </div>
    );
  }

  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvePromoImageSrc(slide.imageUrl)}
        alt={slide.title || "Promotion"}
        className="h-full w-full object-cover"
        onError={() => setBrokenIds((prev) => (prev.includes(slide.id) ? prev : [...prev, slide.id]))}
      />
      {(slide.title || slides.length > 1) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10">
          {slide.title ? <p className="text-sm font-bold text-white">{slide.title}</p> : null}
          {slides.length > 1 ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIndex(i);
                    }}
                    className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Previous slide"
                  className="rounded-full bg-white/20 p-1 text-white backdrop-blur hover:bg-white/30"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIndex((i) => (i - 1 + slides.length) % slides.length);
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Next slide"
                  className="rounded-full bg-white/20 p-1 text-white backdrop-blur hover:bg-white/30"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIndex((i) => (i + 1) % slides.length);
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  const shellClass = `relative overflow-hidden rounded-2xl shadow-md ${fill ? "h-full min-h-[320px]" : "aspect-[3/4] min-h-[280px]"} ${className}`;

  if (slide.linkUrl) {
    return (
      <a href={slide.linkUrl} target="_blank" rel="noopener noreferrer" className={`block ${shellClass}`}>
        {body}
      </a>
    );
  }

  return <div className={shellClass}>{body}</div>;
}

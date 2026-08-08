"use client";

import { useCallback, useEffect, useState } from "react";
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
  const n = slides.length;

  useEffect(() => {
    setIndex(0);
  }, [n]);

  const goTo = useCallback(
    (next: number) => {
      if (n === 0) return;
      setIndex(((next % n) + n) % n);
    },
    [n],
  );

  const goPrev = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setIndex((i) => (n === 0 ? 0 : (i - 1 + n) % n));
    },
    [n],
  );

  const goNext = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setIndex((i) => (n === 0 ? 0 : (i + 1) % n));
    },
    [n],
  );

  useEffect(() => {
    if (n <= 1 || intervalMs <= 0) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % n);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [n, intervalMs]);

  const slide = slides[index];
  const shellClass = `relative overflow-hidden ${fill ? "h-full min-h-[320px]" : "aspect-[3/4] min-h-[280px] rounded-2xl shadow-md"} ${className}`;

  if (!loaded) {
    return (
      <div
        className={`animate-pulse bg-slate-200 ${fill ? "h-full min-h-[320px]" : "min-h-[280px] rounded-2xl"} ${className}`}
      />
    );
  }

  if (!slide) {
    return (
      <div
        className={`relative flex flex-col overflow-hidden p-8 text-white ${fill ? "h-full min-h-[320px]" : "min-h-[280px] rounded-2xl shadow-md"} ${className}`}
        style={{ background: B.badgeGrad }}
      >
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/80">
          <Megaphone size={14} />
          Promotions
        </div>
        <h3 className="text-2xl font-bold leading-snug sm:text-3xl">{brand.tagline}</h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85">
          Offers and campaigns appear here. Add slides in Admin → Platform Control → Promotions
          (placement: Login).
        </p>
        <div className="mt-auto flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/35 bg-white/10 px-4 py-16 text-center">
          <p className="text-sm font-semibold text-white/90">Login promo slider</p>
          <p className="mt-1 text-xs text-white/70">No active slides yet</p>
        </div>
      </div>
    );
  }

  const controls =
    n > 1 ? (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10">
        {slide.title ? <p className="text-sm font-bold text-white">{slide.title}</p> : null}
        <div className="pointer-events-auto mt-2 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goTo(i);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous slide"
              className="rounded-full bg-white/20 p-1 text-white backdrop-blur transition hover:bg-white/30"
              onClick={goPrev}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              className="rounded-full bg-white/20 p-1 text-white backdrop-blur transition hover:bg-white/30"
              onClick={goNext}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    ) : slide.title ? (
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10">
        <p className="text-sm font-bold text-white">{slide.title}</p>
      </div>
    ) : null;

  // translateX % is relative to the track width (all slides). One viewport = 100/n of track.
  const trackShiftPct = n > 0 ? (index * 100) / n : 0;

  return (
    <div className={shellClass}>
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="flex h-full will-change-transform transition-transform duration-500 ease-out"
          style={{
            width: `${n * 100}%`,
            transform: `translate3d(-${trackShiftPct}%, 0, 0)`,
          }}
        >
          {slides.map((s) => {
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvePromoImageSrc(s.imageUrl)}
                alt={s.title || "Promotion"}
                className="h-full w-full object-cover"
                draggable={false}
                onError={() =>
                  setBrokenIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]))
                }
              />
            );
            return (
              <div
                key={s.id}
                className="h-full shrink-0 grow-0"
                style={{ width: `${100 / n}%` }}
              >
                {s.linkUrl ? (
                  <a
                    href={s.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full w-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {img}
                  </a>
                ) : (
                  img
                )}
              </div>
            );
          })}
        </div>
      </div>
      {controls}
    </div>
  );
}

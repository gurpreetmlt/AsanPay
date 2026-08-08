"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
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
  /** Fill parent height (dashboard sidebar / login). */
  fill?: boolean;
};

/**
 * Promo image slider — dashboard sidebar + login screen.
 * Slides move with a smooth horizontal transition; auto-advances when 2+.
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
  const [paused, setPaused] = useState(false);

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

  const slides = allSlides.filter((s) => !brokenIds.includes(s.id));
  const n = slides.length;

  useEffect(() => {
    setIndex((i) => (n === 0 ? 0 : Math.min(i, n - 1)));
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
    if (n <= 1 || intervalMs <= 0 || paused) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % n);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [n, intervalMs, paused, index]);

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
        className={`${fill ? "h-full min-h-[320px]" : "min-h-[280px] rounded-2xl"} ${className}`}
        style={{ background: B.badgeGrad }}
        aria-hidden
      />
    );
  }

  const showTitle = placement !== "login" && Boolean(slide.title);

  const controls =
    n > 1 ? (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 to-transparent px-4 pb-4 pt-10">
        {showTitle ? <p className="text-sm font-bold text-white">{slide.title}</p> : null}
        <div className={`pointer-events-auto flex items-center justify-between gap-2 ${showTitle ? "mt-2" : ""}`}>
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
              className="rounded-full bg-white/20 p-1.5 text-white backdrop-blur transition hover:bg-white/30"
              onClick={goPrev}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              className="rounded-full bg-white/20 p-1.5 text-white backdrop-blur transition hover:bg-white/30"
              onClick={goNext}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    ) : showTitle ? (
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 to-transparent px-4 pb-4 pt-10">
        <p className="text-sm font-bold text-white">{slide.title}</p>
      </div>
    ) : null;

  return (
    <div
      className={shellClass}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute inset-0 overflow-hidden">
        {/* Track width = viewport; each slide min-w-full; translate by index * 100% of track */}
        <div
          className="flex h-full w-full ease-in-out"
          style={{
            transform: `translate3d(-${index * 100}%, 0, 0)`,
            transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "transform",
          }}
        >
          {slides.map((s) => {
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvePromoImageSrc(s.imageUrl)}
                alt={s.title || "Promotion"}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
                onError={() =>
                  setBrokenIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]))
                }
              />
            );
            return (
              <div key={s.id} className="relative h-full w-full min-w-full shrink-0 grow-0 basis-full">
                {s.linkUrl ? (
                  <a
                    href={s.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 block"
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

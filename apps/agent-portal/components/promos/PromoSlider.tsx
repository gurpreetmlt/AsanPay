"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };

/**
 * Promo image slider — dashboard sidebar + login screen.
 * Crossfade animation (reliable); auto-advances when 2+ slides.
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
        // Public endpoint — plain fetch (avoid auth 401 → logout side effects).
        const res = await fetch(`/api/proxy/promos?placement=${encodeURIComponent(placement)}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = (await res.json()) as ApiEnvelope<PromoSlideView[]>;
        if (!alive) return;
        if (res.ok && json?.success && Array.isArray(json.data)) {
          setAllSlides(json.data);
        } else {
          setAllSlides([]);
        }
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
      <div className="absolute inset-0 overflow-hidden bg-[#0B2A9A]">
        {slides.map((s, i) => {
          const active = i === index;
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
              className="absolute inset-0 transition-opacity duration-700 ease-in-out"
              style={{
                opacity: active ? 1 : 0,
                zIndex: active ? 1 : 0,
                pointerEvents: active ? "auto" : "none",
              }}
              aria-hidden={!active}
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
      {controls}
    </div>
  );
}

"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Landmark } from "lucide-react";
import clsx from "clsx";

const SLIDES = [
  {
    key: "vyapar-loan",
    eyebrow: "Vyapar Loan",
    headline: "Business Badhayein Superfast",
    detail: "Loan up to ₹5 Lakh @ 1.2% P.M.",
    footnote: "Aap aur Aapke Vyapari Grahakon ke liye",
    cta: "Apply Your Loan Now",
  },
  {
    key: "vip",
    eyebrow: "Become VIP",
    headline: "Earn 2X on Every Transaction",
    detail: "Unlock higher commission slabs",
    footnote: "Limited period offer for top retailers",
    cta: "Upgrade to VIP",
  },
  {
    key: "credit-card",
    eyebrow: "ZET Credit Card",
    headline: "Apna Business Credit Card",
    detail: "Instant approval, no paperwork",
    footnote: "Powered by AsanPay Financial Services",
    cta: "Apply Credit Card Now",
  },
];

export function PromoBanner() {
  const [active, setActive] = useState(0);
  const slide = SLIDES[active] ?? SLIDES[0]!;

  return (
    <aside className="flex w-72 shrink-0 flex-col justify-between rounded-2xl bg-gradient-to-b from-brand-600 to-accent-700 p-6 text-white">
      <div>
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
          <Landmark size={16} />
          {slide.eyebrow}
        </div>
        <h3 className="text-2xl font-extrabold leading-tight">{slide.headline}</h3>
        <p className="mt-2 text-sm font-medium text-white/90">{slide.detail}</p>
        <p className="mt-6 text-xs text-white/70">{slide.footnote}</p>
      </div>

      <div className="space-y-4">
        <button
          onClick={() => toast(`${slide.cta} — coming soon`, { icon: "🚧" })}
          className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-white/90"
        >
          {slide.cta}
        </button>

        <div className="flex justify-center gap-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setActive(i)}
              aria-label={`Show slide ${i + 1}`}
              className={clsx("h-1.5 rounded-full transition-all", i === active ? "w-6 bg-white" : "w-1.5 bg-white/40")}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

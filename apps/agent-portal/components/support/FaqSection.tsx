"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { B } from "@/lib/brand";
import { FAQ_ITEMS } from "@/lib/helpContent";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="rounded-2xl border bg-white p-4 md:p-5" style={{ borderColor: B.border }}>
      <div className="mb-3 flex items-center gap-2">
        <HelpCircle size={16} style={{ color: B.blueLight }} />
        <h3 className="text-sm font-bold" style={{ color: B.blue }}>
          Frequently asked questions
        </h3>
      </div>
      <div className="space-y-2">
        {FAQ_ITEMS.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={i} className="rounded-xl border" style={{ borderColor: B.border }}>
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="text-sm font-medium" style={{ color: B.blue }}>
                  {item.question}
                </span>
                <ChevronDown
                  size={16}
                  className="shrink-0 transition-transform"
                  style={{ color: B.muted, transform: open ? "rotate(180deg)" : undefined }}
                />
              </button>
              {open && (
                <p className="px-3 pb-3 text-sm leading-relaxed" style={{ color: B.blueMid }}>
                  {item.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutTemplate } from "lucide-react";
import { B } from "@/lib/brand";

export type UpiUiLayout = "new" | "classic";

const OPTIONS: { id: UpiUiLayout; label: string; hint: string }[] = [
  { id: "new", label: "New layout", hint: "Form + transaction history" },
  { id: "classic", label: "Classic layout", hint: "Large amount pad + notes sidebar" },
];

const STORAGE_KEY = "asanpay.upiCashPoint.uiLayout";

export function readUpiUiLayout(): UpiUiLayout {
  if (typeof window === "undefined") return "new";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "classic" ? "classic" : "new";
}

export function writeUpiUiLayout(next: UpiUiLayout) {
  window.localStorage.setItem(STORAGE_KEY, next);
}

export function UpiLayoutPicker({ value, onChange }: { value: UpiUiLayout; onChange: (next: UpiUiLayout) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0]!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-gray-50"
        style={{ borderColor: B.border, color: B.blue }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <LayoutTemplate size={15} />
        {current.label}
        <ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border bg-white py-1 shadow-lg"
          style={{ borderColor: B.border }}
        >
          {OPTIONS.map((opt) => {
            const active = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.id);
                  writeUpiUiLayout(opt.id);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer flex-col gap-0.5 px-3.5 py-2.5 text-left transition hover:bg-[#EEF2FF]"
                style={active ? { background: `${B.blue}0C` } : undefined}
              >
                <span className="text-sm font-bold" style={{ color: active ? B.blue : "#111827" }}>
                  {opt.label}
                </span>
                <span className="text-[11px] font-medium text-gray-500">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

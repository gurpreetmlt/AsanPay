"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutTemplate } from "lucide-react";
import { B } from "@/lib/brand";

export type DmtUiLayout = "1" | "2";

const OPTIONS: { id: DmtUiLayout; label: string; hint: string }[] = [
  { id: "1", label: "Layout 1", hint: "Current DMT flow" },
  { id: "2", label: "Layout 2", hint: "Send money + transaction history" },
];

const STORAGE_KEY = "asanpay.dmt.uiLayout";

export function readDmtUiLayout(): DmtUiLayout {
  if (typeof window === "undefined") return "1";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "1" || v === "2") return v;
  return "1";
}

export function writeDmtUiLayout(next: DmtUiLayout) {
  window.localStorage.setItem(STORAGE_KEY, next);
}

type Props = {
  value: DmtUiLayout;
  onChange: (next: DmtUiLayout) => void;
};

export function DmtLayoutPicker({ value, onChange }: Props) {
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
        className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-gray-50"
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
          className="absolute right-0 z-40 mt-1.5 w-64 overflow-hidden rounded-xl border bg-white py-1 shadow-lg"
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
                  writeDmtUiLayout(opt.id);
                  setOpen(false);
                }}
                className="flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition hover:bg-[#EEF2FF]"
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

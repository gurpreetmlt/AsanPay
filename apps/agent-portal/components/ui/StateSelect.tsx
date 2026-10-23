"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { findIndianState, searchIndianStates } from "@asanpay/shared-types";
import { B } from "@/lib/brand";

interface StateSelectProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
}

export function StateSelect({ label, value, onChange, required }: StateSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requiredRef = useRef<HTMLInputElement>(null);

  const selected = findIndianState(value);
  const results = useMemo(() => searchIndianStates(query), [query]);

  useEffect(() => {
    requiredRef.current?.setCustomValidity(selected ? "" : `Select ${label.toLowerCase()}`);
  }, [selected, label]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative block">
      <span className="mb-1 block text-xs font-medium" style={{ color: B.muted }}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm outline-none focus:ring-2 focus:ring-[var(--focus)]"
        style={{ borderColor: B.border, color: selected ? B.blue : B.muted, background: "#fff" }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected ? selected.name : "Select state"}</span>
        <ChevronDown size={14} style={{ color: B.muted }} />
      </button>
      {/* Native required check — the visible control is a button. */}
      {required ? (
        <input
          ref={requiredRef}
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
        />
      ) : null}
      {open ? (
        <div
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border shadow-lg"
          style={{ borderColor: B.border, background: "#fff" }}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: B.border }}>
            <Search size={14} style={{ color: B.muted }} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[0]) pick(results[0].code);
                }
              }}
              placeholder="Search state"
              className="w-full text-sm outline-none"
              style={{ color: B.blue }}
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-xs" style={{ color: B.muted }}>
                No state matches “{query}”
              </li>
            ) : (
              results.map((s) => (
                <li key={s.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={s.code === value}
                    onClick={() => pick(s.code)}
                    className="flex w-full cursor-pointer items-center px-3 py-2 text-left text-sm hover:bg-slate-50"
                    style={{ color: B.blue, fontWeight: s.code === value ? 700 : 400 }}
                  >
                    {s.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

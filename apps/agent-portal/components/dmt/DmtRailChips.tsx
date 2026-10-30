"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Landmark } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

export type DmtRail = { code: string; name: string; shortName: string; live: boolean; priority: number };

/** Rails in admin priority order; first live rail is selected by default. */
export function useDmtRails() {
  const [rails, setRails] = useState<DmtRail[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchApi<DmtRail[]>("/txn/dmt/rails")
      .then((list) => {
        if (cancelled) return;
        const rows = list ?? [];
        setRails(rows);
        setSelected((cur) => cur || rows.find((r) => r.live)?.code || "");
      })
      .catch(() => {
        if (!cancelled) setRails([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rails, selected, setSelected };
}

/** Bank picker on the DMT screen. Coming-soon rails stay visible but cannot be picked. */
export function DmtRailChips({
  rails,
  selected,
  onSelect,
}: {
  rails: DmtRail[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  if (rails.length < 2) return null;
  return (
    <div className="mb-4 rounded-2xl border bg-white p-3" style={{ borderColor: B.border }}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
        <Landmark size={13} /> Transfer through
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="DMT bank">
        {rails.map((r) => {
          const active = r.code === selected;
          return (
            <button
              key={r.code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (!r.live) {
                  toast(`${r.name} is coming soon. Use another bank for now.`);
                  return;
                }
                onSelect(r.code);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition"
              style={
                active
                  ? { borderColor: B.blueLight, background: "rgba(42,92,221,0.08)", color: B.blue }
                  : { borderColor: B.border, color: r.live ? B.blue : B.muted, opacity: r.live ? 1 : 0.7 }
              }
            >
              {active ? <Check size={15} style={{ color: B.blueLight }} /> : null}
              {r.name}
              {!r.live ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Coming soon</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

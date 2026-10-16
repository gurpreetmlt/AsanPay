"use client";

import { useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { B } from "@/lib/brand";
import { formatInr } from "@/lib/walletLabels";

interface Props {
  /** Net commission credited today (after TDS). */
  net: string;
  gross?: string | null;
  tds?: string | null;
  loading?: boolean;
  onReport: () => void;
}

/** TCR09 — Today's Earnings row. Collapsed = net; tap the row to see Gross · TDS · Net. */
export function TodayEarningsChip({ net, gross, tds, loading, onReport }: Props) {
  const [open, setOpen] = useState(false);
  const grossValue = gross ?? net;
  const tdsValue = tds ?? "0";

  return (
    <div className="rounded-2xl border bg-white transition hover:shadow-sm" style={{ borderColor: B.border }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Show gross, TDS and net breakdown"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "#EEF2FF", color: B.blueLight }}
          >
            <BarChart3 size={18} />
          </span>
          <span className="min-w-0 flex-1 text-sm font-bold" style={{ color: B.blue }}>
            Today&apos;s Earnings:{" "}
            <span style={{ color: B.green }}>{loading ? "…" : formatInr(net)}</span>
          </span>
          <ChevronDown
            size={16}
            style={{ color: B.blueMid, transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}
          />
        </button>
        <button type="button" onClick={onReport} className="text-xs font-bold" style={{ color: B.blueMid }}>
          My Earnings →
        </button>
      </div>
      {open ? (
        <p className="border-t px-4 py-2.5 text-xs font-semibold" style={{ borderColor: B.border, color: B.muted }}>
          Gross {formatInr(grossValue)} · TDS {formatInr(tdsValue)} · Net {formatInr(net)}
        </p>
      ) : null}
    </div>
  );
}

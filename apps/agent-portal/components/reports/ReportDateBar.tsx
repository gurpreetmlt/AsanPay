"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "react-hot-toast";
import { CalendarDays } from "lucide-react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";
import { DATE_PRESETS, todayYmd } from "./reportUtils";

type Props = {
  /** Applied range (what the report currently shows). */
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  loading?: boolean;
  /** Extra actions (e.g. Download Excel) rendered next to View Report. */
  actions?: ReactNode;
};

export function ReportDateBar({ from, to, onApply, loading = false, actions }: Props) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

  function apply(f: string, t: string) {
    if (!f || !t) {
      toast.error("Select both From and To dates");
      return;
    }
    if (f > t) {
      toast.error("From date must be on or before the To date");
      return;
    }
    onApply(f, t);
  }

  const activePreset = DATE_PRESETS.find((p) => {
    const r = p.range();
    return r.from === draftFrom && r.to === draftTo;
  })?.id;

  const inputCls = "rounded-xl border bg-white px-3 py-2 text-sm font-semibold outline-none";

  return (
    <div
      className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: B.border }}
    >
      <label className="flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: B.muted }}>
        From
        <span className="relative">
          <CalendarDays
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: B.muted }}
          />
          <input
            type="date"
            value={draftFrom}
            max={draftTo || todayYmd()}
            onChange={(e) => setDraftFrom(e.target.value)}
            className={`${inputCls} pl-9`}
            style={{ borderColor: B.border, color: B.blue }}
          />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: B.muted }}>
        To
        <span className="relative">
          <CalendarDays
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: B.muted }}
          />
          <input
            type="date"
            value={draftTo}
            min={draftFrom}
            max={todayYmd()}
            onChange={(e) => setDraftTo(e.target.value)}
            className={`${inputCls} pl-9`}
            style={{ borderColor: B.border, color: B.blue }}
          />
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2 pb-0.5">
        {DATE_PRESETS.map((p) => {
          const on = activePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                const r = p.range();
                setDraftFrom(r.from);
                setDraftTo(r.to);
                apply(r.from, r.to);
              }}
              className="rounded-full border px-3.5 py-1.5 text-xs font-bold transition"
              style={{
                borderColor: on ? B.blueLight : B.border,
                background: on ? "#EEF2FF" : "#fff",
                color: on ? B.blue : B.muted,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {actions}
        <PrimaryButton
          type="button"
          variant="primary"
          size="sm"
          showArrow={false}
          className="!w-auto"
          loading={loading}
          onClick={() => apply(draftFrom, draftTo)}
        >
          View Report
        </PrimaryButton>
      </div>
    </div>
  );
}

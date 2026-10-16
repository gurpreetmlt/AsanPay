"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "react-hot-toast";
import { Search } from "lucide-react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { DateField, DatePresetLinks } from "@/components/ui/DateField";
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

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: B.border }}
    >
      <DateField
        label="From"
        value={draftFrom}
        rangePeer={draftTo}
        rangeRole="start"
        max={draftTo || todayYmd()}
        onChange={(v) => {
          setDraftFrom(v);
          if (draftTo && v > draftTo) setDraftTo(v);
        }}
      />
      <DateField
        label="To"
        value={draftTo}
        rangePeer={draftFrom}
        rangeRole="end"
        min={draftFrom}
        max={todayYmd()}
        onChange={(v) => {
          setDraftTo(v);
          if (draftFrom && v < draftFrom) setDraftFrom(v);
        }}
      />

      <DatePresetLinks
        activeId={activePreset}
        presets={DATE_PRESETS}
        onPick={(f, t) => {
          setDraftFrom(f);
          setDraftTo(t);
          apply(f, t);
        }}
      />

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
          <Search size={14} className="mr-1.5" />
          View Report
        </PrimaryButton>
      </div>
    </div>
  );
}

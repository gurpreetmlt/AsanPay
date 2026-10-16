import type { ReactNode } from "react";
import { B } from "@/lib/brand";

type Props = {
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
  icon: ReactNode;
  /** Accent color for the icon chip (brand token). */
  accent?: string;
  /** Soft tint behind the icon. */
  tint?: string;
};

export function MetricCard({ label, value, subtitle, icon, accent = B.blueLight, tint = "#EEF2FF" }: Props) {
  return (
    <div
      className="flex h-full min-h-[116px] flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: B.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: B.muted }}>
          {label}
        </p>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: tint, color: accent }}
        >
          {icon}
        </span>
      </div>
      <div>
        <p className="truncate text-2xl font-extrabold tabular-nums" style={{ color: B.blue }}>
          {value}
        </p>
        <p className="mt-0.5 min-h-[16px] text-xs font-semibold" style={{ color: B.muted }}>
          {subtitle ?? "\u00A0"}
        </p>
      </div>
    </div>
  );
}

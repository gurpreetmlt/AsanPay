import { B } from "@/lib/brand";
import { pct, type TaxView } from "./types";

export function gstModeLabel(t: Pick<TaxView, "gstOnFeeApplies" | "gstOnFeeInclusive">): string {
  if (!t.gstOnFeeApplies) return "—";
  return t.gstOnFeeInclusive ? "Included in fee" : "Added on top";
}

/** Read-only tax facts as small label / value tiles. */
export function TaxSummary({ tax, className = "" }: { tax: TaxView; className?: string }) {
  const tiles = [
    { label: "Agent TDS", value: tax.tdsApplies ? pct(tax.tdsPercent) : "Off" },
    { label: "GST on customer fee", value: tax.gstOnFeeApplies ? pct(tax.gstOnFeePercent) : "Off" },
    { label: "GST mode", value: gstModeLabel(tax) },
  ];
  return (
    <div className={`grid gap-2 sm:grid-cols-3 ${className}`}>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border px-3 py-2" style={{ borderColor: B.border, background: "var(--admin-card)" }}>
          <p className="text-[11px] font-semibold" style={{ color: B.muted }}>
            {t.label}
          </p>
          <p className="text-sm font-bold tabular-nums" style={{ color: B.blue }}>
            {t.value}
          </p>
        </div>
      ))}
    </div>
  );
}

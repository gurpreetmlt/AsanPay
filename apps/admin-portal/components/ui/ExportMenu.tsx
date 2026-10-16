"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "react-hot-toast";
import { B } from "@/lib/brand";
// Same Export control as agent-portal — PDF / Excel / CSV (see export-pdf-csv-excel rule).

type Props = {
  disabled?: boolean;
  /** Label on the trigger button. Default: Export */
  label?: string;
  onPdf: () => void;
  onExcel: () => void;
  onCsv: () => void;
  className?: string;
};

/**
 * Standard AsanPay export control — always offers PDF, Excel, and CSV.
 * Wire every report/register download through this (see `.cursor/rules/export-pdf-csv-excel.mdc`).
 */
export function ExportMenu({
  disabled = false,
  label = "Export",
  onPdf,
  onExcel,
  onCsv,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const item =
    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-[#EEF2FF]";

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            toast.error("Nothing to export for this selection");
            return;
          }
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ borderColor: B.border, color: B.blue }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={14} />
        {label}
        <ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border bg-white shadow-lg"
          style={{ borderColor: B.border }}
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            style={{ color: B.blue }}
            onClick={() => {
              setOpen(false);
              onPdf();
            }}
          >
            <FileText size={15} style={{ color: "#DC2626" }} />
            PDF
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            style={{ color: B.blue }}
            onClick={() => {
              setOpen(false);
              onExcel();
            }}
          >
            <FileSpreadsheet size={15} style={{ color: "#16A34A" }} />
            Excel
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            style={{ color: B.blue }}
            onClick={() => {
              setOpen(false);
              onCsv();
            }}
          >
            <FileSpreadsheet size={15} style={{ color: B.muted }} />
            CSV
          </button>
        </div>
      ) : null}
    </div>
  );
}

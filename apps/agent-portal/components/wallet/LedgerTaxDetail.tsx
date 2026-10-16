"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { B } from "@/lib/brand";
import { formatInr } from "@/lib/walletLabels";
import type { LedgerEntry } from "@/lib/types";

/** TCR10 — expandable Gross · TDS · Net for commission credits in passbook / statements. */
export function LedgerTaxDetail({ entry }: { entry: LedgerEntry }) {
  const [open, setOpen] = useState(false);
  const isCommission = entry.referenceType === "commission" && entry.entryType === "credit";
  if (!entry.tax && !isCommission) return null;
  const gross = entry.tax?.gross ?? entry.amount;
  const tds = entry.tax?.tds ?? "0";
  const net = entry.tax?.net ?? entry.amount;

  return (
    <div className="mt-1 font-normal normal-case">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11px] font-bold"
        style={{ color: B.blueMid }}
      >
        Tax details
        <ChevronDown
          size={12}
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}
        />
      </button>
      {open ? (
        <p className="mt-0.5 text-[11px] font-semibold" style={{ color: B.muted }}>
          Gross {formatInr(gross)} · TDS {formatInr(tds)} · Net {formatInr(net)}
        </p>
      ) : null}
    </div>
  );
}

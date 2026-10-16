"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface TdsSummary {
  month: string;
  totalGross: string;
  totalTds: string;
  totalNet: string;
  creditCount: number;
  hasPan: boolean;
}

/** TCR11 — shown when commission TDS applies this month and no PAN is on file. */
export function PanMissingBanner() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await fetchApi<TdsSummary>("/earnings/tds-summary");
        if (alive) setShow(!s.hasPan && (Number(s.totalTds) > 0 || s.creditCount > 0));
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/settings?tab=profile")}
      className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:opacity-90"
      style={{ borderColor: "#FDBA74", background: "#FFF7ED" }}
    >
      <AlertTriangle size={20} style={{ color: "#EA580C" }} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold" style={{ color: "#C2410C" }}>
          PAN missing
        </span>
        <span className="block text-xs" style={{ color: "#9A3412" }}>
          Add PAN under Profile / KYC so TDS can be reported correctly.
        </span>
      </span>
      <ChevronRight size={16} style={{ color: "#C2410C" }} />
    </button>
  );
}

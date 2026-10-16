"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

export type EarnEstimate = {
  matched: boolean;
  estimated: boolean;
  gross: string;
  tds: string;
  net: string;
};

export function useEarnEstimate(serviceCode: string | undefined, amount: string) {
  const [estimate, setEstimate] = useState<EarnEstimate | null>(null);

  useEffect(() => {
    const amt = amount.trim();
    if (!serviceCode || !/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0) {
      setEstimate(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const data = await fetchApi<EarnEstimate>("/earnings/estimate", {
            serviceCode,
            amount: amt,
          });
          if (alive) setEstimate(data);
        } catch {
          if (alive) setEstimate(null);
        }
      })();
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [serviceCode, amount]);

  return estimate;
}

export function formatEarnEstimateLine(est: EarnEstimate | null): string | null {
  if (!est?.matched || Number(est.net) <= 0) return null;
  return `Est. net ₹${est.net} · Gross ₹${est.gross} · TDS ₹${est.tds}`;
}

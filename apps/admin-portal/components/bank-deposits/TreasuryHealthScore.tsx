"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

interface HealthScore {
  score: number;
  band: "healthy" | "watch" | "attention";
  windowDays: number;
  match: { pct: number; matched: number; eligible: number; unmatched: number; needsReview: number };
  gap: { pct: number; bank: string | null; books: string | null; difference: string | null };
  freshness: {
    pct: number;
    activeBanks: number;
    banksWithStatement: number;
    oldestDays: number | null;
  };
  closePenalty: number;
  footnote: string | null;
}

const BAND: Record<
  HealthScore["band"],
  { label: string; color: string; bg: string; ring: string }
> = {
  healthy: { label: "Healthy", color: "#15803D", bg: "#F0FDF4", ring: "#86EFAC" },
  watch: { label: "Watch", color: "#B45309", bg: "#FFFBEB", ring: "#FCD34D" },
  attention: { label: "Attention", color: "#B91C1C", bg: "#FEF2F2", ring: "#FCA5A5" },
};

function inr(v: string | null) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return `₹${v}`;
  const abs = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `−₹${abs}` : `₹${abs}`;
}

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

export function TreasuryHealthScore() {
  const [data, setData] = useState<HealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchApi<HealthScore>("/banking/health-score"));
    } catch (err) {
      setError(errMessage(err, "Could not load treasury health score"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div
        className="rounded-2xl border px-4 py-3 text-sm"
        style={{ borderColor: B.border, color: B.muted }}
      >
        Loading treasury health…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm"
        style={{ borderColor: B.border, color: B.muted }}
      >
        <span>{error ?? "Health score unavailable"}</span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold"
          style={{ color: B.blue }}
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const band = BAND[data.band];
  const staleLabel =
    data.freshness.activeBanks === 0
      ? "No active banks"
      : data.freshness.banksWithStatement === 0
        ? "No statements"
        : data.freshness.oldestDays === null
          ? "Some banks missing statement"
          : data.freshness.oldestDays === 0
            ? "Statements up to date"
            : `Oldest statement ${data.freshness.oldestDays}d ago`;

  return (
    <section
      aria-label="Treasury health score"
      className="rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      style={{ borderColor: band.ring, background: band.bg }}
    >
      <div className="flex flex-wrap items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border bg-white"
            style={{ borderColor: band.ring }}
          >
            <span className="text-xl font-black tabular-nums" style={{ color: band.color }}>
              {data.score}
            </span>
            <span className="text-[9px] font-bold uppercase" style={{ color: B.muted }}>
              / 100
            </span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold" style={{ color: B.blue }}>
                Treasury health
              </p>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ color: band.color, background: "#fff" }}
              >
                <Activity size={11} /> {band.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
              Last {data.windowDays} days · Match 50% · Gap 25% · Freshness 25%
              {data.closePenalty ? ` · close −${data.closePenalty}` : ""}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <Pill
            label="Match"
            value={`${data.match.pct}%`}
            sub={`${data.match.matched}/${data.match.eligible} lines`}
          />
          <Pill
            label="Gap"
            value={data.gap.difference == null ? "—" : inr(data.gap.difference)}
            sub={`score ${data.gap.pct}%`}
          />
          <Pill label="Statements" value={`${data.freshness.pct}%`} sub={staleLabel} />
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-1 rounded-lg border bg-white px-2.5 text-xs font-bold"
          style={{ borderColor: B.border, color: B.blue }}
          title="Refresh score"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      {data.footnote ? (
        <p className="border-t px-4 py-2 text-[11px]" style={{ borderColor: band.ring, color: band.color }}>
          {data.footnote}
        </p>
      ) : null}
    </section>
  );
}

function Pill({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-[7.5rem] flex-1 rounded-xl border bg-white px-3 py-2" style={{ borderColor: B.border }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums" style={{ color: B.blue }}>
        {value}
      </p>
      <p className="truncate text-[11px]" style={{ color: B.muted }} title={sub}>
        {sub}
      </p>
    </div>
  );
}

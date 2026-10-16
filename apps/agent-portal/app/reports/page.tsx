"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { BarChart3, CalendarRange, Crown, Layers, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { MetricCard } from "@/components/reports/MetricCard";
import { ReportDateBar } from "@/components/reports/ReportDateBar";
import { ShareBar } from "@/components/reports/ShareBar";
import {
  buildShareSegments,
  dayCount,
  DATE_PRESETS,
  formatInr,
  formatPct,
  pctValue,
  shareColor,
  toNum,
} from "@/components/reports/reportUtils";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type ProductRow = {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  volume: string;
  netAmount: string;
  grossAmount: string;
  tdsAmount: string;
  creditCount: number;
};

type EarningsSummary = {
  totalNet: string;
  activeServices: number;
};

type Status = { label: string; color: string; bg: string };

function performanceStatus(rank: number, share: number, volume: number): Status {
  if (volume <= 0) return { label: "NO ACTIVITY", color: B.muted, bg: B.secondary };
  if (rank === 0) return { label: "PRIMARY DRIVER", color: B.green, bg: "#DCFCE7" };
  if (share >= 20) return { label: "STRONG", color: B.blueLight, bg: "#EEF2FF" };
  if (share >= 5) return { label: "STEADY", color: B.blue, bg: "#E8EEFB" };
  return { label: "EMERGING", color: "#B45309", bg: "#FEF3C7" };
}

export default function BusinessReportPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const initial = DATE_PRESETS.find((p) => p.id === "month")!.range();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [prod, sum] = await Promise.all([
          fetchApi<{ products: ProductRow[] }>("/earnings/by-product", { from, to }),
          fetchApi<EarningsSummary>("/earnings/summary", { from, to }).catch(() => null),
        ]);
        if (!alive) return;
        setProducts(prod.products);
        setSummary(sum);
      } catch (err) {
        toast.error(extractApiError(err, "Could not load business report"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, from, to]);

  const days = useMemo(() => dayCount(from, to), [from, to]);

  const rows = useMemo(
    () => [...products].sort((a, b) => toNum(b.volume) - toNum(a.volume)),
    [products],
  );

  const totalVolume = useMemo(() => rows.reduce((s, p) => s + toNum(p.volume), 0), [rows]);

  const segments = useMemo(
    () => buildShareSegments(rows.map((p) => ({ key: p.serviceId, label: p.serviceName, value: toNum(p.volume) }))),
    [rows],
  );

  const top = rows.length > 0 && toNum(rows[0].volume) > 0 ? rows[0] : null;
  const activeServices = rows.filter((p) => toNum(p.volume) > 0).length || (summary?.activeServices ?? 0);
  const showCards = !(loading && products.length === 0);
  const th = "px-4 py-3 text-[11px] font-extrabold uppercase tracking-wide";

  if (!hydrated || !accessToken) return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ background: "#EEF2FF", color: B.blueLight }}
          >
            <BarChart3 size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Business Report
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Business volume by product for the selected dates
            </p>
          </div>
        </div>

        <ReportDateBar
          from={from}
          to={to}
          loading={loading}
          onApply={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Business Volume"
            value={showCards ? formatInr(totalVolume) : "…"}
            subtitle={`${days} ${days === 1 ? "day" : "days"} in range`}
            icon={<Wallet size={18} />}
            accent={B.blueLight}
            tint="#EEF2FF"
          />
          <MetricCard
            label="Top Performing Service"
            value={showCards ? (top ? top.serviceName : "—") : "…"}
            subtitle={top ? `${formatPct(toNum(top.volume), totalVolume)} of total volume` : "No activity in range"}
            icon={<Crown size={18} />}
            accent="#D97706"
            tint="#FEF3C7"
          />
          <MetricCard
            label="Daily Average Volume"
            value={showCards ? formatInr(totalVolume / days) : "…"}
            subtitle={`Volume ÷ ${days} ${days === 1 ? "day" : "days"}`}
            icon={<CalendarRange size={18} />}
            accent={B.green}
            tint="#DCFCE7"
          />
          <MetricCard
            label="Active Services"
            value={showCards ? String(activeServices) : "…"}
            subtitle={
              summary ? `Net commission ${formatInr(summary.totalNet)}` : "Services with business in range"
            }
            icon={<Layers size={18} />}
            accent={B.blue}
            tint="#E8EEFB"
          />
        </div>

        <ShareBar
          title="Volume Share by Product"
          segments={segments}
          emptyText="No business volume in this date range"
        />

        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${B.border}` }}>
            <h2 className="text-sm font-extrabold" style={{ color: B.blue }}>
              Product-wise Business
            </h2>
          </div>

          {loading && products.length === 0 ? (
            <p className="px-5 py-8 text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-base font-extrabold" style={{ color: B.blue }}>
                No business in this range
              </p>
              <p className="mt-1 text-sm" style={{ color: B.muted }}>
                Successful transactions will show here, grouped by product.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr style={{ background: B.secondary, color: B.muted }}>
                    <th className={`${th} text-left`}>Product</th>
                    <th className={`${th} text-right`}>Business Volume</th>
                    <th className={`${th} text-right`}>Daily Average</th>
                    <th className={`${th} w-[200px] text-left`}>Contribution %</th>
                    <th className={`${th} text-left`}>Performance Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p, i) => {
                    const vol = toNum(p.volume);
                    const share = pctValue(vol, totalVolume);
                    const st = performanceStatus(i, share, vol);
                    return (
                      <tr key={p.serviceId} style={{ borderTop: `1px solid ${B.border}` }}>
                        <td className="px-4 py-3.5">
                          <span className="flex items-center gap-2.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: shareColor(i) }} />
                            <span className="font-bold" style={{ color: B.blue }}>
                              {p.serviceName}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-extrabold tabular-nums" style={{ color: B.blue }}>
                          {formatInr(vol)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums" style={{ color: B.muted }}>
                          {formatInr(vol / days)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="h-2 flex-1 overflow-hidden rounded-full"
                              style={{ background: B.secondary }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${share}%`, background: shareColor(i) }}
                              />
                            </div>
                            <span
                              className="w-12 text-right text-xs font-extrabold tabular-nums"
                              style={{ color: B.blue }}
                            >
                              {formatPct(vol, totalVolume)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className="inline-block rounded-full px-3 py-1 text-[10px] font-extrabold tracking-wide"
                            style={{ background: st.bg, color: st.color }}
                          >
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: B.secondary, borderTop: `1px solid ${B.border}` }}>
                    <td className="px-4 py-3.5 font-extrabold" style={{ color: B.blue }}>
                      Total
                    </td>
                    <td className="px-4 py-3.5 text-right font-extrabold tabular-nums" style={{ color: B.blue }}>
                      {formatInr(totalVolume)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-extrabold tabular-nums" style={{ color: B.muted }}>
                      {formatInr(totalVolume / days)}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-extrabold" style={{ color: B.blue }}>
                      {totalVolume > 0 ? "100.0%" : "0.0%"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

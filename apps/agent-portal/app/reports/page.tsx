"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import type { LedgerEntry, TxnRow } from "@/lib/types";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

const PIE_COLORS = [B.blueLight, B.green, "#D97706", "#0D9488", "#DB2777", B.blue];

function formatInr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function ReportsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
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
        const [t, l] = await Promise.all([
          fetchApi<TxnRow[]>("/txn", { limit: 100, offset: 0 }),
          fetchApi<LedgerEntry[]>("/wallet/ledger", { limit: 100, offset: 0 }),
        ]);
        if (!alive) return;
        setTxns(t);
        setLedger(l);
      } catch (err) {
        toast.error(extractApiError(err, "Failed to load reports"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const stats = useMemo(() => {
    const volume = txns.reduce((s, t) => s + (t.status === "failed" ? 0 : parseFloat(t.amount) || 0), 0);
    const success = txns.filter((t) => t.status === "success").length;
    const credits = ledger.filter((e) => e.entryType === "credit").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const debits = ledger.filter((e) => e.entryType === "debit").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const avg = txns.length ? volume / txns.length : 0;
    return { volume, success, credits, debits, avg, count: txns.length };
  }, [txns, ledger]);

  const byService = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txns) {
      map.set(t.serviceName, (map.get(t.serviceName) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [txns]);

  const byDay = useMemo(() => {
    const map = new Map<string, { day: string; volume: number; count: number }>();
    for (const t of txns) {
      const day = new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const cur = map.get(day) ?? { day, volume: 0, count: 0 };
      cur.count += 1;
      if (t.status !== "failed") cur.volume += parseFloat(t.amount) || 0;
      map.set(day, cur);
    }
    return Array.from(map.values()).reverse().slice(-14);
  }, [txns]);

  if (!hydrated || !accessToken) return null;

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Reports
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Aggregates from your transactions and wallet ledger
          </p>
        </div>

        {loading && txns.length === 0 && ledger.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Txn Volume", value: formatInr(stats.volume) },
                { label: "Txn Count", value: `${stats.count}` },
                { label: "Ledger Credits", value: formatInr(stats.credits) },
                { label: "Avg Txn Value", value: formatInr(stats.avg) },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
                    {s.label}
                  </div>
                  <div className="text-2xl font-bold" style={{ color: B.blue }}>
                    {s.value}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: B.muted }}>
                    Success: {stats.success} · Debits: {formatInr(stats.debits)}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
                <h2 className="mb-4 font-bold" style={{ color: B.blue }}>
                  Daily volume
                </h2>
                {byDay.length === 0 ? (
                  <p className="py-10 text-center text-sm" style={{ color: B.muted }}>
                    No txn data
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byDay} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: B.muted }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `₹${v / 1000}K`}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, fontSize: 12 }}
                        formatter={(v) => [formatInr(Number(v)), "Volume"]}
                      />
                      <Bar dataKey="volume" radius={[8, 8, 0, 0]} fill={B.blueLight} opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
                <h2 className="mb-4 font-bold" style={{ color: B.blue }}>
                  By service
                </h2>
                {byService.length === 0 ? (
                  <p className="py-10 text-center text-sm" style={{ color: B.muted }}>
                    No service breakdown
                  </p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={byService}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {byService.map((s, i) => (
                            <Cell key={s.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 space-y-2">
                      {byService.map((s, i) => (
                        <div key={s.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                            <span className="text-xs" style={{ color: B.muted }}>
                              {s.name}
                            </span>
                          </div>
                          <span className="text-xs font-bold" style={{ color: B.blue }}>
                            {s.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

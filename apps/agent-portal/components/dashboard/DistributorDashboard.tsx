"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  TrendingUp,
  Wallet,
  UserPlus,
  ArrowRightLeft,
  BarChart3,
  Store,
  Clock,
  IndianRupee,
  CalendarDays,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchApi } from "@/lib/api";
import { B, roleFromUserRole, initials } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { formatInr } from "@/lib/walletLabels";
import type { WalletBalance } from "@/lib/types";

interface ActivityMonth {
  month: string;
  monthLabel: string;
  total: number;
  transacted: number;
  noActivity: number;
}

interface DistributorStats {
  role: "distributor";
  retailers: { total: number; active: number; inactive: number };
  today: { volume: string; commission: string };
  month?: { commission: string };
  topRetailers: { id: string; name: string; volume: string }[];
  activityHistory?: ActivityMonth[];
}

export function DistributorDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const role = roleFromUserRole(user?.role);

  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [stats, setStats] = useState<DistributorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [walletRows, dashStats] = await Promise.all([
          fetchApi<WalletBalance[]>("/wallet/me"),
          fetchApi<DistributorStats>("/dashboard/stats"),
        ]);
        if (!alive) return;
        setWallets(walletRows);
        setStats(dashStats);
        const hist = dashStats.activityHistory ?? [];
        if (hist.length > 0) setSelectedMonth(hist[hist.length - 1]!.month);
      } catch {
        if (alive) toast.error("Failed to load dashboard");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const primary = wallets.find((w) => w.walletType === "main");
  const totalPending = wallets.reduce(
    (s, w) => s + (parseFloat(w.pendingBalance ?? "0") || 0),
    0,
  );
  const history = stats?.activityHistory ?? [];
  const selected =
    history.find((h) => h.month === selectedMonth) ?? history[history.length - 1] ?? null;
  const recentMonths = history.slice(-4);

  return (
    <div className="space-y-4">
      {/* Single overview band — no tall empty balance card */}
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div
            className="relative flex items-center gap-4 px-5 py-4 text-white lg:col-span-3 lg:flex-col lg:items-start lg:justify-center lg:gap-1"
            style={{ background: role.gradient }}
          >
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
            <div className="relative min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/70">
                <Wallet size={12} /> Main
              </div>
              <div className="mt-0.5 text-2xl font-bold leading-none tracking-tight">
                {loading ? "…" : formatInr(primary?.balance ?? "0")}
              </div>
            </div>
            <div className="relative inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-[12px] text-white/90 lg:mt-2">
              <Clock size={10} /> Pending {formatInr(totalPending)}
            </div>
          </div>

          <div className="flex flex-col justify-center gap-3 px-4 py-4 sm:px-5 lg:col-span-9">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Store size={15} style={{ color: B.blue }} />
                <span className="text-sm font-bold" style={{ color: B.blue }}>
                  Retailer Activity
                </span>
                {selected ? (
                  <span
                    className="rounded-md px-2 py-0.5 text-[12px] font-semibold"
                    style={{ background: B.secondary, color: B.muted }}
                  >
                    {selected.monthLabel}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-1">
                {recentMonths.map((m) => {
                  const active = m.month === (selected?.month ?? selectedMonth);
                  return (
                    <button
                      key={m.month}
                      type="button"
                      onClick={() => setSelectedMonth(m.month)}
                      className="rounded-md px-2 py-1 text-[12px] font-semibold"
                      style={{
                        background: active ? B.blue : B.secondary,
                        color: active ? "#fff" : B.muted,
                      }}
                    >
                      {m.monthLabel.split(" ")[0]}
                    </button>
                  );
                })}
                <div className="relative ml-0.5">
                  <button
                    type="button"
                    title="All months"
                    aria-label="All months"
                    onClick={() => setMonthPickerOpen((o) => !o)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-slate-50"
                    style={{ borderColor: B.border, color: B.blue }}
                  >
                    <CalendarDays size={14} />
                  </button>
                  {monthPickerOpen && history.length > 0 ? (
                    <div
                      className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border bg-white shadow-lg"
                      style={{ borderColor: B.border }}
                    >
                      {history.map((m) => {
                        const active = m.month === (selected?.month ?? selectedMonth);
                        return (
                          <button
                            key={m.month}
                            type="button"
                            onClick={() => {
                              setSelectedMonth(m.month);
                              setMonthPickerOpen(false);
                            }}
                            className="flex w-full px-3 py-2 text-left text-xs font-medium hover:bg-slate-50"
                            style={{
                              color: active ? B.blue : B.muted,
                              background: active ? `${B.blue}12` : undefined,
                            }}
                          >
                            {m.monthLabel}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <StatChip
                label="Total"
                value={loading ? "…" : String(selected?.total ?? stats?.retailers.total ?? 0)}
                tone="neutral"
              />
              <StatChip
                label="Transacted"
                value={loading ? "…" : String(selected?.transacted ?? stats?.retailers.active ?? 0)}
                tone="good"
              />
              <StatChip
                label="No Activity"
                value={loading ? "…" : String(selected?.noActivity ?? stats?.retailers.inactive ?? 0)}
                tone="bad"
              />
              <StatChip
                label="Volume Today"
                value={loading ? "…" : formatInr(stats?.today.volume ?? "0")}
                tone="neutral"
                icon={<BarChart3 size={11} />}
              />
              <StatChip
                label="Commission Today"
                value={loading ? "…" : formatInr(stats?.today.commission ?? "0")}
                tone="good"
                icon={<IndianRupee size={11} />}
              />
              <StatChip
                label="Commission MTD"
                value={loading ? "…" : formatInr(stats?.month?.commission ?? "0")}
                tone="good"
                icon={<IndianRupee size={11} />}
                className="col-span-2 sm:col-span-1"
              />
            </div>
            {(stats?.retailers.inactive ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => router.push("/network")}
                className="mt-3 w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold"
                style={{ borderColor: "#FECACA", background: "#FEF2F2", color: "#B91C1C" }}
              >
                {stats?.retailers.inactive} retailer{stats?.retailers.inactive === 1 ? "" : "s"} with no activity this month — open Network
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
        <h3 className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <QuickAction
            icon={<UserPlus size={16} />}
            label="Add Retailer"
            desc="Onboard a new retailer"
            onClick={() => router.push("/signup")}
          />
          <QuickAction
            icon={<ArrowRightLeft size={16} />}
            label="Fund / Reverse"
            desc="Send or reverse balance"
            onClick={() => router.push("/wallet")}
          />
          <QuickAction
            icon={<BarChart3 size={16} />}
            label="View Reports"
            desc="Txn & commission reports"
            onClick={() => router.push("/reports")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={16} style={{ color: B.blue }} />
            <h3 className="text-sm font-bold" style={{ color: B.blue }}>
              Top Retailers (Today)
            </h3>
          </div>
          {!stats || stats.topRetailers.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <Users size={28} className="mb-2 opacity-30" style={{ color: B.muted }} />
              <p className="text-xs" style={{ color: B.muted }}>
                No activity yet today
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.topRetailers.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl p-3"
                  style={{ background: B.secondary }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: i === 0 ? B.green : B.blue }}
                    >
                      {initials(r.name)}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: B.blue }}>
                      {r.name}
                    </span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: B.green }}>
                    {formatInr(r.volume)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ArrowRightLeft size={16} style={{ color: B.blue }} />
              <h3 className="text-sm font-bold" style={{ color: B.blue }}>
                Fund retailers
              </h3>
            </div>
            <button
              type="button"
              onClick={() => router.push("/wallet")}
              className="text-xs font-semibold"
              style={{ color: B.green }}
            >
              Open Balance →
            </button>
          </div>
          <div className="flex flex-col items-center py-8">
            <Clock size={28} className="mb-2 opacity-30" style={{ color: B.muted }} />
            <p className="text-center text-xs" style={{ color: B.muted }}>
              Bank deposit requests go to admin. You fund retailers from Balance with your PIN.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
  icon,
  className = "",
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "bad";
  icon?: ReactNode;
  className?: string;
}) {
  const bg = tone === "good" ? `${B.green}12` : tone === "bad" ? "#FEF2F2" : B.secondary;
  const fg = tone === "good" ? B.green : tone === "bad" ? "#DC2626" : B.blue;
  return (
    <div className={`rounded-xl px-3 py-2.5 ${className}`} style={{ background: bg }}>
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-lg font-bold tabular-nums" style={{ color: fg }}>
        {value}
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  desc,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition hover:shadow-sm"
      style={{ borderColor: B.border }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: B.secondary, color: B.blue }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold" style={{ color: B.blue }}>
          {label}
        </div>
        <div className="truncate text-xs" style={{ color: B.muted }}>
          {desc}
        </div>
      </div>
    </button>
  );
}

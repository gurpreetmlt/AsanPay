"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  TrendingUp,
  ArrowRightLeft,
  BarChart3,
  Store,
  Clock,
  IndianRupee,
  CalendarDays,
  MessageCircle,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchApi } from "@/lib/api";
import { B, initials } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { formatInr } from "@/lib/walletLabels";
import { PartnerQuickActions } from "./PartnerQuickActions";

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
  onboarding?: { pendingKyc: number; noBank: number; neverTxn: number };
  today: { volume: string; commission: string; cashIn?: string; payouts?: string };
  month?: { commission: string };
  topRetailers: { id: string; name: string; volume: string }[];
  activityHistory?: ActivityMonth[];
}

export function DistributorDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<DistributorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const dashStats = await fetchApi<DistributorStats>("/dashboard/stats");
        if (!alive) return;
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

  const history = stats?.activityHistory ?? [];
  const selected =
    history.find((h) => h.month === selectedMonth) ?? history[history.length - 1] ?? null;
  const recentMonths = history.slice(-4);

  function shareInactiveWhatsApp() {
    const inactive = stats?.retailers.inactive ?? 0;
    const loginUrl =
      process.env.NEXT_PUBLIC_AGENT_APP_URL?.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? `${window.location.origin}/login` : "https://asanpay.in/login");
    const text = [
      `Hi, this is ${user?.name ?? "your distributor"} from AsanPay.`,
      `${inactive} retailer${inactive === 1 ? "" : "s"} in my network have no successful transactions this month.`,
      `Please log in and start serving customers: ${loginUrl}`,
      `Need help? Reply on WhatsApp or open Support in the AsanPay app.`,
    ].join("\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <PartnerQuickActions childLabel="Retailer" />

      {/* Wallet balance lives in the header chip; this band is retailer activity only. */}
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
        <div>
          <div className="flex flex-col justify-center gap-3 px-4 py-4 sm:px-5">
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
              />
            </div>
            {(stats?.retailers.inactive ?? 0) > 0 ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push("/network")}
                  className="flex-1 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold"
                  style={{ borderColor: "#FECACA", background: "#FEF2F2", color: "#B91C1C" }}
                >
                  {stats?.retailers.inactive} retailer{stats?.retailers.inactive === 1 ? "" : "s"} with no activity this month — open Network
                </button>
                <button
                  type="button"
                  onClick={shareInactiveWhatsApp}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
                  style={{ borderColor: "#86EFAC", background: "#F0FDF4", color: "#166534" }}
                >
                  <MessageCircle size={16} />
                  WhatsApp nudge
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
            <BarChart3 size={12} /> Today&apos;s collection
          </div>
          <div className="text-xl font-bold tabular-nums" style={{ color: B.blue }}>
            {loading ? "…" : formatInr(stats?.today.volume ?? "0")}
          </div>
          <p className="mt-0.5 text-xs" style={{ color: B.muted }}>Retailer success volume today</p>
        </div>
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
            <ArrowDownLeft size={12} /> Cash-in today
          </div>
          <div className="text-xl font-bold tabular-nums" style={{ color: B.green }}>
            {loading ? "…" : formatInr(stats?.today.cashIn ?? "0")}
          </div>
          <p className="mt-0.5 text-xs" style={{ color: B.muted }}>Credits to your Main wallet</p>
        </div>
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
            <ArrowUpRight size={12} /> Payouts today
          </div>
          <div className="text-xl font-bold tabular-nums" style={{ color: "#DC2626" }}>
            {loading ? "…" : formatInr(stats?.today.payouts ?? "0")}
          </div>
          <p className="mt-0.5 text-xs" style={{ color: B.muted }}>Debits from your Main wallet</p>
        </div>
      </div>

      {!loading &&
      ((stats?.onboarding?.pendingKyc ?? 0) > 0 ||
        (stats?.onboarding?.noBank ?? 0) > 0 ||
        (stats?.onboarding?.neverTxn ?? 0) > 0) ? (
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
          <h3 className="mb-1 text-sm font-bold" style={{ color: B.blue }}>
            Retailer onboarding
          </h3>
          <p className="mb-3 text-xs" style={{ color: B.muted }}>
            Counts that need your follow-up. Open Network to act.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <FunnelChip
              label="Pending KYC"
              count={stats?.onboarding?.pendingKyc ?? 0}
              onClick={() => router.push("/network")}
            />
            <FunnelChip
              label="No verified bank"
              count={stats?.onboarding?.noBank ?? 0}
              onClick={() => router.push("/network")}
            />
            <FunnelChip
              label="Never transacted"
              count={stats?.onboarding?.neverTxn ?? 0}
              onClick={() => router.push("/network")}
            />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={16} style={{ color: B.blue }} />
            <h3 className="text-sm font-bold" style={{ color: B.blue }}>
              Hot retailers today
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

function FunnelChip({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  const hot = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border px-3 py-3 text-left transition hover:shadow-sm"
      style={{
        borderColor: hot ? "#FDBA74" : B.border,
        background: hot ? "#FFF7ED" : B.secondary,
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: hot ? "#C2410C" : B.blue }}>
        {count}
      </div>
    </button>
  );
}

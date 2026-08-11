"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Wallet,
  UserPlus,
  ArrowRightLeft,
  Network,
  Store,
  BarChart3,
  AlertTriangle,
  IndianRupee,
  Building2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchApi } from "@/lib/api";
import { B, roleFromUserRole, initials } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { formatInr } from "@/lib/walletLabels";
import type { WalletBalance } from "@/lib/types";

interface SDStats {
  role: "super_distributor";
  network: {
    distributors: number;
    inactiveDistributors?: number;
    retailers: number;
    activeRetailers: number;
  };
  revenue: {
    todayVolume: string;
    yesterdayVolume: string;
    todayCommission: string;
    monthCommission?: string;
  };
  distributorPerformance: { id: string; name: string; retailerCount: number; volume: string }[];
}

export function SuperDistributorDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const role = roleFromUserRole(user?.role);

  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [stats, setStats] = useState<SDStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [walletRows, dashStats] = await Promise.all([
          fetchApi<WalletBalance[]>("/wallet/me"),
          fetchApi<SDStats>("/dashboard/stats"),
        ]);
        if (!alive) return;
        setWallets(walletRows);
        setStats(dashStats);
      } catch {
        if (alive) toast.error("Failed to load dashboard");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const primary = wallets.find((w) => w.walletType === "main");

  const todayVol = parseFloat(stats?.revenue.todayVolume ?? "0");
  const yestVol = parseFloat(stats?.revenue.yesterdayVolume ?? "0");
  const volChange = yestVol > 0 ? Math.round(((todayVol - yestVol) / yestVol) * 100) : 0;
  const volUp = volChange >= 0;

  const inactiveRetailers = (stats?.network.retailers ?? 0) - (stats?.network.activeRetailers ?? 0);

  return (
    <div className="space-y-5">
      {/* Top: Wallet + Network Overview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Wallet */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white"
          style={{ background: role.gradient, boxShadow: `0 8px 32px ${role.color}40` }}
        >
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/70">
            <Wallet size={14} /> My Balance
          </div>
          <div className="text-3xl font-bold">{loading ? "…" : formatInr(primary?.balance ?? "0")}</div>
        </div>

        {/* Network Stats */}
        <NetworkStatCard
          icon={<Building2 size={20} />}
          label="Distributors"
          value={stats?.network.distributors ?? 0}
          loading={loading}
          accent={B.blueLight}
        />
        <NetworkStatCard
          icon={<Store size={20} />}
          label="Total Retailers"
          value={stats?.network.retailers ?? 0}
          loading={loading}
          accent={B.green}
        />
        <NetworkStatCard
          icon={<Users size={20} />}
          label="Active Retailers"
          value={stats?.network.activeRetailers ?? 0}
          loading={loading}
          accent="#10B981"
        />
      </div>

      {/* Revenue Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
            Today's Volume
          </div>
          <div className="text-3xl font-bold" style={{ color: B.blue }}>
            {loading ? "…" : formatInr(stats?.revenue.todayVolume ?? "0")}
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: volUp ? B.green : "#DC2626" }}>
            {volUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {volChange !== 0 ? `${Math.abs(volChange)}% vs yesterday` : "Same as yesterday"}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
            Yesterday's Volume
          </div>
          <div className="text-3xl font-bold" style={{ color: B.blue }}>
            {loading ? "…" : formatInr(stats?.revenue.yesterdayVolume ?? "0")}
          </div>
          <div className="mt-2 text-xs" style={{ color: B.muted }}>Previous day total</div>
        </div>
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
            Commission Today
          </div>
          <div className="text-3xl font-bold" style={{ color: B.green }}>
            {loading ? "…" : formatInr(stats?.revenue.todayCommission ?? "0")}
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: B.green }}>
            <IndianRupee size={12} /> Your earnings
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
            Commission MTD
          </div>
          <div className="text-3xl font-bold" style={{ color: B.green }}>
            {loading ? "…" : formatInr(stats?.revenue.monthCommission ?? "0")}
          </div>
          <div className="mt-2 text-xs" style={{ color: B.muted }}>This calendar month</div>
        </div>
      </div>

      {(stats?.network.inactiveDistributors ?? 0) > 0 || inactiveRetailers > 0 ? (
        <button
          type="button"
          onClick={() => router.push("/network")}
          className="w-full rounded-2xl border px-4 py-3 text-left"
          style={{ borderColor: "#FECACA", background: "#FEF2F2" }}
        >
          <p className="text-sm font-bold" style={{ color: "#B91C1C" }}>
            Downline attention
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "#991B1B" }}>
            {(stats?.network.inactiveDistributors ?? 0) > 0
              ? `${stats?.network.inactiveDistributors} inactive distributor(s). `
              : ""}
            {inactiveRetailers > 0 ? `${inactiveRetailers} inactive retailer(s) in network. ` : ""}
            Open Network →
          </p>
        </button>
      ) : null}

      {/* Distributor Performance + Alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Performance Table */}
        <div className="rounded-2xl border bg-white p-5 lg:col-span-2" style={{ borderColor: B.border }}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} style={{ color: B.blue }} />
              <h3 className="font-bold" style={{ color: B.blue }}>Distributor Performance</h3>
            </div>
            <button
              type="button"
              className="text-xs font-semibold"
              style={{ color: B.green }}
              onClick={() => router.push("/network")}
            >
              View All →
            </button>
          </div>
          {!stats || stats.distributorPerformance.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <Building2 size={28} className="mb-2 opacity-30" style={{ color: B.muted }} />
              <p className="text-xs" style={{ color: B.muted }}>No distributors yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: B.border }}>
                    <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                      Distributor
                    </th>
                    <th className="py-2 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                      Retailers
                    </th>
                    <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                      Volume
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.distributorPerformance.map((d) => (
                    <tr key={d.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ background: B.blue }}
                          >
                            {initials(d.name)}
                          </span>
                          <span className="font-medium" style={{ color: B.blue }}>{d.name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center font-semibold" style={{ color: B.blue }}>
                        {d.retailerCount}
                      </td>
                      <td className="py-3 text-right font-bold" style={{ color: B.green }}>
                        {formatInr(d.volume)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={16} style={{ color: "#D97706" }} />
            <h3 className="text-sm font-bold" style={{ color: B.blue }}>Alerts</h3>
          </div>
          <div className="space-y-3">
            {inactiveRetailers > 0 && (
              <AlertRow
                color="#DC2626"
                text={`${inactiveRetailers} inactive retailer${inactiveRetailers > 1 ? "s" : ""}`}
              />
            )}
            <AlertRow
              color={B.blueMid}
              text="Fund distributors from Balance (PIN required)"
            />
            <AlertRow color={B.muted} text="KYC pending alerts: coming soon" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
        <h3 className="mb-4 text-sm font-bold" style={{ color: B.blue }}>Quick Actions</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickAction
            icon={<UserPlus size={18} />}
            label="Add Distributor"
            desc="Onboard a new distributor"
            onClick={() => router.push("/network")}
          />
          <QuickAction
            icon={<ArrowRightLeft size={18} />}
            label="Fund Transfer"
            desc="Transfer to distributor"
            onClick={() => router.push("/wallet")}
          />
          <QuickAction
            icon={<Network size={18} />}
            label="Network Tree"
            desc="View full hierarchy"
            onClick={() => router.push("/network")}
          />
        </div>
      </div>
    </div>
  );
}

function NetworkStatCard({ icon, label, value, loading, accent }: {
  icon: React.ReactNode; label: string; value: number; loading: boolean; accent: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}15`, color: accent }}
        >
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold" style={{ color: B.blue }}>{loading ? "…" : value}</div>
      <div className="mt-1 text-xs font-medium" style={{ color: B.muted }}>{label}</div>
    </div>
  );
}

function AlertRow({ color, text }: { color: string; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg p-2" style={{ background: `${color}08` }}>
      <div className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-xs font-medium" style={{ color }}>{text}</span>
    </div>
  );
}

function QuickAction({ icon, label, desc, onClick }: {
  icon: React.ReactNode; label: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:shadow-md"
      style={{ borderColor: B.border }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: B.secondary, color: B.blue }}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold" style={{ color: B.blue }}>{label}</div>
        <div className="text-xs" style={{ color: B.muted }}>{desc}</div>
      </div>
    </button>
  );
}

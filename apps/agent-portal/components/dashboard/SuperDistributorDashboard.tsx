"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Store,
  BarChart3,
  AlertTriangle,
  IndianRupee,
  Building2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchApi } from "@/lib/api";
import { B, initials } from "@/lib/brand";
import { formatInr } from "@/lib/walletLabels";
import type { DownlineUser, WalletBalance } from "@/lib/types";
import { BulkFundForm } from "@/components/dashboard/BulkFundForm";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { PartnerQuickActions } from "./PartnerQuickActions";
import { TodayEarningsChip } from "./TodayEarningsChip";
import { PanMissingBanner } from "./PanMissingBanner";

const LOW_FLOAT_THRESHOLD = 10000;

interface SDStats {
  role: "super_distributor";
  network: {
    distributors: number;
    inactiveDistributors?: number;
    retailers: number;
    activeRetailers: number;
    inactiveRetailers?: number;
    inactiveRetailerPct?: number;
  };
  revenue: {
    todayVolume: string;
    yesterdayVolume: string;
    todayCommission: string;
    todayCommissionGross?: string;
    todayCommissionTds?: string;
    monthCommission?: string;
  };
  todayCommissionGross?: string;
  todayCommissionTds?: string;
  onboarding?: { pendingKyc: number };
  distributorPerformance: { id: string; name: string; retailerCount: number; volume: string }[];
  topDistributorsMtd?: { id: string; name: string; retailerCount: number; volume: string }[];
  commissionMtdByDist?: { id: string; name: string; amount: string }[];
}

export function SuperDistributorDashboard() {
  const router = useRouter();

  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [stats, setStats] = useState<SDStats | null>(null);
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [showBulk, setShowBulk] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRows, dashStats, kids] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<SDStats>("/dashboard/stats"),
        fetchApi<DownlineUser[]>("/users/downline"),
      ]);
      setWallets(walletRows);
      setStats(dashStats);
      setDownline(kids.filter((k) => k.role === "distributor"));
    } catch {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const primary = wallets.find((w) => w.walletType === "main");
  const mainBal = parseFloat(primary?.balance ?? "0") || 0;
  const lowFloat = !loading && mainBal < LOW_FLOAT_THRESHOLD;

  const todayVol = parseFloat(stats?.revenue.todayVolume ?? "0");
  const yestVol = parseFloat(stats?.revenue.yesterdayVolume ?? "0");
  const volChange = yestVol > 0 ? Math.round(((todayVol - yestVol) / yestVol) * 100) : 0;
  const volUp = volChange >= 0;

  const inactiveRetailers =
    stats?.network.inactiveRetailers ??
    (stats?.network.retailers ?? 0) - (stats?.network.activeRetailers ?? 0);
  const inactivePct = stats?.network.inactiveRetailerPct ?? 0;
  const topDists = stats?.topDistributorsMtd ?? stats?.distributorPerformance?.slice(0, 5) ?? [];
  const commissionByDist = stats?.commissionMtdByDist ?? [];

  return (
    <div className="space-y-5">
      <PartnerQuickActions
        childLabel="Distributor"
        onBulkTransfer={() => setShowBulk(true)}
        onChanged={() => void load()}
      />

      <TodayEarningsChip
        net={stats?.revenue.todayCommission ?? "0"}
        gross={stats?.todayCommissionGross ?? stats?.revenue.todayCommissionGross}
        tds={stats?.todayCommissionTds ?? stats?.revenue.todayCommissionTds}
        loading={loading}
        onReport={() => {
          const d = new Date();
          const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          router.push(`/earnings?from=${ymd}&to=${ymd}`);
        }}
      />
      <PanMissingBanner />

      {lowFloat ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: "#FDBA74", background: "#FFF7ED" }}
        >
          <div>
            <p className="text-sm font-bold" style={{ color: "#C2410C" }}>
              Low float — Add Money / transfer carefully
            </p>
            <p className="text-xs" style={{ color: "#9A3412" }}>
              Main balance is under {formatInr(LOW_FLOAT_THRESHOLD)}. Top up before large distributor funding.
            </p>
          </div>
          <PrimaryButton
            type="button"
            variant="success"
            size="sm"
            showArrow={false}
            className="!w-auto"
            onClick={() => router.push("/fund-request")}
          >
            Add Money
          </PrimaryButton>
        </div>
      ) : null}

      {/* Network overview — wallet balance lives in the header chip. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          icon={<AlertTriangle size={20} />}
          label="Inactive retailers %"
          value={loading ? "…" : `${inactivePct}%`}
          loading={loading}
          accent="#D97706"
        />
      </div>

      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold" style={{ color: B.blue }}>
              Top distributors (MTD volume)
            </h3>
            <p className="text-xs" style={{ color: B.muted }}>
              This month · tap to open Network
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/network")}
            className="text-xs font-bold"
            style={{ color: B.blueMid }}
          >
            View network →
          </button>
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : topDists.length === 0 ? (
          <p className="text-sm" style={{ color: B.muted }}>
            No distributors yet
          </p>
        ) : (
          <div className="space-y-2">
            {topDists.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => router.push("/network")}
                className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:shadow-sm"
                style={{ borderColor: B.border }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                    style={{ background: B.secondary, color: B.blue }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                      {d.name}
                    </p>
                    <p className="text-[11px]" style={{ color: B.muted }}>
                      {d.retailerCount} retailers
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums" style={{ color: B.green }}>
                  {formatInr(d.volume)}
                </p>
              </button>
            ))}
          </div>
        )}
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

      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
        <div className="mb-3 flex items-center gap-2">
          <IndianRupee size={16} style={{ color: B.green }} />
          <div>
            <h3 className="text-sm font-bold" style={{ color: B.blue }}>
              Commission break-up (MTD)
            </h3>
            <p className="text-xs" style={{ color: B.muted }}>
              Your commission this month by distributor (top 5)
            </p>
          </div>
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: B.muted }}>Loading…</p>
        ) : commissionByDist.length === 0 ? (
          <p className="text-sm" style={{ color: B.muted }}>No commission attributed yet this month</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: B.border }}>
                  <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                    Distributor
                  </th>
                  <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                    Commission
                  </th>
                </tr>
              </thead>
              <tbody>
                {commissionByDist.map((row) => (
                  <tr key={row.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                    <td className="py-2.5 font-medium" style={{ color: B.blue }}>{row.name}</td>
                    <td className="py-2.5 text-right font-bold tabular-nums" style={{ color: B.green }}>
                      {formatInr(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            {(stats?.onboarding?.pendingKyc ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => router.push("/action-queue")}
                className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left transition hover:bg-red-50"
                style={{ background: "#DC262608" }}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#DC2626" }} />
                  <span className="text-xs font-medium" style={{ color: "#DC2626" }}>
                    {(stats?.onboarding?.pendingKyc ?? 0) === 1
                      ? "1 agent KYC needs follow-up"
                      : `${stats?.onboarding?.pendingKyc} agent KYCs need follow-up`}
                  </span>
                </span>
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                  style={{ background: "#DC2626" }}
                >
                  {(stats?.onboarding?.pendingKyc ?? 0) > 99 ? "99+" : stats?.onboarding?.pendingKyc}
                </span>
              </button>
            ) : (
              <AlertRow color={B.green} text="No pending agent KYC in your network" />
            )}
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
          </div>
        </div>
      </div>

      {showBulk ? (
        <BulkFundForm
          targets={downline}
          title="Bulk transfer to distributors"
          onClose={() => setShowBulk(false)}
          onSuccess={() => void load()}
        />
      ) : null}
    </div>
  );
}

function NetworkStatCard({ icon, label, value, loading, accent }: {
  icon: React.ReactNode; label: string; value: number | string; loading: boolean; accent: string;
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

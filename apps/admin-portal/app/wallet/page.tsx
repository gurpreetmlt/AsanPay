"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowDownToLine,
  RefreshCcw,
  Users,
  UserPlus,
  Wallet,
  IndianRupee,
  Landmark,
  AlertTriangle,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { DownlineTable } from "@/components/dashboard/DownlineTable";
import { OnboardForm } from "@/components/dashboard/OnboardForm";
import { FundForm } from "@/components/dashboard/FundForm";
import { FundSelfForm } from "@/components/dashboard/FundSelfForm";
import { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { CHILD_ROLE } from "@/lib/roles";
import { useAuthStore } from "@/lib/store";
import type { DownlineUser, WalletBalance } from "@/lib/types";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface TreasurySummary {
  bank: string;
  transit: string;
  float: string;
  totalAssets: string;
  companyBalance: string;
  downlineLiability: string;
  solvent: boolean;
}

function formatInr(amount: string | number) {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) {
    return "₹0";
  }
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function WalletPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboard, setShowOnboard] = useState(false);
  const [showFundSelf, setShowFundSelf] = useState(false);
  const [fundTarget, setFundTarget] = useState<DownlineUser | null>(null);
  const [treasury, setTreasury] = useState<TreasurySummary | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [walletData, downlineData] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<DownlineUser[]>("/users/downline"),
      ]);
      setWallets(walletData);
      setDownline(downlineData);
    } catch {
      toast.error("Failed to load balance data");
    } finally {
      setLoading(false);
    }
    // Treasury is a separate call on purpose: a failure here must not blank the balance cards.
    try {
      setTreasury(await fetchApi<TreasurySummary>("/admin/treasury/summary"));
    } catch {
      setTreasury(null);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void loadData();
  }, [hydrated, accessToken, router, loadData]);

  if (!hydrated || !accessToken || !user) return null;

  const childRole = CHILD_ROLE[user.role];
  const main = wallets.find((w) => w.walletType === "main") ?? wallets[0];
  const pending = parseFloat(main?.pendingBalance ?? "0") || 0;
  const downlineFloat = downline.reduce((s, u) => s + (Number(u.mainBalance) || 0), 0);
  const activeCount = downline.filter((u) => u.isActive).length;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="overview" />
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Company balance
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Add funds to the company balance, then fund Super Distributors
          </p>
        </div>

        {/* Retailer-style summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Treasury — real money the platform holds, not issuable capacity. */}
          <div
            className="relative overflow-hidden rounded-2xl border bg-white p-5"
            style={{
              borderColor: treasury && !treasury.solvent ? "#DC2626" : B.border,
              boxShadow: "0 4px 20px rgba(15,23,42,0.04)",
            }}
          >
            <div
              className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider"
              style={{ color: B.muted }}
            >
              <Landmark size={14} style={{ color: B.blueLight }} />
              Treasury
            </div>
            <div
              className="mb-3 text-3xl font-bold leading-none tabular-nums"
              style={{ color: B.blue }}
            >
              {treasury ? formatInr(treasury.totalAssets) : "…"}
            </div>
            {treasury && !treasury.solvent ? (
              <div
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold"
                style={{ background: "#FEE2E2", color: "#991B1B" }}
              >
                <AlertTriangle size={13} />
                Short by {formatInr(Number(treasury.downlineLiability) - Number(treasury.totalAssets))}
              </div>
            ) : (
              <div
                className="border-t pt-3 text-xs"
                style={{ borderColor: B.border, color: B.muted }}
              >
                {treasury
                  ? `Bank ${formatInr(treasury.bank)} · Transit ${formatInr(treasury.transit)} · Float ${formatInr(treasury.float)}`
                  : "Not available"}
              </div>
            )}
          </div>

          <div
            className="relative overflow-hidden rounded-2xl p-5 text-white"
            style={{ background: B.badgeGrad, boxShadow: "0 8px 32px rgba(11,42,154,0.28)" }}
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white opacity-10" />
            <div className="relative z-10">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/70">
                <Wallet size={14} />
                Company balance
              </div>
              <div className="mb-3 text-3xl font-bold leading-none tabular-nums">
                {loading && !main ? "…" : formatInr(main?.balance ?? "0")}
              </div>
              <div className="flex items-center gap-1.5 border-t border-white/15 pt-3 text-xs text-white/85">
                {pending > 0 ? `Pending: ${formatInr(pending)}` : "Left to issue to agents"}
              </div>
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-2xl p-5 text-white"
            style={{ background: B.green, boxShadow: `0 8px 32px ${B.green}40` }}
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white opacity-10" />
            <div className="relative z-10">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/70">
                <IndianRupee size={14} />
                Downline float
              </div>
              <div className="mb-3 text-3xl font-bold leading-none tabular-nums">
                {loading ? "…" : formatInr(downlineFloat)}
              </div>
              <div className="flex items-center gap-1.5 border-t border-white/15 pt-3 text-xs text-white/90">
                With {childRole ? `${ROLE_LABEL[childRole] ?? childRole}s` : "agents"}
              </div>
            </div>
          </div>

          <div
            className="rounded-2xl border bg-white p-5"
            style={{ borderColor: B.border, boxShadow: "0 4px 20px rgba(15,23,42,0.04)" }}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
              <Users size={14} style={{ color: B.blueLight }} />
              Super Distributors
            </div>
            <div className="mb-3 text-3xl font-bold leading-none tabular-nums" style={{ color: B.blue }}>
              {loading ? "…" : downline.length}
            </div>
            <div className="border-t pt-3 text-xs font-semibold" style={{ borderColor: B.border, color: B.greenDark }}>
              {activeCount} active
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowFundSelf(true)}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: B.badgeGrad }}
          >
            <ArrowDownToLine size={16} />
            Top up company balance
          </button>
          {childRole ? (
            <button
              type="button"
              onClick={() => setShowOnboard(true)}
              className="flex items-center gap-1.5 rounded-xl border-2 bg-white px-4 py-2.5 text-sm font-semibold"
              style={{ borderColor: B.blueLight, color: B.blueLight }}
            >
              <UserPlus size={16} />
              Onboard {ROLE_LABEL[childRole] ?? childRole}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void loadData()}
            className="flex items-center gap-1.5 rounded-xl border-2 bg-white px-4 py-2.5 text-sm font-semibold"
            style={{ borderColor: B.border, color: B.muted }}
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        <div
          className="rounded-2xl border bg-white p-4 sm:p-5"
          style={{ borderColor: B.border }}
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold" style={{ color: B.blue }}>
                My downline
                {childRole ? ` · ${ROLE_LABEL[childRole] ?? childRole}s` : ""}
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
                Fund Super Distributors from your Main balance. Parent reassign is on agent detail.
              </p>
            </div>
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : (
            <DownlineTable users={downline} onFund={setFundTarget} />
          )}
        </div>
      </div>

      {showOnboard && childRole ? (
        <OnboardForm
          childRole={childRole}
          childRoleLabel={ROLE_LABEL[childRole] ?? childRole}
          onClose={() => setShowOnboard(false)}
          onSuccess={() => void loadData()}
        />
      ) : null}
      {showFundSelf ? (
        <FundSelfForm onClose={() => setShowFundSelf(false)} onSuccess={() => void loadData()} />
      ) : null}
      {fundTarget ? (
        <FundForm target={fundTarget} onClose={() => setFundTarget(null)} onSuccess={() => void loadData()} />
      ) : null}
    </AdminShell>
  );
}

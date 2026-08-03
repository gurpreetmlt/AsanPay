"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PlusCircle,
  SendHorizonal,
  RefreshCcw,
  ArrowUpRight,
  ArrowDownLeft,
  Download,
  Clock,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { FundForm } from "@/components/dashboard/FundForm";
import { FundRequestForm } from "@/components/dashboard/FundRequestForm";
import { PullForm } from "@/components/dashboard/PullForm";
import { fetchApi } from "@/lib/api";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import type { DownlineUser, LedgerEntry, WalletBalance } from "@/lib/types";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";

export default function WalletPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const role = roleFromUserRole(user?.role);
  const canFund = user?.role === "distributor" || user?.role === "master_distributor";
  const isRetailer = user?.role === "retailer" || !user?.role;

  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [fundTarget, setFundTarget] = useState<DownlineUser | null>(null);
  const [pullTarget, setPullTarget] = useState<DownlineUser | null>(null);
  const [showFundRequest, setShowFundRequest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [balances, entries] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<LedgerEntry[]>("/wallet/ledger", { limit: 50, offset: 0 }),
      ]);
      setWallets(balances);
      setLedger(entries);
      if (canFund) {
        const kids = await fetchApi<DownlineUser[]>("/users/downline");
        setDownline(kids);
      } else {
        setDownline([]);
      }
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load wallet"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, canFund]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hydrated || !accessToken) return null;

  const main = wallets.find((w) => w.walletType === "main");
  const aeps = wallets.find((w) => w.walletType === "aeps");
  const credits = ledger.filter((e) => e.entryType === "credit").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const debits = ledger.filter((e) => e.entryType === "debit").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const pendingTotal = wallets.reduce((s, w) => s + (parseFloat(w.pendingBalance ?? "0") || 0), 0);

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Wallet
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Manage your balance, loads, and transfers
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Main Wallet */}
          <div
            className="relative overflow-hidden rounded-2xl p-4 text-white"
            style={{ background: role.gradient, boxShadow: `0 8px 32px ${role.color}40` }}
          >
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
            <div className="relative z-10">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-white/70">
                {walletDisplayName("main")}
              </div>
              <div className="mb-2 text-2xl font-bold leading-none">
                {loading && !main ? "…" : formatInr(main?.balance ?? "0")}
              </div>
              <div className="mb-3 flex items-center gap-1.5 border-t border-white/15 pt-2 text-xs text-white/80">
                {parseFloat(main?.pendingBalance ?? "0") > 0
                  ? `Pending: ${formatInr(main?.pendingBalance ?? "0")}`
                  : "No pending balance"}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  {
                    icon: PlusCircle,
                    label: "Add Money",
                    action: () =>
                      isRetailer
                        ? setShowFundRequest(true)
                        : toast("Ask your upline to fund your wallet, or use Collect"),
                  },
                  {
                    icon: SendHorizonal,
                    label: "Transfer",
                    action: () =>
                      canFund ? toast("Select a downline partner below to fund") : toast("Coming soon"),
                  },
                  { icon: RefreshCcw, label: "Refresh", action: () => void load() },
                  { icon: Download, label: "Statement", action: () => router.push("/statements") },
                ].map(({ icon: Icon, label, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className="flex flex-col items-center gap-1 rounded-xl border border-white/20 bg-white/15 px-2 py-2 text-white transition-all hover:bg-white/25"
                  >
                    <Icon size={16} />
                    <span className="text-[10px] font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* AEPS Wallet */}
          {aeps && (
            <div
              className="relative overflow-hidden rounded-2xl p-4 text-white"
              style={{ background: B.green, boxShadow: `0 8px 32px ${B.green}40` }}
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
              <div className="relative z-10">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-white/70">
                  {walletDisplayName("aeps")}
                </div>
                <div className="mb-2 text-2xl font-bold leading-none">{formatInr(aeps.balance)}</div>
                <div className="mb-3 flex items-center gap-1.5 border-t border-white/15 pt-2 text-xs text-white/80">
                  {parseFloat(aeps.pendingBalance ?? "0") > 0
                    ? `Pending: ${formatInr(aeps.pendingBalance ?? "0")}`
                    : "No pending balance"}
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 py-2 text-white transition-all hover:bg-white/25"
                >
                  <RefreshCcw size={15} />
                  <span className="text-xs font-semibold">Refresh</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Credits (ledger)", value: formatInr(credits), icon: ArrowDownLeft, col: B.blue },
            { label: "Debits (ledger)", value: formatInr(debits), icon: ArrowUpRight, col: "#DC2626" },
            {
              label: "Pending balance",
              value: formatInr(pendingTotal),
              icon: Clock,
              col: "#D97706",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-2xl border bg-white p-4"
              style={{ borderColor: B.border }}
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${s.col}15` }}
              >
                <s.icon size={18} style={{ color: s.col }} />
              </div>
              <div>
                <div className="text-xs" style={{ color: B.muted }}>
                  {s.label}
                </div>
                <div className="text-lg font-bold" style={{ color: s.col }}>
                  {s.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {canFund && (
          <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
            <div className="border-b px-5 py-4" style={{ borderColor: B.border }}>
              <h2 className="font-bold" style={{ color: B.blue }}>
                Downline — Fund / Reverse
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
                Fund needs your PIN. Reverse sends OTP to partner phone, then you enter OTP + PIN.
              </p>
            </div>
            {downline.length === 0 ? (
              <p className="px-5 py-8 text-sm" style={{ color: B.muted }}>
                No downline users yet
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead style={{ background: B.secondary }}>
                  <tr>
                    {["Partner", "Role", "Balance", "Status", ""].map((h) => (
                      <th
                        key={h || "act"}
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: B.muted }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {downline.map((d) => (
                    <tr key={d.id} className="border-b" style={{ borderColor: B.border }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white"
                            style={{ background: B.badgeGrad }}
                          >
                            {initials(d.name)}
                          </div>
                          <div>
                            <div className="font-semibold" style={{ color: B.blue }}>
                              {d.name}
                            </div>
                            <div className="text-xs" style={{ color: B.muted }}>
                              {d.uid} · {d.mobile}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 capitalize" style={{ color: B.muted }}>
                        {d.role.replace(/_/g, " ")}
                      </td>
                      <td className="px-5 py-3 font-bold" style={{ color: B.blue }}>
                        {formatInr(d.mainBalance)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={
                            d.isActive
                              ? { background: `${B.green}18`, color: B.green }
                              : { background: "#DC262618", color: "#DC2626" }
                          }
                        >
                          {d.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={!d.isActive}
                            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ background: B.badgeGrad }}
                            onClick={() => setFundTarget(d)}
                          >
                            Fund
                          </button>
                          <button
                            type="button"
                            disabled={!d.isActive || Number(d.mainBalance) <= 0}
                            className="rounded-xl border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ borderColor: B.blue, color: B.blue }}
                            onClick={() => setPullTarget(d)}
                          >
                            Reverse
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          <div className="border-b px-5 py-4" style={{ borderColor: B.border }}>
            <h2 className="font-bold" style={{ color: B.blue }}>
              Ledger
            </h2>
          </div>
          {loading && ledger.length === 0 ? (
            <p className="px-5 py-8 text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : ledger.length === 0 ? (
            <p className="px-5 py-8 text-sm" style={{ color: B.muted }}>
              No ledger entries yet
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: B.secondary }}>
                <tr>
                  {["Date", "Description", "Wallet", "Type", "Amount", "Balance"].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${
                        h === "Amount" || h === "Balance" ? "text-right" : "text-left"
                      }`}
                      style={{ color: B.muted }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id} className="border-b transition-colors hover:bg-secondary/30" style={{ borderColor: B.border }}>
                    <td className="px-5 py-3 text-sm" style={{ color: B.muted }}>
                      {new Date(l.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold" style={{ color: B.blue }}>
                      {l.description || l.referenceType}
                    </td>
                    <td className="px-5 py-3 text-xs uppercase" style={{ color: B.muted }}>
                      {walletDisplayName(l.walletType)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={
                          l.entryType === "credit"
                            ? { background: `${B.green}18`, color: B.green }
                            : { background: "#DC262618", color: "#DC2626" }
                        }
                      >
                        {l.entryType === "credit" ? "Credit" : "Debit"}
                      </span>
                    </td>
                    <td
                      className="px-5 py-3 text-right font-bold"
                      style={{ color: l.entryType === "credit" ? B.green : "#DC2626" }}
                    >
                      {l.entryType === "credit" ? "+" : "−"}
                      {formatInr(l.amount)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: B.blue }}>
                      {formatInr(l.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {fundTarget && (
        <FundForm
          target={fundTarget}
          onClose={() => setFundTarget(null)}
          onSuccess={() => void load()}
        />
      )}
      {pullTarget && (
        <PullForm
          target={pullTarget}
          onClose={() => setPullTarget(null)}
          onSuccess={() => void load()}
        />
      )}
      {showFundRequest && (
        <FundRequestForm onClose={() => setShowFundRequest(false)} onSuccess={() => void load()} />
      )}
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { isFundRequestEnabled } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { WalletActionForm } from "@/components/dashboard/WalletActionForm";
import { BulkFundForm } from "@/components/dashboard/BulkFundForm";
import { fetchApi } from "@/lib/api";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import type { DownlineUser, LedgerEntry, WalletBalance } from "@/lib/types";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { maskBalance, useBalanceVisibility } from "@/lib/balanceVisibility";

const FUND_REQUEST_DISABLED_MESSAGE =
  "Fund requests are not enabled for your account. Contact your sales manager to enable them.";

export default function WalletPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const role = roleFromUserRole(user?.role);
  const canFund = user?.role === "distributor" || user?.role === "super_distributor";
  const fundOn = user ? isFundRequestEnabled(user.role, user.fundRequestEnabled) : false;

  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [walletTarget, setWalletTarget] = useState<DownlineUser | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ledgerPartner, setLedgerPartner] = useState("all");
  const [ledgerFrom, setLedgerFrom] = useState("");
  const [ledgerTo, setLedgerTo] = useState("");
  const ledgerRangeRef = useRef({ from: "", to: "" });
  ledgerRangeRef.current = { from: ledgerFrom, to: ledgerTo };
  const balanceVisible = useBalanceVisibility((s) => s.visible);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const { from, to } = ledgerRangeRef.current;
      const ledgerParams: Record<string, string | number> = { limit: 500, offset: 0 };
      if (from) ledgerParams.from = from;
      if (to) ledgerParams.to = to;
      const [balances, entries] = await Promise.all([
        fetchApi<WalletBalance[]>("/wallet/me"),
        fetchApi<LedgerEntry[]>("/wallet/ledger", ledgerParams),
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
      toast.error(extractApiError(err, "Failed to load balance"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, canFund]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hydrated || !accessToken) return null;

  const main = wallets.find((w) => w.walletType === "main");
  const aeps = canFund ? undefined : wallets.find((w) => w.walletType === "aeps");
  const filteredLedger = ledger.filter((e) => {
    if (ledgerPartner !== "all") {
      const partner = downline.find((d) => d.id === ledgerPartner);
      if (!partner) return false;
      const hay = `${e.description ?? ""} ${e.referenceId ?? ""}`.toLowerCase();
      if (!hay.includes(partner.name.toLowerCase()) && e.referenceId !== partner.id) return false;
    }
    if (ledgerFrom) {
      const from = new Date(ledgerFrom);
      from.setHours(0, 0, 0, 0);
      if (new Date(e.createdAt) < from) return false;
    }
    if (ledgerTo) {
      const to = new Date(ledgerTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(e.createdAt) > to) return false;
    }
    return true;
  });
  const credits = filteredLedger.filter((e) => e.entryType === "credit").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const debits = filteredLedger.filter((e) => e.entryType === "debit").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const pendingTotal = wallets.reduce((s, w) => s + (parseFloat(w.pendingBalance ?? "0") || 0), 0);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Balance
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Manage your balance, loads, and transfers
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Main Wallet */}
          <div
            className="relative overflow-hidden rounded-2xl p-4 text-white"
            style={{ background: role.gradient, boxShadow: `0 2px 10px ${role.color}22` }}
          >
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
            <div className="relative z-10">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-white/70">
                {walletDisplayName("main")}
              </div>
              <div className="mb-2 text-2xl font-bold leading-none">
                {loading && !main ? "…" : maskBalance(balanceVisible, formatInr(main?.balance ?? "0"))}
              </div>
              <div className="mb-3 flex items-center gap-1.5 border-t border-white/15 pt-2 text-xs text-white/80">
                {parseFloat(main?.pendingBalance ?? "0") > 0
                  ? `Pending: ${balanceVisible ? formatInr(main?.pendingBalance ?? "0") : "••••"}`
                  : "No pending balance"}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  {
                    icon: PlusCircle,
                    label: "Add Money",
                    action: () =>
                      fundOn
                        ? router.push("/fund-request")
                        : toast.error(FUND_REQUEST_DISABLED_MESSAGE),
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
                    className="flex flex-col items-center gap-1 rounded-2xl border border-white/20 bg-white/15 px-2 py-2 text-white transition-all hover:bg-white/25"
                  >
                    <Icon size={16} />
                    <span className="text-[11px] font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Earnings (AEPS) */}
          {aeps && (
            <div
              className="relative overflow-hidden rounded-2xl p-4 text-white"
              style={{ background: B.green, boxShadow: `0 2px 10px ${B.green}22` }}
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
              <div className="relative z-10">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-white/70">
                  {walletDisplayName("aeps")}
                </div>
                <div className="mb-2 text-2xl font-bold leading-none">{maskBalance(balanceVisible, formatInr(aeps.balance))}</div>
              <div className="mb-3 flex items-center gap-1.5 border-t border-white/15 pt-2 text-xs text-white/80">
                {parseFloat(aeps.pendingBalance ?? "0") > 0
                  ? `Pending: ${balanceVisible ? formatInr(aeps.pendingBalance ?? "0") : "••••"}`
                  : "Credits from AePS cash-out only"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: RefreshCcw, label: "Refresh", action: () => void load() },
                  { icon: Download, label: "Statement", action: () => router.push("/statements") },
                ].map(({ icon: Icon, label, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className="flex flex-col items-center gap-1 rounded-2xl border border-white/20 bg-white/15 px-2 py-2 text-white transition-all hover:bg-white/25"
                  >
                    <Icon size={16} />
                    <span className="text-[11px] font-semibold">{label}</span>
                  </button>
                ))}
              </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4" style={{ borderColor: B.border }}>
              <div>
                <h2 className="font-bold" style={{ color: B.blue }}>
                  Downline — Wallet
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
                  Transfer or reverse — both need your 4-digit PIN.
                </p>
              </div>
              {user?.role === "super_distributor" || user?.role === "distributor" ? (
                <PrimaryButton
                  type="button"
                  variant="primary"
                  size="sm"
                  showArrow={false}
                  className="!w-auto"
                  onClick={() => setShowBulk(true)}
                >
                  Bulk transfer
                </PrimaryButton>
              ) : null}
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
                        <StatusBadge tone={d.isActive ? "success" : "danger"}>
                          {d.isActive ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <PrimaryButton
                          type="button"
                          variant="success"
                          size="sm"
                          showArrow={false}
                          disabled={!d.isActive}
                          className="!w-auto"
                          onClick={() => setWalletTarget(d)}
                        >
                          Wallet
                        </PrimaryButton>
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
            <div className="mt-3 flex flex-wrap items-end gap-3">
              {canFund ? (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                    Partner
                  </label>
                  <select
                    value={ledgerPartner}
                    onChange={(e) => setLedgerPartner(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: B.border, color: B.blue }}
                  >
                    <option value="all">All partners</option>
                    {downline.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                  From
                </label>
                <input
                  type="date"
                  value={ledgerFrom}
                  onChange={(e) => setLedgerFrom(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                  To
                </label>
                <input
                  type="date"
                  value={ledgerTo}
                  onChange={(e) => setLedgerTo(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: B.border, color: B.blue }}
                />
              </div>
              <PrimaryButton
                type="button"
                variant="primary"
                size="sm"
                showArrow={false}
                className="!w-auto"
                onClick={() => void load()}
                disabled={loading}
              >
                View
              </PrimaryButton>
              <PrimaryButton
                type="button"
                variant="success"
                size="sm"
                showArrow={false}
                className="!w-auto"
                onClick={() => {
                  if (filteredLedger.length === 0) {
                    toast.error("No ledger entries in this date range.");
                    return;
                  }
                  const header = "Date,Particulars,Type,Amount,Balance";
                  const lines = filteredLedger.map((e) =>
                    [
                      new Date(e.createdAt).toLocaleString("en-IN"),
                      `"${(e.description || e.referenceType).replace(/"/g, "'")}"`,
                      e.entryType,
                      e.amount,
                      e.balanceAfter,
                    ].join(","),
                  );
                  const blob = new Blob([[header, ...lines].join("\n")], {
                    type: "text/csv;charset=utf-8",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `asanpay-ledger-${ledgerFrom || "all"}-${ledgerTo || "all"}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Ledger downloaded");
                }}
              >
                <Download size={15} /> Download
              </PrimaryButton>
            </div>
          </div>
          {loading && ledger.length === 0 ? (
            <p className="px-5 py-8 text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : filteredLedger.length === 0 ? (
            <p className="px-5 py-8 text-sm" style={{ color: B.muted }}>
              {ledger.length === 0 ? "No ledger entries yet" : "No entries match these filters"}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: B.secondary }}>
                <tr>
                  {["Date", "Description", "Account", "Type", "Amount", "Balance"].map((h) => (
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
                {filteredLedger.map((l) => (
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

      {walletTarget ? (
        <WalletActionForm
          target={walletTarget}
          allowReverse={walletTarget.isActive && Number(walletTarget.mainBalance) > 0}
          onClose={() => setWalletTarget(null)}
          onSuccess={() => void load()}
        />
      ) : null}
      {showBulk ? (
        <BulkFundForm
          targets={downline}
          title="Bulk transfer"
          onClose={() => setShowBulk(false)}
          onSuccess={() => void load()}
        />
      ) : null}
    </AppShell>
  );
}

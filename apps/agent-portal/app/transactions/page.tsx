"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Download, AlertCircle, X } from "lucide-react";
import { RaiseDisputeModal } from "@/components/transactions/RaiseDisputeModal";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import type { TxnRow } from "@/lib/types";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { walletDisplayName } from "@/lib/walletLabels";

const FILTERS = ["All", "Success", "Pending", "Failed"];

function formatInr(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function badgeStatus(status: string) {
  if (status === "success") return "success";
  if (status === "pending" || status === "initiated") return "pending";
  return "failed";
}

function matchesFilter(status: string, filter: string) {
  if (filter === "All") return true;
  if (filter === "Success") return status === "success";
  if (filter === "Pending") return status === "pending" || status === "initiated";
  return status === "failed" || status === "reversed" || status === "refunded";
}

function TransactionsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [disputeTxn, setDisputeTxn] = useState<TxnRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingRef, setDownloadingRef] = useState<string | null>(null);

  function applySearch(value: string) {
    setSearch(value);
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = value.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const fromUrl = searchParams.get("q")?.trim() ?? "";
    setSearch((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  async function downloadReceiptPdf(txnRef: string) {
    setDownloadingRef(txnRef);
    try {
      const res = await fetch(`/api/proxy/txn/${encodeURIComponent(txnRef)}/receipt/pdf`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("pdf")) {
        let message = "Could not download receipt PDF";
        try {
          const json = (await res.json()) as { message?: string };
          if (json?.message) message = json.message;
        } catch {
          /* keep default */
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${txnRef}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Receipt downloaded");
    } catch (err) {
      toast.error(extractApiError(err, "Could not download receipt PDF"));
    } finally {
      setDownloadingRef(null);
    }
  }

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchApi<TxnRow[]>("/txn", { limit: 100, offset: 0 });
        if (alive) setTxns(data);
      } catch (err) {
        toast.error(extractApiError(err, "Failed to load transactions"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns.filter((t) => {
      if (!matchesFilter(t.status, filter)) return false;
      if (!q) return true;
      return (
        t.txnRef.toLowerCase().includes(q) ||
        t.serviceName.toLowerCase().includes(q) ||
        t.serviceCode.toLowerCase().includes(q)
      );
    });
  }, [txns, filter, search]);

  const totalAmt = shown.reduce((s, t) => s + (t.status === "failed" ? 0 : parseFloat(t.amount) || 0), 0);
  const successN = shown.filter((t) => t.status === "success").length;

  if (!hydrated || !accessToken) return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Transactions
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Your service transactions
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
            style={{ borderColor: B.border, color: B.blue }}
            onClick={() => toast("CSV export coming soon")}
          >
            <Download size={15} /> Export CSV
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Total Transactions", value: `${shown.length}`, col: B.blue },
            { label: "Total Volume", value: formatInr(totalAmt), col: B.blue },
            { label: "Successful", value: `${successN}`, col: B.green },
            {
              label: "Success Rate",
              value: `${Math.round((successN / Math.max(shown.length, 1)) * 100)}%`,
              col: B.green,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
                {s.label}
              </div>
              <div className="text-xl font-bold" style={{ color: s.col }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
          <div className="relative min-w-48 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: B.muted }} />
            <input
              value={search}
              onChange={(e) => applySearch(e.target.value)}
              placeholder="Search by Txn ID or service..."
              className="w-full rounded-xl border py-2 pl-9 pr-10 text-sm focus:outline-none"
              style={{ borderColor: B.border, background: B.secondary, color: B.blue }}
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5"
                style={{ color: B.muted }}
                onClick={() => applySearch("")}
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="rounded-xl px-3.5 py-2 text-xs font-semibold transition-all"
                style={
                  filter === f
                    ? { background: B.badgeGrad, color: "#fff" }
                    : { background: B.secondary, color: B.muted }
                }
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          {loading && txns.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: B.secondary }}>
                <tr>
                  {["Txn ID", "Service", "Account", "Amount", "Status", "Time", "Receipt", "Dispute"].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${
                        h === "Amount" ? "text-right" : "text-left"
                      }`}
                      style={{ color: B.muted }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((t, i) => (
                  <tr
                    key={t.id}
                    className="border-b transition-colors hover:bg-secondary/30"
                    style={{ borderColor: B.border, background: i % 2 === 0 ? "#fff" : "#fafbff" }}
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: B.muted }}>
                      {t.txnRef}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: B.blue }}>
                      {t.serviceName}
                      <div className="text-xs font-normal" style={{ color: B.muted }}>
                        {t.serviceCode}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {t.walletType ? (
                        <span
                          className="inline-block rounded-lg px-2 py-0.5 text-[12px] font-bold"
                          style={
                            t.walletType === "aeps"
                              ? { background: `${B.green}18`, color: B.green }
                              : { background: `${B.blue}12`, color: B.blue }
                          }
                        >
                          {walletDisplayName(t.walletType)}
                        </span>
                      ) : (
                        <span style={{ color: B.muted }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: B.blue }}>
                      {formatInr(t.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={badgeStatus(t.status)} />
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                      {new Date(t.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void downloadReceiptPdf(t.txnRef)}
                        disabled={downloadingRef === t.txnRef}
                        className="inline-flex items-center gap-1 text-xs font-semibold hover:underline disabled:opacity-50"
                        style={{ color: B.blue }}
                      >
                        <Download size={12} />
                        {downloadingRef === t.txnRef ? "…" : "PDF"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDisputeTxn(t)}
                        className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                        style={{ color: "#DC2626" }}
                      >
                        <AlertCircle size={12} /> Raise
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && shown.length === 0 && (
            <EmptyState
              title="No transactions found"
              description="Try another filter, or start a service from the dashboard."
              className="!py-10"
              action={
                <PrimaryButton
                  type="button"
                  variant="primary"
                  size="sm"
                  showArrow={false}
                  className="!w-auto"
                  onClick={() => router.push("/dashboard")}
                >
                  Go to dashboard
                </PrimaryButton>
              }
            />
          )}
        </div>
      </div>

      {disputeTxn && (
        <RaiseDisputeModal
          transactionId={disputeTxn.id}
          txnRef={disputeTxn.txnRef}
          onClose={() => setDisputeTxn(null)}
          onRaised={() => {}}
        />
      )}
    </AppShell>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="px-4 py-8 text-sm" style={{ color: B.muted }}>
            Loading…
          </div>
        </AppShell>
      }
    >
      <TransactionsInner />
    </Suspense>
  );
}

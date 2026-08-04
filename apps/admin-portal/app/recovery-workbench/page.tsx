"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { RefreshCw, Wrench } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface TxnRow {
  id: string;
  txnRef: string;
  amount: string;
  status: string;
  userName: string;
  userUid: string;
  serviceName: string;
  serviceCode: string;
  createdAt: string;
}

type StatusFilter = "pending" | "failed";

export default function RecoveryWorkbenchPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rows, setRows] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [rechecking, setRechecking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<TxnRow[]>("/admin/transactions", { status, limit: "100" }));
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function recheck(row: TxnRow) {
    setRechecking(row.id);
    try {
      await api.post(`/txn/${row.txnRef}/recheck`);
      toast.success(`${row.txnRef}: recheck triggered`);
      await load();
    } catch (err) {
      toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Recheck failed");
    } finally {
      setRechecking(null);
    }
  }

  // Group by service so a burst of same-service failures (e.g. one provider down) is obvious
  // at a glance, matching the roadmap's "grouped by root cause" idea.
  const grouped = rows.reduce<Record<string, TxnRow[]>>((acc, r) => {
    (acc[r.serviceName] ??= []).push(r);
    return acc;
  }, {});

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          <Wrench size={20} style={{ color: B.blueLight }} />
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>
            Recovery Workbench
          </h1>
        </div>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          Pending/failed transactions grouped by service — recheck pulls fresh status from the
          provider (same recheck a retailer can trigger themselves, but from here for any user).
        </p>

        <div className="mt-4 flex gap-2">
          {(["pending", "failed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className="rounded-xl px-3 py-2 text-sm font-semibold capitalize"
              style={status === s ? { background: B.badgeGrad, color: "#fff" } : { background: B.secondary, color: B.blueMid }}
            >
              {s} ({status === s ? rows.length : "…"})
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {loading && (
            <p className="py-8 text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          )}
          {!loading && rows.length === 0 && (
            <div className="rounded-2xl border bg-white px-4 py-10 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
              No {status} transactions right now.
            </div>
          )}
          {!loading &&
            Object.entries(grouped).map(([serviceName, txns]) => (
              <div key={serviceName} className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
                <div className="border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ borderColor: B.border, background: B.secondary, color: B.muted }}>
                  {serviceName} ({txns.length})
                </div>
                {txns.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0" style={{ borderColor: B.border }}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs" style={{ color: B.blue }}>
                          {t.txnRef}
                        </span>
                        <Badge status={t.status} />
                      </div>
                      <div className="text-xs" style={{ color: B.muted }}>
                        {t.userName} ({t.userUid}) · {new Date(t.createdAt).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <span className="font-semibold" style={{ color: B.blue }}>
                      ₹{Number(t.amount).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      disabled={rechecking === t.id}
                      onClick={() => void recheck(t)}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ borderColor: B.blueLight, color: B.blueLight }}
                    >
                      <RefreshCw size={12} className={rechecking === t.id ? "animate-spin" : ""} />
                      Recheck
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>
    </AdminShell>
  );
}

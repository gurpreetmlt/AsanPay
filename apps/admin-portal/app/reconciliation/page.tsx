"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AlertTriangle, ScaleIcon } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface MismatchRow {
  id: string;
  txnRef: string;
  ourStatus: string;
  amount: string;
  createdAt: string;
  userName: string;
  userUid: string;
  serviceName: string;
  providerStatus: string | null;
  providerCode: string | null;
  providerLoggedAt: string | null;
}

function statusColor(status: string) {
  if (status === "success") return "#16a34a";
  if (status === "failed") return "#dc2626";
  return "#b45309";
}

export default function ReconciliationPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rows, setRows] = useState<MismatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await fetchApi<MismatchRow[]>("/admin/reconciliation", { limit: "100" }));
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Server did not respond";
      const full = `Could not load transaction reconciliation: ${msg}. Refresh the page to retry.`;
      setRows([]);
      setLoadError(full);
      toast.error(full);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  const trueMismatches = rows.filter((r) => r.providerStatus && r.providerStatus !== r.ourStatus);
  const pendingOnly = rows.filter((r) => !r.providerStatus || r.providerStatus === r.ourStatus);

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="mb-5">
          <SectionTabs group="reports" />
        </div>
        <div className="flex items-center gap-2">
          <ScaleIcon size={20} style={{ color: B.blueLight }} />
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>
            Txn reconciliation
          </h1>
        </div>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          Compare our transaction status with the provider&apos;s last response. Read-only —
          mismatches need manual review; nothing auto-resolves here.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border, background: B.card }}>
            <div className="text-2xl font-bold" style={{ color: "#dc2626" }}>
              {trueMismatches.length}
            </div>
            <div className="text-xs" style={{ color: B.muted }}>
              Status mismatches (our status ≠ provider status)
            </div>
          </div>
          <div className="rounded-xl border px-4 py-3" style={{ borderColor: B.border, background: B.card }}>
            <div className="text-2xl font-bold" style={{ color: "#b45309" }}>
              {pendingOnly.length}
            </div>
            <div className="text-xs" style={{ color: B.muted }}>
              Still pending (no disagreement yet, just unresolved)
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs uppercase tracking-wider"
                  style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
                >
                  <th className="px-4 py-3 font-semibold">Txn</th>
                  <th className="px-4 py-3 font-semibold">Retailer</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Our Status</th>
                  <th className="px-4 py-3 font-semibold">Provider Status</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && loadError && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "#dc2626" }}>
                      {loadError}
                    </td>
                  </tr>
                )}
                {!loading && !loadError && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      Nothing to reconcile — everything matches ✅
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r) => {
                    const mismatch = r.providerStatus && r.providerStatus !== r.ourStatus;
                    return (
                      <tr key={r.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {mismatch && <AlertTriangle size={13} style={{ color: "#dc2626" }} />}
                            <span className="font-mono text-xs" style={{ color: B.blue }}>
                              {r.txnRef}
                            </span>
                          </div>
                          <div className="text-xs" style={{ color: B.muted }}>
                            {r.serviceName}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div style={{ color: B.blue }}>{r.userName}</div>
                          <div className="font-mono text-xs" style={{ color: B.muted }}>
                            {r.userUid}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold" style={{ color: B.blue }}>
                          ₹{Number(r.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ background: `${statusColor(r.ourStatus)}1a`, color: statusColor(r.ourStatus) }}
                          >
                            {r.ourStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.providerStatus ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ background: `${statusColor(r.providerStatus)}1a`, color: statusColor(r.providerStatus) }}
                            >
                              {r.providerStatus} {r.providerCode ? `(${r.providerCode})` : ""}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: B.muted }}>
                              No provider log yet
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                          {new Date(r.createdAt).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

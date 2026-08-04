"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type StatusFilter = "" | "success" | "failed" | "pending";

interface AdminTxn {
  id: string;
  txnRef: string;
  amount: string;
  status: string;
  userId: string;
  userName: string;
  userUid: string;
  userRole: string;
  serviceName: string;
  serviceCode: string;
  createdAt: string;
  failureReason: string | null;
}

const TABS: { key: StatusFilter; label: string }[] = [
  { key: "", label: "All" },
  { key: "success", label: "Success" },
  { key: "failed", label: "Failed" },
  { key: "pending", label: "Pending" },
];

export default function TransactionsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [status, setStatus] = useState<StatusFilter>("");
  const [rows, setRows] = useState<AdminTxn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      setRows(await fetchApi<AdminTxn[]>("/admin/transactions", params));
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

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Transactions
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Network-wide transaction ledger
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key || "all"}
              type="button"
              onClick={() => setStatus(t.key)}
              className="rounded-xl px-3 py-2 text-sm font-semibold transition"
              style={
                status === t.key
                  ? { background: B.badgeGrad, color: "#fff" }
                  : { background: B.secondary, color: B.blueMid }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Desktop table */}
        <div
          className="hidden overflow-hidden rounded-2xl border bg-white md:block"
          style={{ borderColor: B.border }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs uppercase tracking-wider"
                  style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
                >
                  <th className="px-4 py-3 font-semibold">Txn Ref</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
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
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      No transactions
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((t) => (
                    <tr key={t.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: B.blue }}>
                        {t.txnRef}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: B.blue }}>
                          {t.userName}
                        </div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          {t.userUid} · {ROLE_LABEL[t.userRole] ?? t.userRole}
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: B.blueMid }}>
                        {t.serviceName}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: B.blue }}>
                        ₹{Number(t.amount).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: B.muted }}>
                        {new Date(t.createdAt).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="grid gap-4 md:hidden">
          {loading && (
            <p className="text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          )}
          {!loading && rows.length === 0 && (
            <div
              className="rounded-2xl border bg-white px-4 py-8 text-center text-sm"
              style={{ borderColor: B.border, color: B.muted }}
            >
              No transactions
            </div>
          )}
          {!loading &&
            rows.map((t) => (
              <div key={t.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs" style={{ color: B.blue }}>
                      {t.txnRef}
                    </p>
                    <p className="mt-1 truncate font-semibold" style={{ color: B.blue }}>
                      {t.userName}
                    </p>
                    <p className="text-xs" style={{ color: B.muted }}>
                      {t.serviceName}
                    </p>
                  </div>
                  <Badge status={t.status} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-semibold tabular-nums" style={{ color: B.blue }}>
                    ₹{Number(t.amount).toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs" style={{ color: B.muted }}>
                    {new Date(t.createdAt).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </AdminShell>
  );
}

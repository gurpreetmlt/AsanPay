"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, RefreshCcw } from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { FundRequestForm } from "@/components/dashboard/FundRequestForm";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface FundRequestRow {
  id: string;
  amount: string;
  paymentMode: string;
  referenceNumber: string | null;
  status: string;
  displayStatus: string;
  submittedAt: string;
  creditedAmount: string | null;
}

function formatInr(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `₹${amount}`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function FundRequestPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<FundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<FundRequestRow[]>("/fund-requests", { status: "all", limit: 30 }));
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load fund requests"));
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
    if (user?.role && user.role !== "retailer") {
      toast.error("Fund requests are for retailers only");
      router.replace("/wallet");
      return;
    }
    void load();
  }, [hydrated, accessToken, user?.role, router, load]);

  if (!hydrated || !accessToken) return null;
  if (user?.role && user.role !== "retailer") return null;

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Fund request
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Deposit to company bank, then submit UTR and receipt for balance credit
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: B.secondary, color: B.blueMid }}
            >
              <RefreshCcw size={15} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white"
              style={{ background: B.badgeGrad }}
            >
              <PlusCircle size={15} />
              New request
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs uppercase tracking-wider"
                style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
              >
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Mode / UTR</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                    No fund requests yet — tap New request after you deposit
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                    <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: B.blue }}>
                      {formatInr(r.amount)}
                      {r.creditedAmount && (
                        <div className="text-xs font-normal" style={{ color: B.green }}>
                          Credited {formatInr(r.creditedAmount)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: B.muted }}>
                      <div className="uppercase">{r.paymentMode.replace("_", " ")}</div>
                      <div className="font-mono">{r.referenceNumber || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: B.blueMid }}>
                      {r.displayStatus || r.status}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: B.muted }}>
                      {new Date(r.submittedAt).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <FundRequestForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}
    </AppShell>
  );
}

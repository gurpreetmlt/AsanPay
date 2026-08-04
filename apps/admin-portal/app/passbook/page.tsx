"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface LedgerEntry {
  id: string;
  walletType: string;
  entryType: "debit" | "credit";
  amount: string;
  balanceAfter: string;
  referenceType: string;
  description: string | null;
  createdAt: string;
}

export default function PassbookPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    fetchApi<LedgerEntry[]>("/wallet/ledger", { limit: 50 })
      .then(setEntries)
      .catch(() => toast.error("Failed to load passbook"))
      .finally(() => setLoading(false));
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Balance statement
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Credits and debits on the company balance
          </p>
        </div>

        {loading && (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        )}
        {!loading && entries.length === 0 && (
          <p className="text-sm" style={{ color: B.muted }}>
            No transactions yet.
          </p>
        )}

        <div className="space-y-2">
          {entries.map((entry) => {
            const credit = entry.entryType === "credit";
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-2xl border bg-white p-4"
                style={{ borderColor: B.border }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{
                      background: credit ? `${B.green}18` : `${B.danger}15`,
                      color: credit ? B.greenDark : B.danger,
                    }}
                  >
                    {credit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: B.blue }}>
                      {entry.description || entry.referenceType.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs" style={{ color: B.muted }}>
                      {new Date(entry.createdAt).toLocaleString("en-IN")} ·{" "}
                      {entry.walletType === "main"
                        ? "Main"
                        : entry.walletType === "aeps"
                          ? "AEPS"
                          : entry.walletType}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: credit ? B.greenDark : B.danger }}
                  >
                    {credit ? "+" : "-"}₹{Number(entry.amount).toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs" style={{ color: B.muted }}>
                    Bal: ₹{Number(entry.balanceAfter).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}

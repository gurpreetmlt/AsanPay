"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import type { LedgerEntry } from "@/lib/types";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

function formatInr(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function StatementsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchApi<LedgerEntry[]>("/wallet/ledger", { limit: 100, offset: 0 });
        if (alive) setLedger(data);
      } catch (err) {
        toast.error(extractApiError(err, "Failed to load statement"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken]);

  if (!hydrated || !accessToken) return null;

  const credits = ledger.filter((e) => e.entryType === "credit").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const debits = ledger.filter((e) => e.entryType === "debit").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const latestBal = ledger[0]?.balanceAfter;

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Statements
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Wallet ledger / passbook
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: B.badgeGrad }}
            onClick={() => toast("PDF download coming soon")}
          >
            <Download size={15} /> Download
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: "Entries", value: `${ledger.length}`, sub: "Loaded" },
            { label: "Total Credits", value: formatInr(credits), sub: "In period" },
            { label: "Total Debits", value: formatInr(debits), sub: latestBal ? `Bal after latest: ${formatInr(latestBal)}` : "—" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
                {s.label}
              </div>
              <div className="text-2xl font-bold" style={{ color: B.blue }}>
                {s.value}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: B.muted }}>
                {s.sub}
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          <div className="border-b px-5 py-4" style={{ borderColor: B.border }}>
            <h2 className="font-bold" style={{ color: B.blue }}>
              Ledger statement
            </h2>
          </div>
          {loading && ledger.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : ledger.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm" style={{ color: B.muted }}>
              No ledger entries yet
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: B.secondary }}>
                <tr>
                  {["Date", "Reference", "Description", "Type", "Amount", "Balance After"].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${
                        h === "Amount" || h === "Balance After" ? "text-right" : "text-left"
                      }`}
                      style={{ color: B.muted }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-secondary/30" style={{ borderColor: B.border }}>
                    <td className="px-5 py-3 text-xs" style={{ color: B.muted }}>
                      {new Date(e.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: B.muted }}>
                      {e.referenceId ?? e.referenceType}
                    </td>
                    <td className="px-5 py-3 font-semibold" style={{ color: B.blue }}>
                      {e.description || e.referenceType}
                      <div className="text-xs font-normal uppercase" style={{ color: B.muted }}>
                        {e.walletType}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
                        style={
                          e.entryType === "credit"
                            ? { background: `${B.green}18`, color: B.green }
                            : { background: "#DC262618", color: "#DC2626" }
                        }
                      >
                        {e.entryType}
                      </span>
                    </td>
                    <td
                      className="px-5 py-3 text-right font-bold"
                      style={{ color: e.entryType === "credit" ? B.green : "#DC2626" }}
                    >
                      {e.entryType === "credit" ? "+" : "−"}
                      {formatInr(e.amount)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: B.blue }}>
                      {formatInr(e.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}

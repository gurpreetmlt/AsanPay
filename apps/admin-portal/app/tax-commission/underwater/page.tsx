"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type UnderwaterScheme = {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  providerId: string | null;
  providerName: string | null;
  probeAmount: string;
  providerPool: string;
  totalGross: string;
  shortfall: string;
  schemesHref: string;
};

type UnderwaterTxn = {
  transactionId: string;
  txnRef: string;
  createdAt: string;
  amount: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  totalGross: string;
  providerPool: string;
  shortfall: string;
  schemesHref: string;
};

type UnderwaterReport = {
  date: string;
  providerPoolPercent: string;
  probeAmount: string;
  summary: { underwaterSchemeCount: number; underwaterTxnCount: number };
  schemes: UnderwaterScheme[];
  txns: UnderwaterTxn[];
};

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TaxCommissionUnderwaterPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [date, setDate] = useState(todayYmd());
  const [poolPct, setPoolPct] = useState("1");
  const [probeAmount, setProbeAmount] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<UnderwaterReport | null>(null);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const load = useCallback(async () => {
    if (!poolPct.trim()) {
      toast.error("Enter provider pool percent (0–100)");
      return;
    }
    setLoading(true);
    try {
      setReport(
        await fetchApi<UnderwaterReport>("/admin/commission/underwater-report", {
          date,
          providerPoolPercent: poolPct.trim(),
          probeAmount: probeAmount.trim() || "1000",
          limit: "50",
        }),
      );
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(ax?.response?.data?.message || ax?.message || "Failed to load underwater report");
    } finally {
      setLoading(false);
    }
  }, [date, poolPct, probeAmount]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="taxCommission" />

        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Underwater ops
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Schemes and transactions where scheme gross exceeds the provider pool % of amount (same idea as
            scheme preview).
          </p>
        </div>

        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              Date (IST)
            </span>
            <input
              type="date"
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              Provider pool %
            </span>
            <input
              className="w-28 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
              value={poolPct}
              onChange={(e) => setPoolPct(e.target.value)}
              placeholder="e.g. 1"
              inputMode="decimal"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              Scheme probe amount (₹)
            </span>
            <input
              className="w-32 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
              value={probeAmount}
              onChange={(e) => setProbeAmount(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: B.badgeGrad }}
          >
            Apply
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-white px-4 py-4" style={{ borderColor: B.border }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
              Underwater schemes
            </p>
            <p className="mt-2 text-2xl font-extrabold" style={{ color: "#B91C1C" }}>
              {loading ? "…" : (report?.summary.underwaterSchemeCount ?? 0)}
            </p>
          </div>
          <div className="rounded-2xl border bg-white px-4 py-4" style={{ borderColor: B.border }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
              Underwater txns (top 50)
            </p>
            <p className="mt-2 text-2xl font-extrabold" style={{ color: "#B91C1C" }}>
              {loading ? "…" : (report?.summary.underwaterTxnCount ?? 0)}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Schemes over pool
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !report?.schemes.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No underwater schemes at probe ₹{report?.probeAmount ?? probeAmount} with pool{" "}
              {report?.providerPoolPercent ?? poolPct}%.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">Service</th>
                    <th className="py-2 pr-3 font-semibold">Provider</th>
                    <th className="py-2 pr-3 font-semibold text-right">Gross</th>
                    <th className="py-2 pr-3 font-semibold text-right">Pool</th>
                    <th className="py-2 pr-3 font-semibold text-right">Shortfall</th>
                    <th className="py-2 font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {report.schemes.map((row) => (
                    <tr
                      key={`${row.serviceId}-${row.providerId ?? "default"}`}
                      className="border-b last:border-0"
                      style={{ borderColor: B.border }}
                    >
                      <td className="py-3 pr-3">
                        <div className="font-medium" style={{ color: B.blue }}>
                          {row.serviceName}
                        </div>
                        <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                          {row.serviceCode}
                        </div>
                      </td>
                      <td className="py-3 pr-3" style={{ color: B.muted }}>
                        {row.providerName ?? "Default"}
                      </td>
                      <td className="py-3 pr-3 text-right">₹{row.totalGross}</td>
                      <td className="py-3 pr-3 text-right">₹{row.providerPool}</td>
                      <td className="py-3 pr-3 text-right font-semibold" style={{ color: "#B91C1C" }}>
                        ₹{row.shortfall}
                      </td>
                      <td className="py-3">
                        <Link
                          href={row.schemesHref}
                          className="text-sm font-bold underline-offset-2 hover:underline"
                          style={{ color: B.blue }}
                        >
                          Open scheme
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Underwater transactions
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !report?.txns.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No underwater commission transactions for {report?.date ?? date}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">When</th>
                    <th className="py-2 pr-3 font-semibold">Txn</th>
                    <th className="py-2 pr-3 font-semibold">Service</th>
                    <th className="py-2 pr-3 font-semibold text-right">Amount</th>
                    <th className="py-2 pr-3 font-semibold text-right">Gross</th>
                    <th className="py-2 pr-3 font-semibold text-right">Pool</th>
                    <th className="py-2 pr-3 font-semibold text-right">Shortfall</th>
                    <th className="py-2 font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {report.txns.map((row) => (
                    <tr key={row.transactionId} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="py-3 pr-3 whitespace-nowrap" style={{ color: B.muted }}>
                        {formatWhen(row.createdAt)}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs">{row.txnRef}</td>
                      <td className="py-3 pr-3">
                        <div>{row.serviceName}</div>
                        <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                          {row.serviceCode}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right">₹{row.amount}</td>
                      <td className="py-3 pr-3 text-right">₹{row.totalGross}</td>
                      <td className="py-3 pr-3 text-right">₹{row.providerPool}</td>
                      <td className="py-3 pr-3 text-right font-semibold" style={{ color: "#B91C1C" }}>
                        ₹{row.shortfall}
                      </td>
                      <td className="py-3">
                        <Link
                          href={row.schemesHref}
                          className="text-sm font-bold underline-offset-2 hover:underline"
                          style={{ color: B.blue }}
                        >
                          Open scheme
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

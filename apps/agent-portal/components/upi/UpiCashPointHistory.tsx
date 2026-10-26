"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import clsx from "clsx";
import { toast } from "react-hot-toast";
import { QrCode, RefreshCw, Search } from "lucide-react";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { downloadCsv } from "@/components/reports/reportUtils";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { downloadBrandedExcel, openBrandedPdf, type BrandedReport } from "@/lib/brandedExport";
import { extractApiError } from "@/lib/onboarding";
import type { TxnRow } from "@/lib/types";
import { formatInr } from "@/lib/walletLabels";

const UPI_CP_CODES = new Set(["UPI_CASH_POINT", "UPI_QR", "UPIQR"]);

type Range = "today" | "yesterday" | "7d" | "all";
type StatusFilter = "all" | "success" | "pending" | "failed";

const RANGES: [Range, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "Last 7 days"],
  ["all", "All"],
];

function statusBucket(status: string): Exclude<StatusFilter, "all"> {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return "success";
  if (s === "failed" || s === "reversed" || s === "refunded") return "failed";
  return "pending";
}

function inRange(iso: string, range: Range): boolean {
  if (range === "all") return true;
  const at = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  if (range === "today") return at >= startOfToday;
  if (range === "yesterday") return at >= new Date(startOfToday.getTime() - day) && at < startOfToday;
  return at >= new Date(startOfToday.getTime() - 6 * day);
}

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function customerMobile(row: TxnRow): string {
  const m = row.metadata?.mobileNumber ?? row.metadata?.customerMobile;
  if (typeof m !== "string" || m.length < 4) return "—";
  return `XXXXXX${m.slice(-4)}`;
}

function bankRrn(row: TxnRow): string {
  const provider = row.metadata?.provider as Record<string, unknown> | undefined;
  return typeof provider?.rrn === "string" && provider.rrn ? provider.rrn : "—";
}

function StatusPill({ status }: { status: string }) {
  const bucket = statusBucket(status);
  const map = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending: "bg-amber-50 text-amber-800 ring-amber-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
  } as const;
  const label = bucket === "success" ? "Success" : bucket === "pending" ? "Pending" : "Failed";
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", map[bucket])}>
      {label}
    </span>
  );
}

export type UpiCashPointHistoryHandle = { reload: () => void };

export const UpiCashPointHistory = forwardRef<UpiCashPointHistoryHandle>(function UpiCashPointHistory(_, ref) {
  const [allRows, setAllRows] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("7d");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<TxnRow[]>("/txn", { limit: 100, offset: 0 });
      setAllRows((data ?? []).filter((r) => UPI_CP_CODES.has(r.serviceCode)));
    } catch (err) {
      toast.error(extractApiError(err, "Could not load UPI Cash Point transactions. Try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useImperativeHandle(ref, () => ({ reload: () => void load() }), [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!inRange(r.createdAt, range)) return false;
      if (statusFilter !== "all" && statusBucket(r.status) !== statusFilter) return false;
      if (!q) return true;
      return (
        r.txnRef.toLowerCase().includes(q) ||
        bankRrn(r).toLowerCase().includes(q) ||
        customerMobile(r).includes(q)
      );
    });
  }, [allRows, range, statusFilter, query]);

  const successTotal = rows
    .filter((r) => statusBucket(r.status) === "success")
    .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  const header = ["Date / Time", "Txn ID", "Customer", "Amount", "Status", "Bank RRN"];
  const exportRows = () =>
    rows.map((r) => [
      formatAt(r.createdAt),
      r.txnRef,
      customerMobile(r),
      formatInr(r.amount),
      statusBucket(r.status),
      bankRrn(r),
    ]);

  function buildReport(): BrandedReport {
    return {
      title: "UPI Cash Point transactions",
      fileName: "upi-cash-point-transactions",
      meta: [{ label: "Range", value: RANGES.find(([id]) => id === range)?.[1] ?? range }],
      summary: [
        { label: "Rows", value: String(rows.length), tone: "neutral" },
        { label: "Successful amount", value: formatInr(successTotal), tone: "neutral" },
      ],
      columns: [
        { label: "Date / Time" },
        { label: "Txn ID" },
        { label: "Customer" },
        { label: "Amount", align: "right" },
        { label: "Status" },
        { label: "Bank RRN" },
      ],
      rows: rows.map((r) => {
        const bucket = statusBucket(r.status);
        return [
          { text: formatAt(r.createdAt) },
          { text: r.txnRef, mono: true },
          { text: customerMobile(r), mono: true },
          { text: formatInr(r.amount), align: "right" },
          {
            text: bucket === "success" ? "Success" : bucket === "pending" ? "Pending" : "Failed",
            tone: bucket === "success" ? "approved" : bucket === "pending" ? "requested" : "rejected",
          },
          { text: bankRrn(r), mono: true },
        ];
      }),
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
          Recent transactions
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <section className="rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
        <div
          className="flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-end lg:justify-between"
          style={{ borderColor: B.border }}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Service activity</p>
            <h3 className="mt-0.5 text-lg font-extrabold text-gray-900">Transaction history</h3>
            <p className="mt-1 text-xs text-gray-500">
              {rows.length} transaction{rows.length === 1 ? "" : "s"} · {formatInr(successTotal)} successful
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {RANGES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRange(id)}
                className={clsx(
                  "cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold transition",
                  range === id ? "text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                )}
                style={range === id ? { background: B.blue } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex flex-col gap-3 border-b px-5 py-3 lg:flex-row lg:items-center lg:justify-between"
          style={{ borderColor: B.border }}
        >
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Txn ID, bank RRN or mobile last 4"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-300"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700"
            >
              <option value="all">Status: All</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="icon-tooltip flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              aria-label="Refresh transactions"
              data-tooltip="Refresh"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : undefined} />
            </button>
          </div>
          <ExportMenu
            disabled={rows.length === 0}
            onPdf={() => {
              if (!openBrandedPdf(buildReport())) toast.error("Allow pop-ups for this site to export the PDF");
            }}
            onExcel={() => downloadBrandedExcel(buildReport())}
            onCsv={() => downloadCsv("upi-cash-point-transactions.csv", header, exportRows())}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr
                className="border-b bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500"
                style={{ borderColor: B.border }}
              >
                <th className="px-5 py-3">Date / Time</th>
                <th className="px-3 py-3">Txn ID</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-5 py-3">Bank RRN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 hover:bg-slate-50/80"
                  style={{ borderColor: B.border }}
                >
                  <td className="whitespace-nowrap px-5 py-3.5 font-medium text-gray-700">{formatAt(r.createdAt)}</td>
                  <td className="px-3 py-3.5 font-mono text-xs text-gray-700">{r.txnRef}</td>
                  <td className="px-3 py-3.5 tabular-nums text-gray-600">{customerMobile(r)}</td>
                  <td className="px-3 py-3.5 font-bold tabular-nums text-gray-900">{formatInr(r.amount)}</td>
                  <td className="px-3 py-3.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-600">{bankRrn(r)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-full"
                        style={{ background: `${B.blue}10`, color: B.blue }}
                      >
                        <QrCode size={20} />
                      </span>
                      <p className="text-sm font-semibold text-gray-700">
                        {allRows.length === 0
                          ? "No UPI Cash Point transactions yet"
                          : "No transactions match these filters"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {allRows.length === 0
                          ? "Paid QR withdrawals will be listed here with their status and bank RRN."
                          : "Change the date range or clear the search and try again."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                    Loading transactions…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
});

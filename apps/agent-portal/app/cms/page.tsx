"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { toast } from "react-hot-toast";
import { Building2, ExternalLink, Loader2, PlayCircle, RefreshCw, Wallet, X } from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { downloadCsv } from "@/components/reports/reportUtils";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { downloadBrandedExcel, openBrandedPdf, type BrandedReport } from "@/lib/brandedExport";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { formatInr } from "@/lib/walletLabels";

type CmsProvider = { code: string; name: string; description: string; accent: string };
type CmsStatus = "initiated" | "pending" | "success" | "failed";
type CmsTxn = {
  id: string;
  provider: string;
  providerName: string;
  transactionId: string;
  status: CmsStatus;
  amount: string | null;
  utr: string | null;
  billerName: string | null;
  createdAt: string;
};
type OpenCms = { url: string; transactionId: string; providerName: string };

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

const STATUS_LABEL: Record<CmsStatus, string> = {
  initiated: "Initiated",
  pending: "Pending",
  success: "Success",
  failed: "Failed",
};

function StatusPill({ status }: { status: CmsStatus }) {
  const map: Record<CmsStatus, string> = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending: "bg-amber-50 text-amber-800 ring-amber-200",
    initiated: "bg-slate-50 text-slate-600 ring-slate-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
  };
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", map[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function CmsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [providers, setProviders] = useState<CmsProvider[]>([]);
  const [startingCode, setStartingCode] = useState("");
  const [openCms, setOpenCms] = useState<OpenCms | null>(null);
  const [from, setFrom] = useState(todayYmd);
  const [to, setTo] = useState(todayYmd);
  const [rows, setRows] = useState<CmsTxn[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState("");

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const loadRows = useCallback(async (f: string, t: string) => {
    if (f > t) {
      toast.error("From date must be on or before To date");
      return;
    }
    setLoading(true);
    try {
      setRows((await fetchApi<CmsTxn[]>("/noble/cms/transactions", { from: f, to: t })) ?? []);
    } catch (err) {
      toast.error(extractApiError(err, "Could not load cash collection transactions. Try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    fetchApi<CmsProvider[]>("/noble/cms/providers")
      .then((p) => setProviders(p ?? []))
      .catch((err) => toast.error(extractApiError(err, "Could not load cash collection providers. Refresh the page.")));
    void loadRows(todayYmd(), todayYmd());
  }, [hydrated, accessToken, loadRows]);

  async function initiate(p: CmsProvider) {
    if (startingCode) return;
    setStartingCode(p.code);
    try {
      const { data } = await api.post<ApiResponse<CmsTxn & { redirectionUrl: string }>>("/noble/cms/start", {
        provider: p.code,
      });
      if (!data.success) throw new Error(data.message);
      setOpenCms({ url: data.data.redirectionUrl, transactionId: data.data.transactionId, providerName: p.name });
    } catch (err) {
      toast.error(extractApiError(err, `Could not start ${p.name}. Try again.`));
    } finally {
      setStartingCode("");
    }
  }

  async function checkStatus(transactionId: string, quiet = false) {
    setCheckingId(transactionId);
    try {
      const { data } = await api.post<ApiResponse<CmsTxn>>("/noble/cms/status", { transactionId });
      if (!data.success) throw new Error(data.message);
      setRows((prev) => {
        const exists = prev.some((r) => r.transactionId === transactionId);
        return exists
          ? prev.map((r) => (r.transactionId === transactionId ? data.data : r))
          : [data.data, ...prev];
      });
      if (!quiet) toast.success(`Status: ${STATUS_LABEL[data.data.status]}`);
    } catch (err) {
      if (!quiet) toast.error(extractApiError(err, "Could not fetch the cash collection status. Try again."));
    } finally {
      setCheckingId("");
    }
  }

  function closeCms() {
    const tid = openCms?.transactionId;
    setOpenCms(null);
    if (tid) {
      setFrom(todayYmd());
      setTo(todayYmd());
      void loadRows(todayYmd(), todayYmd()).then(() => checkStatus(tid, true));
    }
  }

  const successTotal = rows
    .filter((r) => r.status === "success")
    .reduce((sum, r) => sum + (parseFloat(r.amount ?? "0") || 0), 0);

  const header = ["Date / Time", "Provider", "Txn ID", "Company", "Amount", "Status", "UTR"];
  const exportRows = () =>
    rows.map((r) => [
      formatAt(r.createdAt),
      r.providerName,
      r.transactionId,
      r.billerName ?? "",
      r.amount ? formatInr(r.amount) : "",
      STATUS_LABEL[r.status],
      r.utr ?? "",
    ]);

  function buildReport(): BrandedReport {
    return {
      title: "Cash collection transactions",
      fileName: "cash-collection-transactions",
      meta: [{ label: "Range", value: `${from} to ${to}` }],
      summary: [
        { label: "Rows", value: String(rows.length), tone: "neutral" },
        { label: "Successful amount", value: formatInr(successTotal), tone: "neutral" },
      ],
      columns: [
        { label: "Date / Time" },
        { label: "Provider" },
        { label: "Txn ID" },
        { label: "Company" },
        { label: "Amount", align: "right" },
        { label: "Status" },
        { label: "UTR" },
      ],
      rows: rows.map((r) => [
        { text: formatAt(r.createdAt) },
        { text: r.providerName },
        { text: r.transactionId, mono: true },
        { text: r.billerName ?? "—" },
        { text: r.amount ? formatInr(r.amount) : "—", align: "right" },
        {
          text: STATUS_LABEL[r.status],
          tone: r.status === "success" ? "approved" : r.status === "failed" ? "rejected" : "requested",
        },
        { text: r.utr ?? "—", mono: true },
      ]),
    };
  }

  const dateInput =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-800 outline-none focus:border-blue-300";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5 pb-10">
        <div>
          <h1 className="text-xl font-extrabold" style={{ color: B.blue }}>
            Cash Management
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Pick a provider and tap Initiate. The collection page opens right here in the portal.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <div
              key={p.code}
              className="flex items-center gap-4 rounded-2xl p-4 text-white shadow-md"
              style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent}cc)` }}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white">
                <Building2 size={26} style={{ color: p.accent }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-extrabold">{p.name}</p>
                <p className="truncate text-xs text-white/85">{p.description}</p>
              </div>
              <button
                type="button"
                onClick={() => void initiate(p)}
                disabled={!!startingCode}
                className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-bold shadow-sm transition hover:shadow disabled:opacity-60"
                style={{ color: p.accent }}
              >
                {startingCode === p.code ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                Initiate
              </button>
            </div>
          ))}
          {providers.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-gray-500" style={{ borderColor: B.border }}>
              Loading providers…
            </div>
          ) : null}
        </div>

        <section className="rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
          <div className="border-b px-5 py-4" style={{ borderColor: B.border }}>
            <h2 className="text-lg font-extrabold text-gray-900">CMS Transactions</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {rows.length} transaction{rows.length === 1 ? "" : "s"} · {formatInr(successTotal)} successful
            </p>
          </div>
          <div
            className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-end"
            style={{ borderColor: B.border }}
          >
            <label className="block md:w-48">
              <span className="mb-1 block text-xs font-semibold text-gray-600">From Date</span>
              <input type="date" className={dateInput} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block md:w-48">
              <span className="mb-1 block text-xs font-semibold text-gray-600">To Date</span>
              <input
                type="date"
                className={dateInput}
                value={to}
                min={from}
                max={todayYmd()}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <PrimaryButton type="button" variant="primary" disabled={loading} onClick={() => void loadRows(from, to)}>
              {loading ? "Fetching…" : "Fetch Data"}
            </PrimaryButton>
            <div className="md:ml-auto">
              <ExportMenu
                disabled={rows.length === 0}
                onPdf={() => {
                  if (!openBrandedPdf(buildReport())) toast.error("Allow pop-ups for this site to export the PDF");
                }}
                onExcel={() => downloadBrandedExcel(buildReport())}
                onCsv={() => downloadCsv("cash-collection-transactions.csv", header, exportRows())}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr
                  className="border-b bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500"
                  style={{ borderColor: B.border }}
                >
                  <th className="px-5 py-3">Date / Time</th>
                  <th className="px-3 py-3">Provider</th>
                  <th className="px-3 py-3">Txn ID</th>
                  <th className="px-3 py-3">Company</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">UTR</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/80" style={{ borderColor: B.border }}>
                    <td className="whitespace-nowrap px-5 py-3.5 font-medium text-gray-700">{formatAt(r.createdAt)}</td>
                    <td className="px-3 py-3.5 text-gray-700">{r.providerName}</td>
                    <td className="px-3 py-3.5 font-mono text-xs text-gray-700">{r.transactionId}</td>
                    <td className="px-3 py-3.5 text-gray-600">{r.billerName || "—"}</td>
                    <td className="px-3 py-3.5 font-bold tabular-nums text-gray-900">
                      {r.amount ? formatInr(r.amount) : "—"}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs text-gray-600">{r.utr || "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      {r.status === "initiated" || r.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => void checkStatus(r.transactionId)}
                          disabled={checkingId === r.transactionId}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <RefreshCw size={13} className={checkingId === r.transactionId ? "animate-spin" : undefined} />
                          Check status
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-full"
                          style={{ background: `${B.blue}10`, color: B.blue }}
                        >
                          <Wallet size={20} />
                        </span>
                        <p className="text-sm font-semibold text-gray-700">No cash collections in this date range</p>
                        <p className="text-xs text-gray-500">Change the dates and tap Fetch Data, or start one above.</p>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                      Loading transactions…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {openCms ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6">
          <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: B.blue }}>
              <p className="flex-1 truncate text-sm font-bold">{openCms.providerName}</p>
              <a
                href={openCms.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-white/90 hover:bg-white/10"
              >
                <ExternalLink size={14} />
                Open in new window
              </a>
              <button
                type="button"
                onClick={closeCms}
                className="flex cursor-pointer items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25"
              >
                <X size={14} />
                Close
              </button>
            </div>
            <iframe
              src={openCms.url}
              title={openCms.providerName}
              className="w-full flex-1 border-0"
              allow="camera; geolocation; clipboard-write"
            />
            <p className="border-t px-4 py-2 text-[11px] text-gray-500" style={{ borderColor: B.border }}>
              Page blank? Use Open in new window. Close this window when done — the status updates automatically.
            </p>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

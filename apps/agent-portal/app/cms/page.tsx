"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  PlayCircle,
  ReceiptText,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";
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
type OpenCms = { url: string; transactionId: string; provider: CmsProvider };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayYmd(): string {
  return ymd(new Date());
}

function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: "today", label: "Today", range: () => [todayYmd(), todayYmd()] },
  { id: "yesterday", label: "Yesterday", range: () => [daysAgoYmd(1), daysAgoYmd(1)] },
  { id: "7d", label: "Last 7 days", range: () => [daysAgoYmd(6), todayYmd()] },
  { id: "month", label: "This month", range: () => [`${todayYmd().slice(0, 7)}-01`, todayYmd()] },
];

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

const STATUS_STYLE: Record<CmsStatus, { pill: string; dot: string }> = {
  success: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  pending: { pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  initiated: { pill: "bg-slate-50 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  failed: { pill: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
};

function StatusPill({ status }: { status: CmsStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1",
        STATUS_STYLE[status].pill,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", STATUS_STYLE[status].dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 shadow-sm" style={{ borderColor: B.border }}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${tone}14`, color: tone }}
      >
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="truncate text-lg font-extrabold tabular-nums text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function CmsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [providers, setProviders] = useState<CmsProvider[] | null>(null);
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
      .catch((err) => {
        setProviders([]);
        toast.error(extractApiError(err, "Could not load cash collection providers. Refresh the page."));
      });
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
      setOpenCms({ url: data.data.redirectionUrl, transactionId: data.data.transactionId, provider: p });
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      setRows((prev) =>
        prev.some((r) => r.transactionId === transactionId)
          ? prev.map((r) => (r.transactionId === transactionId ? data.data : r))
          : [data.data, ...prev],
      );
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
    if (!tid) return;
    setFrom(todayYmd());
    setTo(todayYmd());
    void loadRows(todayYmd(), todayYmd()).then(() => checkStatus(tid, true));
  }

  function applyPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const [f, t] = preset.range();
    setFrom(f);
    setTo(t);
    void loadRows(f, t);
  }

  const activePreset = PRESETS.find((p) => {
    const [f, t] = p.range();
    return f === from && t === to;
  })?.id;

  const successTotal = rows
    .filter((r) => r.status === "success")
    .reduce((sum, r) => sum + (parseFloat(r.amount ?? "0") || 0), 0);
  const openCount = rows.filter((r) => r.status === "initiated" || r.status === "pending").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;

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

  if (openCms) {
    const accent = openCms.provider.accent;
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl pb-6">
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-white"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}d9)` }}
            >
              <button
                type="button"
                onClick={closeCms}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold transition hover:bg-white/25"
              >
                <ArrowLeft size={15} />
                Back to Cash Management
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
                  <Building2 size={17} style={{ color: accent }} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">{openCms.provider.name}</p>
                  <p className="truncate font-mono text-[11px] text-white/80">{openCms.transactionId}</p>
                </div>
              </div>
              <a
                href={openCms.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/15"
              >
                <ExternalLink size={14} />
                Open in new window
              </a>
            </div>
            <iframe
              src={openCms.url}
              title={openCms.provider.name}
              className="block w-full border-0 bg-gray-50"
              style={{ height: "calc(100vh - 230px)", minHeight: 560 }}
              allow="camera; geolocation; clipboard-write"
            />
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[11px] text-gray-500"
              style={{ borderColor: B.border }}
            >
              <span>Finish the collection, then tap Back to Cash Management — the status updates automatically.</span>
              <span>Page blank? Use Open in new window.</span>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md"
              style={{ background: B.badgeGrad }}
            >
              <Banknote size={22} />
            </span>
            <div>
              <h1 className="text-xl font-extrabold" style={{ color: B.blue }}>
                Cash Management
              </h1>
              <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
                Collect cash for partner companies. The collection page opens right here in the portal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadRows(from, to)}
            disabled={loading}
            className="icon-tooltip flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            aria-label="Refresh transactions"
            data-tooltip="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={ReceiptText} label="Collections" value={String(rows.length)} tone={B.blueLight} />
          <StatTile icon={CheckCircle2} label="Successful" value={formatInr(successTotal)} tone={B.green} />
          <StatTile icon={Clock3} label="In progress" value={String(openCount)} tone="#D97706" />
          <StatTile icon={XCircle} label="Failed" value={String(failedCount)} tone="#DC2626" />
        </div>

        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Providers</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(providers ?? []).map((p) => (
              <div
                key={p.code}
                className="relative overflow-hidden rounded-2xl p-5 text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
                style={{ background: `linear-gradient(135deg, ${p.accent} 0%, ${p.accent}c7 100%)` }}
              >
                <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
                <span className="pointer-events-none absolute -bottom-12 right-16 h-24 w-24 rounded-full bg-white/10" />
                <div className="relative flex items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Building2 size={26} style={{ color: p.accent }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-extrabold">{p.name}</p>
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        Live
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/85">{p.description}</p>
                  </div>
                </div>
                <div className="relative mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void initiate(p)}
                    disabled={!!startingCode}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-sm transition hover:shadow-md disabled:opacity-60"
                    style={{ color: p.accent }}
                  >
                    {startingCode === p.code ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                    Initiate
                  </button>
                </div>
              </div>
            ))}
            {providers === null ? (
              <div className="h-[150px] animate-pulse rounded-2xl bg-gray-200/70" />
            ) : providers.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-gray-500" style={{ borderColor: B.border }}>
                No cash collection provider is available right now. Contact support.
              </div>
            ) : null}
          </div>
        </div>

        <section className="rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
          <div
            className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: B.border }}
          >
            <div>
              <h2 className="text-lg font-extrabold text-gray-900">CMS Transactions</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {rows.length} transaction{rows.length === 1 ? "" : "s"} · {formatInr(successTotal)} successful
              </p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={clsx(
                    "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition",
                    activePreset === p.id ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-700",
                  )}
                  style={activePreset === p.id ? { color: B.blueLight } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-end"
            style={{ borderColor: B.border }}
          >
            <label className="block md:w-44">
              <span className="mb-1 block text-xs font-semibold text-gray-600">From Date</span>
              <input type="date" className={dateInput} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block md:w-44">
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
            <PrimaryButton
              type="button"
              variant="primary"
              loading={loading}
              className="md:w-auto md:px-8"
              onClick={() => void loadRows(from, to)}
            >
              Fetch Data
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
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">UTR</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/80" style={{ borderColor: B.border }}>
                    <td className="whitespace-nowrap px-5 py-3.5 font-medium text-gray-700">{formatAt(r.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-gray-800">{r.providerName}</td>
                    <td className="px-3 py-3.5 font-mono text-xs text-gray-700">{r.transactionId}</td>
                    <td className="px-3 py-3.5 text-gray-600">{r.billerName || "—"}</td>
                    <td className="px-3 py-3.5 text-right font-bold tabular-nums text-gray-900">
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
                          className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold transition hover:bg-blue-50 disabled:opacity-50"
                          style={{ borderColor: `${B.blueLight}40`, color: B.blueLight }}
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
                    <td colSpan={8} className="px-5 py-14 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                        <span
                          className="flex h-12 w-12 items-center justify-center rounded-full"
                          style={{ background: `${B.blue}10`, color: B.blue }}
                        >
                          <Wallet size={22} />
                        </span>
                        <p className="text-sm font-semibold text-gray-700">No cash collections in this date range</p>
                        <p className="text-xs text-gray-500">Pick other dates and tap Fetch Data, or start one with Initiate.</p>
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
    </AppShell>
  );
}

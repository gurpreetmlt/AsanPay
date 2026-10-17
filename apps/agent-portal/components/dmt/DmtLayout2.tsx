"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Filter,
  Info,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { B } from "@/lib/brand";
import { downloadBrandedExcel, openBrandedPdf, type BrandedReport } from "@/lib/brandedExport";
import { downloadCsv } from "@/components/reports/reportUtils";

export type DmtLayout2Beneficiary = {
  id: string;
  name: string;
  account: string;
  bank: string;
};

type HistoryRange = "today" | "yesterday" | "7d" | "custom";
type HistoryStatus = "all" | "success" | "pending" | "failed" | "refunded";

type DemoRow = {
  id: string;
  at: string;
  beneficiary: string;
  accountLast4: string;
  bank: string;
  amount: string;
  charges: string;
  status: "success" | "pending" | "failed" | "refunded";
  failReason?: string;
  orderId: string;
};

const DEMO_ROWS: DemoRow[] = [
  {
    id: "1",
    at: "15 Oct 2023, 11:05 AM",
    beneficiary: "Arun Mehta",
    accountLast4: "8042",
    bank: "HDFC Bank",
    amount: "₹8,000.00",
    charges: "₹25.00",
    status: "success",
    orderId: "ASP-DM-621890",
  },
  {
    id: "2",
    at: "15 Oct 2023, 10:22 AM",
    beneficiary: "Sneha Kapoor",
    accountLast4: "1190",
    bank: "Indian Bank",
    amount: "₹3,500.00",
    charges: "₹15.00",
    status: "pending",
    orderId: "ASP-DM-621744",
  },
  {
    id: "3",
    at: "14 Oct 2023, 07:40 PM",
    beneficiary: "Ravi Sharma",
    accountLast4: "5521",
    bank: "Axis Bank",
    amount: "₹12,000.00",
    charges: "₹30.00",
    status: "failed",
    failReason: "Beneficiary bank timed out",
    orderId: "ASP-DM-620901",
  },
  {
    id: "4",
    at: "13 Oct 2023, 03:15 PM",
    beneficiary: "Meena Devi",
    accountLast4: "3388",
    bank: "Canara Bank",
    amount: "₹2,000.00",
    charges: "₹10.00",
    status: "refunded",
    orderId: "ASP-DM-619442",
  },
];

function StatusPill({
  status,
  failReason,
}: {
  status: DemoRow["status"];
  failReason?: string;
}) {
  const map = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending: "bg-amber-50 text-amber-800 ring-amber-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
    refunded: "bg-violet-50 text-violet-700 ring-violet-200",
  } as const;
  const label =
    status === "success"
      ? "Success"
      : status === "pending"
        ? "Pending"
        : status === "failed"
          ? "Failed"
          : "Refunded";
  return (
    <div>
      <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", map[status])}>
        {label}
      </span>
      {failReason ? <p className="mt-1 text-[11px] font-medium text-red-600">{failReason}</p> : null}
    </div>
  );
}

type Props = {
  mobile: string;
  onMobileChange: (v: string) => void;
  onLookup: () => void;
  lookingUp: boolean;
  remitterLabel: string | null;
  limitLine: string | null;
  beneficiaries: DmtLayout2Beneficiary[];
  selectedBeneId: string;
  onSelectBene: (id: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  mode: "imps" | "neft";
  onModeChange: (m: "imps" | "neft") => void;
  impsAllowed: boolean;
  neftAllowed: boolean;
  earnLine: string | null;
  otpSent: boolean;
  txnOtp: string;
  onTxnOtpChange: (v: string) => void;
  txnPin: string;
  onTxnPinChange: (v: string) => void;
  txnBusy: boolean;
  onContinue: () => void;
  onSubmitTransfer: () => void;
  lastTxnRef: string | null;
};

export function DmtLayout2({
  mobile,
  onMobileChange,
  onLookup,
  lookingUp,
  remitterLabel,
  limitLine,
  beneficiaries,
  selectedBeneId,
  onSelectBene,
  amount,
  onAmountChange,
  mode,
  onModeChange,
  impsAllowed,
  neftAllowed,
  earnLine,
  otpSent,
  txnOtp,
  onTxnOtpChange,
  txnPin,
  onTxnPinChange,
  txnBusy,
  onContinue,
  onSubmitTransfer,
  lastTxnRef,
}: Props) {
  const [range, setRange] = useState<HistoryRange>("7d");
  const [statusFilter, setStatusFilter] = useState<HistoryStatus>("all");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"preview" | "data" | "loading" | "empty">("data");

  const rows = useMemo(() => {
    if (viewMode === "empty") return [];
    const q = query.trim().toLowerCase();
    return DEMO_ROWS.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.orderId.toLowerCase().includes(q) ||
        r.accountLast4.includes(q) ||
        r.beneficiary.toLowerCase().includes(q) ||
        r.bank.toLowerCase().includes(q)
      );
    });
  }, [query, statusFilter, viewMode]);

  function buildReport(): BrandedReport {
    return {
      title: "DMT transaction history",
      fileName: "dmt-history-preview",
      meta: [
        { label: "Range", value: range === "7d" ? "Last 7 days" : range },
        { label: "Note", value: "Sample preview — live DMT history next" },
      ],
      summary: [{ label: "Rows", value: String(rows.length), tone: "neutral" }],
      columns: [
        { label: "Date / Time" },
        { label: "Beneficiary" },
        { label: "Account" },
        { label: "Bank" },
        { label: "Amount", align: "right" },
        { label: "Charges", align: "right" },
        { label: "Status" },
        { label: "Order ID" },
      ],
      rows: rows.map((r) => [
        { text: r.at },
        { text: r.beneficiary },
        { text: `**** ${r.accountLast4}`, mono: true },
        { text: r.bank },
        { text: r.amount, align: "right" },
        { text: r.charges, align: "right" },
        {
          text:
            r.status === "success"
              ? "Success"
              : r.status === "pending"
                ? "Pending"
                : r.status === "failed"
                  ? "Failed"
                  : "Refunded",
          tone:
            r.status === "success"
              ? "approved"
              : r.status === "pending"
                ? "requested"
                : r.status === "failed"
                  ? "rejected"
                  : "muted",
        },
        { text: r.orderId, mono: true },
      ]),
      footerNote: "This history is scoped to Domestic Money Transfer.",
    };
  }

  return (
    <div className="space-y-6">
      {/* Send money */}
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: B.border }}>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Send money</h2>
            <p className="text-xs text-gray-500">Select a beneficiary and enter transfer details.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
            <ShieldCheck size={13} />
            Secure transaction
          </span>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_minmax(110px,0.7fr)_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sender mobile
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={mobile}
                onChange={(e) => onMobileChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onLookup();
                }}
                onBlur={() => {
                  if (mobile.replace(/\D/g, "").length === 10) onLookup();
                }}
                placeholder="Enter sender mobile"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-medium outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Beneficiary
              </label>
              <div className="relative">
                <select
                  value={selectedBeneId}
                  onChange={(e) => onSelectBene(e.target.value)}
                  disabled={beneficiaries.length === 0}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 pr-9 text-sm font-medium outline-none focus:border-blue-300 disabled:opacity-60"
                >
                  <option value="">
                    {beneficiaries.length === 0 ? "Lookup remitter first" : "Select beneficiary"}
                  </option>
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · **** {b.account.slice(-4)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Transfer amount
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                  ₹
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="Enter amount"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-8 pr-3.5 text-sm font-medium outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Transfer mode
              </label>
              <div className="relative">
                <select
                  value={mode}
                  onChange={(e) => onModeChange(e.target.value as "imps" | "neft")}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 pr-9 text-sm font-semibold uppercase outline-none focus:border-blue-300"
                >
                  <option value="imps" disabled={!impsAllowed}>
                    IMPS
                  </option>
                  <option value="neft" disabled={!neftAllowed}>
                    NEFT
                  </option>
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
            </div>
            <PrimaryButton
              type="button"
              variant="primary"
              loading={txnBusy || lookingUp}
              disabled={txnBusy || lookingUp}
              showArrow={false}
              onClick={() => {
                if (!otpSent) onContinue();
                else onSubmitTransfer();
              }}
              className="h-[46px] min-w-[170px]"
            >
              {otpSent ? `Transfer ₹${amount || "0"}` : "Continue transfer"}
            </PrimaryButton>
          </div>

          {(remitterLabel || limitLine || earnLine) && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blue-50/70 px-3 py-2 text-xs font-semibold text-blue-900">
              {remitterLabel ? (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 size={14} className="text-green-600" />
                  {remitterLabel}
                </span>
              ) : null}
              {limitLine ? <span className="text-blue-800/80">· {limitLine}</span> : null}
              {earnLine ? <span className="text-green-700">· {earnLine}</span> : null}
            </div>
          )}

          {otpSent ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Remitter OTP
                </label>
                <input
                  value={txnOtp}
                  onChange={(e) => onTxnOtpChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="OTP"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-semibold outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Transaction PIN
                </label>
                <input
                  type="password"
                  value={txnPin}
                  onChange={(e) => onTxnPinChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4-digit PIN"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-semibold outline-none"
                />
              </div>
            </div>
          ) : null}

          {lastTxnRef ? (
            <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
              Last txn: <span className="font-bold">{lastTxnRef}</span>
            </p>
          ) : null}

          <p className="flex items-start gap-2 text-xs text-gray-500">
            <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
            Customer details are encrypted and used only to complete this transaction.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3">
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
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: B.blueLight }}>
              Service activity
            </p>
            <h3 className="mt-0.5 text-lg font-extrabold text-gray-900">Transaction history</h3>
            <p className="mt-1 text-xs text-gray-500">
              Only Domestic Money Transfer transactions are shown here.
            </p>
            <p className="mt-1 text-xs font-medium text-amber-700">
              Sample preview — live DMT rows will replace this table next.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["today", "Today"],
                ["yesterday", "Yesterday"],
                ["7d", "Last 7 days"],
                ["custom", "Custom"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === "custom") {
                    toast("Custom date range coming soon");
                    return;
                  }
                  setRange(id);
                }}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition",
                  range === id
                    ? "text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
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
                placeholder="Search Order ID or account"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-300"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as HistoryStatus)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700"
            >
              <option value="all">Status: All</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <button
              type="button"
              onClick={() => toast("More filters coming soon")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              <Filter size={14} />
              More filters
            </button>
            <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white text-xs font-bold">
              {(
                [
                  ["preview", "Preview"],
                  ["data", "Data"],
                  ["loading", "Loading"],
                  ["empty", "Empty"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id)}
                  className={clsx(
                    "px-2.5 py-2 transition",
                    viewMode === id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ExportMenu
            disabled={rows.length === 0 || viewMode === "loading"}
            onPdf={() => {
              if (!openBrandedPdf(buildReport())) {
                toast.error("Allow pop-ups for this site to export the PDF");
              }
            }}
            onExcel={() => downloadBrandedExcel(buildReport())}
            onCsv={() => {
              downloadCsv(
                "dmt-history-preview.csv",
                ["Date / Time", "Beneficiary", "Account", "Bank", "Amount", "Charges", "Status", "Order ID"],
                rows.map((r) => [
                  r.at,
                  r.beneficiary,
                  `**** ${r.accountLast4}`,
                  r.bank,
                  r.amount,
                  r.charges,
                  r.status,
                  r.orderId,
                ]),
              );
            }}
          />
        </div>

        {viewMode === "loading" ? (
          <div className="space-y-3 px-5 py-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr
                  className="border-b bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500"
                  style={{ borderColor: B.border }}
                >
                  <th className="px-5 py-3">Date / Time</th>
                  <th className="px-3 py-3">Beneficiary</th>
                  <th className="px-3 py-3">Account</th>
                  <th className="px-3 py-3">Bank</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Charges</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Order ID</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b last:border-0 hover:bg-slate-50/80"
                    style={{ borderColor: B.border }}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-medium text-gray-700">{r.at}</td>
                    <td className="px-3 py-3.5 font-semibold text-gray-800">{r.beneficiary}</td>
                    <td className="px-3 py-3.5 tabular-nums text-gray-600">**** {r.accountLast4}</td>
                    <td className="px-3 py-3.5 text-gray-700">{r.bank}</td>
                    <td className="px-3 py-3.5 font-bold tabular-nums text-gray-900">{r.amount}</td>
                    <td className="px-3 py-3.5 tabular-nums text-gray-600">{r.charges}</td>
                    <td className="px-3 py-3.5">
                      <StatusPill status={r.status} failReason={r.failReason} />
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs text-gray-600">{r.orderId}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => toast("Receipt preview — live PDF next")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                      >
                        <FileText size={13} />
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-sm font-medium text-gray-500">
                      No matching transactions. Clear filters and try again.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="flex flex-col gap-2 border-t px-5 py-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: B.border }}
        >
          <p>
            Showing {rows.length === 0 ? "0" : `1-${rows.length}`} of {rows.length} transactions.
          </p>
          <p>
            This history is scoped to Domestic Money Transfer. Use All reports for cross-service
            reporting.
          </p>
        </div>
      </section>
    </div>
  );
}

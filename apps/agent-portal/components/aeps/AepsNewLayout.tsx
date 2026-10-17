"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Info,
  Search,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { B } from "@/lib/brand";
import { fetchApi } from "@/lib/api";
import type { WalletBalance } from "@/lib/types";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";
import { useBalanceVisibility } from "@/lib/balanceVisibility";
import { downloadBrandedExcel, openBrandedPdf, type BrandedReport } from "@/lib/brandedExport";
import { downloadCsv } from "@/components/reports/reportUtils";

type AepsTab = "Withdraw" | "Mini Statement" | "Deposit" | "Balance Enquiry";

type Bank = {
  id: string;
  name: string;
  shortName: string;
};

type Props = {
  tab: AepsTab;
  onTabChange: (t: AepsTab) => void;
  banks: Bank[];
  selectedBank: Bank | null;
  onBankChange: (bank: Bank | null) => void;
  aadhaar: string;
  onAadhaarChange: (v: string) => void;
  aadhaarVisible: boolean;
  onToggleAadhaarVisible: () => void;
  mobile: string;
  onMobileChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  showAmount: boolean;
  scanning: boolean;
  onProceed: () => void;
};

type HistoryRange = "today" | "yesterday" | "7d" | "custom";
type HistoryStatus = "all" | "success" | "pending" | "failed";

type DemoRow = {
  id: string;
  at: string;
  type: string;
  aadhaarLast4: string;
  bank: string;
  amount: string;
  status: "success" | "pending" | "failed";
  rrn: string;
};

const TAB_CHIPS: { id: AepsTab; label: string }[] = [
  { id: "Withdraw", label: "Cash withdrawal" },
  { id: "Balance Enquiry", label: "Balance enquiry" },
  { id: "Mini Statement", label: "Mini statement" },
  { id: "Deposit", label: "Deposit" },
];

const DEMO_ROWS: DemoRow[] = [
  {
    id: "1",
    at: "15 Oct 2023, 10:42 AM",
    type: "Cash withdrawal",
    aadhaarLast4: "4521",
    bank: "State Bank of India",
    amount: "₹2,500.00",
    status: "success",
    rrn: "318847291045",
  },
  {
    id: "2",
    at: "15 Oct 2023, 09:18 AM",
    type: "Aadhaar Pay",
    aadhaarLast4: "8830",
    bank: "HDFC Bank",
    amount: "₹1,200.00",
    status: "pending",
    rrn: "318846112290",
  },
  {
    id: "3",
    at: "14 Oct 2023, 06:55 PM",
    type: "Balance enquiry",
    aadhaarLast4: "1194",
    bank: "Punjab National Bank",
    amount: "—",
    status: "success",
    rrn: "318790441002",
  },
  {
    id: "4",
    at: "14 Oct 2023, 02:11 PM",
    type: "Cash withdrawal",
    aadhaarLast4: "6672",
    bank: "Bank of Baroda",
    amount: "₹5,000.00",
    status: "failed",
    rrn: "318771209884",
  },
  {
    id: "5",
    at: "13 Oct 2023, 11:03 AM",
    type: "Mini statement",
    aadhaarLast4: "3048",
    bank: "Indian Bank",
    amount: "—",
    status: "success",
    rrn: "318650998211",
  },
];

function StatusPill({ status }: { status: DemoRow["status"] }) {
  const map = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending: "bg-amber-50 text-amber-800 ring-amber-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
  } as const;
  const label = status === "success" ? "Success" : status === "pending" ? "Pending" : "Failed";
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", map[status])}>
      {label}
    </span>
  );
}

function formatAadhaar(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 12);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function maskAadhaar(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 4) return d;
  return "XXXX XXXX " + d.slice(-4);
}

export function AepsNewLayout({
  tab,
  onTabChange,
  banks,
  selectedBank,
  onBankChange,
  aadhaar,
  onAadhaarChange,
  aadhaarVisible,
  onToggleAadhaarVisible,
  mobile,
  onMobileChange,
  amount,
  onAmountChange,
  showAmount,
  scanning,
  onProceed,
}: Props) {
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const balanceVisible = useBalanceVisibility((s) => s.visible);
  const toggleBalance = useBalanceVisibility((s) => s.toggle);
  const [range, setRange] = useState<HistoryRange>("7d");
  const [statusFilter, setStatusFilter] = useState<HistoryStatus>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchApi<WalletBalance[]>("/wallet/me")
      .then((data) => {
        if (!cancelled) setWallets(data ?? []);
      })
      .catch(() => {
        /* header chips already show balances */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mainBal = wallets.find((w) => w.walletType === "main");
  const aepsBal = wallets.find((w) => w.walletType === "aeps");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEMO_ROWS.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.aadhaarLast4.includes(q) || r.rrn.toLowerCase().includes(q) || r.bank.toLowerCase().includes(q);
    });
  }, [query, statusFilter]);

  function buildReport(): BrandedReport {
    return {
      title: "AePS transaction history",
      fileName: "aeps-history-preview",
      meta: [
        { label: "Range", value: range === "7d" ? "Last 7 days" : range },
        { label: "Note", value: "Sample preview — live service history next" },
      ],
      summary: [{ label: "Rows", value: String(rows.length), tone: "neutral" }],
      columns: [
        { label: "Date / Time" },
        { label: "Type" },
        { label: "Aadhaar" },
        { label: "Bank" },
        { label: "Amount", align: "right" },
        { label: "Status" },
        { label: "RRN" },
      ],
      rows: rows.map((r) => [
        { text: r.at },
        { text: r.type },
        { text: `**** ${r.aadhaarLast4}`, mono: true },
        { text: r.bank },
        { text: r.amount, align: "right" },
        {
          text: r.status === "success" ? "Success" : r.status === "pending" ? "Pending" : "Failed",
          tone: r.status === "success" ? "approved" : r.status === "pending" ? "requested" : "rejected",
        },
        { text: r.rrn, mono: true },
      ]),
      footerNote: "Sample preview rows for layout review.",
    };
  }

  return (
    <div className="space-y-6">
      {/* Page title + balances */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
            Services / AePS
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color: B.blue }}>
            AePS
          </h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Cash withdrawal, balance enquiry and Aadhaar-enabled services.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[mainBal, aepsBal].filter(Boolean).map((w) =>
            w ? (
              <div
                key={w.id}
                className="min-w-[140px] rounded-2xl border bg-white px-4 py-3 shadow-sm"
                style={{ borderColor: B.border }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  {walletDisplayName(w.walletType)}
                </p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums" style={{ color: B.blue }}>
                  {balanceVisible ? formatInr(w.balance) : "••••••"}
                </p>
              </div>
            ) : null,
          )}
          <button
            type="button"
            onClick={() => toggleBalance()}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-white text-gray-500 shadow-sm"
            style={{ borderColor: B.border }}
            aria-label={balanceVisible ? "Hide balances" : "Show balances"}
          >
            {balanceVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Service form card */}
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: B.border }}>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ background: B.blue }}
          >
            <Fingerprint size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Aadhaar Enabled Payment System</h2>
            <p className="text-xs text-gray-500">Fill customer details, then proceed to biometric.</p>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            {TAB_CHIPS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "text-white shadow-md"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  )}
                  style={active ? { background: B.blue } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_minmax(120px,0.8fr)_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Customer mobile
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={mobile}
                onChange={(e) => onMobileChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Enter 10-digit mobile number"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-medium outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Aadhaar number
              </label>
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={aadhaarVisible ? formatAadhaar(aadhaar) : maskAadhaar(aadhaar)}
                  onChange={(e) => onAadhaarChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  onFocus={() => {
                    if (!aadhaarVisible) onToggleAadhaarVisible();
                  }}
                  placeholder="Enter 12-digit Aadhaar"
                  className="flex-1 bg-transparent text-sm font-medium outline-none"
                />
                <button
                  type="button"
                  onClick={onToggleAadhaarVisible}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                  aria-label={aadhaarVisible ? "Hide Aadhaar" : "Show Aadhaar"}
                >
                  {aadhaarVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Customer bank
              </label>
              <div className="relative">
                <select
                  value={selectedBank?.id ?? ""}
                  onChange={(e) => {
                    const bank = banks.find((b) => b.id === e.target.value) ?? null;
                    onBankChange(bank);
                  }}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 pr-9 text-sm font-medium outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                >
                  <option value="">Select bank</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
            </div>
            {showAmount ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Amount
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value.replace(/\D/g, ""))}
                  placeholder="₹ Enter amount"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-medium outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                />
              </div>
            ) : (
              <div className="hidden lg:block" />
            )}
            <PrimaryButton
              type="button"
              variant="primary"
              loading={scanning}
              disabled={scanning}
              onClick={onProceed}
              className="h-[46px] min-w-[180px] lg:mb-0"
              showArrow={false}
            >
              Proceed to biometric
            </PrimaryButton>
          </div>

          <p className="flex items-start gap-2 text-xs text-gray-500">
            <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
            Customer details are encrypted and used only to complete this transaction.
          </p>
        </div>
      </section>

      {/* Recent transactions */}
      <div className="flex items-center gap-3 pt-1">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
          Recent transactions
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <section className="rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
        <div className="flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-end lg:justify-between" style={{ borderColor: B.border }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
              Service activity
            </p>
            <h3 className="mt-0.5 text-lg font-extrabold text-gray-900">Transaction history</h3>
            <p className="mt-1 text-xs font-medium text-amber-700">
              Sample preview — live AePS rows will replace this table next.
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

        <div className="flex flex-col gap-3 border-b px-5 py-3 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: B.border }}>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Aadhaar last 4 or RRN"
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
            </select>
            <button
              type="button"
              onClick={() => toast("More filters coming soon")}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              More filters
            </button>
          </div>
          <ExportMenu
            disabled={rows.length === 0}
            onPdf={() => {
              if (!openBrandedPdf(buildReport())) {
                toast.error("Allow pop-ups for this site to export the PDF");
              }
            }}
            onExcel={() => downloadBrandedExcel(buildReport())}
            onCsv={() => {
              downloadCsv(
                "aeps-history-preview.csv",
                ["Date / Time", "Type", "Aadhaar", "Bank", "Amount", "Status", "RRN"],
                rows.map((r) => [r.at, r.type, `**** ${r.aadhaarLast4}`, r.bank, r.amount, r.status, r.rrn]),
              );
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500" style={{ borderColor: B.border }}>
                <th className="px-5 py-3">Date / Time</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Aadhaar</th>
                <th className="px-3 py-3">Bank</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">RR / Bank RRN</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/80" style={{ borderColor: B.border }}>
                  <td className="whitespace-nowrap px-5 py-3.5 font-medium text-gray-700">{r.at}</td>
                  <td className="px-3 py-3.5 font-semibold text-gray-800">{r.type}</td>
                  <td className="px-3 py-3.5 tabular-nums text-gray-600">**** {r.aadhaarLast4}</td>
                  <td className="px-3 py-3.5 text-gray-700">{r.bank}</td>
                  <td className="px-3 py-3.5 font-bold tabular-nums text-gray-900">{r.amount}</td>
                  <td className="px-3 py-3.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-3.5 font-mono text-xs text-gray-600">{r.rrn}</td>
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
                  <td colSpan={8} className="px-5 py-10 text-center text-sm font-medium text-gray-500">
                    No matching transactions. Clear filters and try again.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

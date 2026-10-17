"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  Check,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { B } from "@/lib/brand";
import { aepsBankLogoUrl } from "@/lib/bankLogo";
import { downloadBrandedExcel, openBrandedPdf, type BrandedReport } from "@/lib/brandedExport";
import { downloadCsv } from "@/components/reports/reportUtils";

export type AepsLayout3Tab = "Withdraw" | "Mini Statement" | "Deposit" | "Balance Enquiry";

type Bank = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  letter: string;
};

type Props = {
  tab: AepsLayout3Tab;
  onTabChange: (t: AepsLayout3Tab) => void;
  banks: Bank[];
  selectedBank: Bank | null;
  onSelectBank: (bank: Bank) => void;
  onViewAllBanks: () => void;
  aadhaar: string;
  onAadhaarChange: (v: string) => void;
  aadhaarVisible: boolean;
  onToggleAadhaarVisible: () => void;
  mobile: string;
  onMobileChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  showAmount: boolean;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  deviceLabel: string;
  scannerReady: boolean;
  scannerLooking: boolean;
  onRetryScanner: () => void;
  onChangeDevice: () => void;
  scanning: boolean;
  onScan: () => void;
};

type HistoryRange = "today" | "yesterday" | "7d" | "month";
type HistoryStatus = "all" | "success" | "failed" | "pending";

type DemoRow = {
  id: string;
  txnId: string;
  time: string;
  aadhaarLast4: string;
  type: string;
  bank: string;
  amount: string;
  status: "success" | "failed" | "pending";
};

const TABS: AepsLayout3Tab[] = ["Withdraw", "Mini Statement", "Deposit", "Balance Enquiry"];
const QUICK = [1000, 2000, 5000, 10000];

const DEMO_ROWS: DemoRow[] = [
  {
    id: "1",
    txnId: "TXN98231",
    time: "12:40 PM, Today",
    aadhaarLast4: "4821",
    type: "Cash Withdraw",
    bank: "SBI",
    amount: "₹2,000",
    status: "success",
  },
  {
    id: "2",
    txnId: "TXN98110",
    time: "11:05 AM, Today",
    aadhaarLast4: "9033",
    type: "Balance Enquiry",
    bank: "HDFC",
    amount: "—",
    status: "success",
  },
  {
    id: "3",
    txnId: "TXN97902",
    time: "Yesterday",
    aadhaarLast4: "1144",
    type: "Cash Withdraw",
    bank: "PNB",
    amount: "₹5,000",
    status: "failed",
  },
  {
    id: "4",
    txnId: "TXN97855",
    time: "Yesterday",
    aadhaarLast4: "6620",
    type: "Mini Statement",
    bank: "Axis",
    amount: "—",
    status: "pending",
  },
];

function formatAadhaar(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 12);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function maskAadhaar(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 4) return d;
  return "XXXX XXXX " + d.slice(-4);
}

function RoundBankIcon({ bank, size = 52 }: { bank: Bank; size?: number }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = aepsBankLogoUrl(bank);

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- CDN bank logo
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-white object-contain"
        style={{
          width: size,
          height: size,
          padding: size * 0.18,
          boxShadow: "0 2px 8px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.06)",
        }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, ${bank.color}ee, ${bank.color})`,
        fontSize: size * 0.34,
        boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
      }}
    >
      {bank.letter}
    </div>
  );
}

function StatusPill({ status }: { status: DemoRow["status"] }) {
  const map = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
    pending: "bg-amber-50 text-amber-800 ring-amber-200",
  } as const;
  const label = status === "success" ? "Success" : status === "failed" ? "Failed" : "Pending";
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", map[status])}>
      {label}
    </span>
  );
}

/** Segmented control — sliding white pill on soft track. */
function SegmentTabs({
  value,
  onChange,
}: {
  value: AepsLayout3Tab;
  onChange: (t: AepsLayout3Tab) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ left: 4, width: 0, ready: false });

  const measure = useCallback(() => {
    const idx = TABS.indexOf(value);
    const btn = btnRefs.current[idx];
    const track = trackRef.current;
    if (!btn || !track) return;
    const tRect = track.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setPill({ left: bRect.left - tRect.left, width: bRect.width, ready: true });
  }, [value]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div
      ref={trackRef}
      className="relative inline-flex max-w-full rounded-full p-1"
      style={{ background: "#E8EEF8" }}
      role="tablist"
      aria-label="AePS service type"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 rounded-full bg-white shadow-[0_2px_8px_rgba(15,23,42,0.10)] transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          left: pill.left,
          width: pill.width,
          opacity: pill.ready ? 1 : 0,
        }}
      />
      {TABS.map((t, i) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            onClick={() => onChange(t)}
            className={clsx(
              "relative z-10 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200",
              active ? "font-bold" : "hover:text-[#1e4bb8]",
            )}
            style={{ color: B.blueLight }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

export function AepsLayout3({
  tab,
  onTabChange,
  banks,
  selectedBank,
  onSelectBank,
  onViewAllBanks,
  aadhaar,
  onAadhaarChange,
  aadhaarVisible,
  onToggleAadhaarVisible,
  mobile,
  onMobileChange,
  amount,
  onAmountChange,
  showAmount,
  consent,
  onConsentChange,
  deviceLabel,
  scannerReady,
  scannerLooking,
  onRetryScanner,
  onChangeDevice,
  scanning,
  onScan,
}: Props) {
  const [range, setRange] = useState<HistoryRange>("today");
  const [statusFilter, setStatusFilter] = useState<HistoryStatus>("all");
  const [query, setQuery] = useState("");

  const stripBanks = banks.slice(0, 8);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEMO_ROWS.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.txnId.toLowerCase().includes(q) ||
        r.aadhaarLast4.includes(q) ||
        r.bank.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    });
  }, [query, statusFilter]);

  function buildReport(): BrandedReport {
    return {
      title: "Recent AePS transactions",
      fileName: "aeps-history-layout3-preview",
      meta: [
        { label: "Range", value: range },
        { label: "Note", value: "Sample preview — live AePS history next" },
      ],
      summary: [{ label: "Rows", value: String(rows.length), tone: "neutral" }],
      columns: [
        { label: "Txn ID / Time" },
        { label: "Customer Aadhaar" },
        { label: "Service type" },
        { label: "Bank" },
        { label: "Amount", align: "right" },
        { label: "Status" },
      ],
      rows: rows.map((r) => [
        { text: r.txnId, sub: r.time },
        { text: `XXXX-XXXX-${r.aadhaarLast4}`, mono: true },
        { text: r.type },
        { text: r.bank },
        { text: r.amount, align: "right" },
        {
          text: r.status === "success" ? "Success" : r.status === "failed" ? "Failed" : "Pending",
          tone: r.status === "success" ? "approved" : r.status === "failed" ? "rejected" : "requested",
        },
      ]),
    };
  }

  return (
    <div className="space-y-5">
      {/* Setup card — single column flow */}
      <section
        className="overflow-hidden rounded-2xl border bg-white shadow-sm"
        style={{ borderColor: B.border }}
      >
        <div className="space-y-6 p-5 sm:p-6">
          <SegmentTabs value={tab} onChange={onTabChange} />

          {/* Banks — polished round strip */}
          <div className="rounded-2xl border border-gray-100 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Select bank</p>
                {selectedBank ? (
                  <p className="mt-0.5 text-xs font-semibold" style={{ color: B.blue }}>
                    {selectedBank.name}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-gray-400">Tap a bank to continue</p>
                )}
              </div>
              <button
                type="button"
                onClick={onViewAllBanks}
                className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold shadow-sm transition hover:bg-blue-50"
                style={{ color: B.blueLight }}
              >
                View All Banks
              </button>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {stripBanks.map((bank) => {
                const active = selectedBank?.id === bank.id;
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => onSelectBank(bank)}
                    className={clsx(
                      "group flex w-[72px] shrink-0 flex-col items-center gap-2 rounded-2xl px-1.5 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      active
                        ? "scale-[1.04] bg-white shadow-md shadow-blue-100/80"
                        : "scale-100 hover:bg-white/80 hover:scale-[1.02]",
                    )}
                  >
                    <span
                      className={clsx(
                        "relative rounded-full p-0.5 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        active
                          ? "scale-105 ring-[3px] ring-blue-500 ring-offset-2"
                          : "scale-100 ring-0",
                      )}
                    >
                      <RoundBankIcon bank={bank} size={52} />
                      <span
                        className={clsx(
                          "absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-white shadow transition-all duration-250",
                          active
                            ? "scale-100 opacity-100"
                            : "scale-50 opacity-0",
                        )}
                        style={{ background: B.blue }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    </span>
                    <span
                      className={clsx(
                        "w-full truncate text-center text-[11px] leading-tight transition-colors duration-200",
                        active ? "font-extrabold" : "font-semibold text-gray-600 group-hover:text-gray-800",
                      )}
                      style={active ? { color: B.blue } : undefined}
                    >
                      {bank.shortName.replace(/\.\.\.$/, "")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer details — Aadhaar + Mobile + Amount in one row on large screens */}
          <div className="space-y-4">
            <div
              className={clsx(
                "grid gap-3",
                showAmount
                  ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  : "grid-cols-1 md:grid-cols-2",
              )}
            >
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Aadhaar or VID number
                </label>
                <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={aadhaarVisible ? formatAadhaar(aadhaar) : maskAadhaar(aadhaar)}
                    onChange={(e) => onAadhaarChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    placeholder="XXXX XXXX XXXX"
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
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mobile number
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={mobile}
                  onChange={(e) => onMobileChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Mobile Number"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {showAmount ? (
                <div className="min-w-0 md:col-span-2 xl:col-span-1">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Amount to {tab === "Deposit" ? "deposit" : "withdraw"}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => onAmountChange(e.target.value.replace(/\D/g, ""))}
                    placeholder={tab === "Deposit" ? "Amount to Deposit" : "Amount to Withdraw"}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              ) : null}
            </div>

            {showAmount ? (
              <div className="flex flex-wrap gap-2">
                {QUICK.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onAmountChange(String(a))}
                    className={clsx(
                      "rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all duration-200",
                      amount === String(a)
                        ? "scale-105 border-blue-400 bg-blue-50 text-blue-700 shadow-sm"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    ₹{a.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="flex cursor-pointer items-start gap-2.5 select-none rounded-xl border border-gray-100 bg-slate-50/90 px-3.5 py-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => onConsentChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <span className="text-xs leading-relaxed text-gray-600">
                I (the customer) accept{" "}
                <span className="font-semibold text-blue-700 underline">Aadhaar Consent</span> and have
                read the <span className="font-semibold text-blue-700 underline">AePS Advisory</span>
              </span>
            </label>
          </div>

          {/* Biometric — full width BELOW form */}
          <div
            className={clsx(
              "overflow-hidden rounded-2xl border",
              scannerReady && "border-emerald-200 bg-emerald-50/40",
              scannerLooking && "border-blue-200 bg-blue-50/40",
              !scannerReady && !scannerLooking && "border-amber-200 bg-amber-50/50",
            )}
          >
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                <div
                  className={clsx(
                    "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                    scannerReady && "bg-emerald-100 text-emerald-700",
                    scannerLooking && "bg-blue-100 text-blue-700",
                    !scannerReady && !scannerLooking && "bg-amber-100 text-amber-800",
                  )}
                >
                  <Fingerprint size={26} strokeWidth={2.2} />
                  <span
                    className={clsx(
                      "absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white",
                      scannerReady && "bg-emerald-500",
                      scannerLooking && "animate-pulse bg-blue-500",
                      !scannerReady && !scannerLooking && "bg-amber-500",
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                      Biometric capture
                    </p>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                        scannerReady && "bg-emerald-100 text-emerald-800",
                        scannerLooking && "bg-blue-100 text-blue-800",
                        !scannerReady && !scannerLooking && "bg-amber-100 text-amber-900",
                      )}
                    >
                      {scannerLooking ? "Connecting" : scannerReady ? "Ready" : "Offline"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-extrabold text-gray-900">{deviceLabel}</p>
                  <p
                    className={clsx(
                      "mt-1 text-xs font-semibold leading-relaxed",
                      scannerReady && "text-emerald-800",
                      scannerLooking && "text-blue-800",
                      !scannerReady && !scannerLooking && "text-amber-900",
                    )}
                  >
                    {scannerLooking
                      ? "Looking for RD Service on this PC…"
                      : scannerReady
                        ? "Device connected. Place finger when you tap Scan."
                        : "Open Mantra / Morpho RD Service on this PC, then Retry."}
                  </p>
                </div>
              </div>

              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[260px]">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onChangeDevice}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                  >
                    <Settings2 size={14} />
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={onRetryScanner}
                    disabled={scannerLooking}
                    className={clsx(
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:opacity-60",
                      scannerReady
                        ? "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                        : "border-amber-300 bg-white text-amber-900 hover:bg-amber-50",
                    )}
                  >
                    <RefreshCw size={14} className={scannerLooking ? "animate-spin" : undefined} />
                    {scannerReady ? "Recheck" : "Retry"}
                  </button>
                </div>
                <PrimaryButton
                  type="button"
                  variant="primary"
                  loading={scanning}
                  disabled={scanning || !scannerReady}
                  onClick={onScan}
                  showArrow={false}
                  className="w-full !min-h-[48px]"
                >
                  <Fingerprint size={18} />
                  {scannerReady ? "Scan Finger & Submit" : "Connect scanner to scan"}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* History */}
      <section
        className="rounded-2xl border bg-white shadow-sm"
        style={{ borderColor: B.border }}
      >
        <div
          className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
          style={{ borderColor: B.border }}
        >
          <div>
            <h3 className="text-base font-extrabold text-gray-900">Recent AePS Transactions</h3>
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              Sample preview — live rows will replace this next.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as HistoryRange)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
            >
              <option value="today">Show: Today</option>
              <option value="yesterday">Show: Yesterday</option>
              <option value="7d">Show: Last 7 days</option>
              <option value="month">Show: This month</option>
            </select>
            <div className="relative min-w-[160px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Txn"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as HistoryStatus)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              <option value="all">Status: All</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
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
                  "aeps-history-layout3-preview.csv",
                  ["Txn ID", "Time", "Aadhaar", "Type", "Bank", "Amount", "Status"],
                  rows.map((r) => [
                    r.txnId,
                    r.time,
                    `XXXX-XXXX-${r.aadhaarLast4}`,
                    r.type,
                    r.bank,
                    r.amount,
                    r.status,
                  ]),
                );
              }}
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
                <th className="px-5 py-3">Txn ID / Time</th>
                <th className="px-3 py-3">Customer Aadhaar</th>
                <th className="px-3 py-3">Service type</th>
                <th className="px-3 py-3">Bank</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Status</th>
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
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-gray-900">{r.txnId}</p>
                    <p className="text-xs text-gray-500">{r.time}</p>
                  </td>
                  <td className="px-3 py-3.5 font-mono text-xs text-gray-600">
                    XXXX-XXXX-{r.aadhaarLast4}
                  </td>
                  <td className="px-3 py-3.5 font-semibold text-gray-800">{r.type}</td>
                  <td className="px-3 py-3.5 text-gray-700">{r.bank}</td>
                  <td className="px-3 py-3.5 font-bold tabular-nums text-gray-900">{r.amount}</td>
                  <td className="px-3 py-3.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => toast("Receipt preview — live PDF next")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      <FileText size={13} />
                      {r.status === "success" ? "Print Receipt" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-gray-500">
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Copy, Check, Info, QrCode, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";

const QUICK_AMOUNTS = [
  { amount: 200, hint: "min. limit" },
  { amount: 500, hint: null },
  { amount: 1000, hint: null },
  { amount: 1500, hint: null },
  { amount: 2000, hint: null },
  { amount: 3000, hint: null },
  { amount: 4000, hint: null },
  { amount: 5000, hint: "max limit" },
] as const;
const MIN_AMOUNT = 200;
const MAX_AMOUNT = 5000;
const QR_EXPIRY_SECONDS = 120;

const UPI_APPS = [
  { name: "Google Pay", short: "GPay", color: "#4285F4" },
  { name: "PhonePe", short: "PhonePe", color: "#5F259F" },
  { name: "Paytm", short: "Paytm", color: "#00BAF2" },
  { name: "BHIM", short: "BHIM", color: "#00897B" },
  { name: "CRED", short: "CRED", color: "#1A1A2E" },
  { name: "Amazon Pay", short: "Amazon", color: "#FF9900" },
  { name: "MobiKwik", short: "MobiKwik", color: "#2196F3" },
  { name: "Kotak", short: "Kotak", color: "#E53935" },
];

type Stage = "input" | "qr";

function generateMockUpiId(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `asanpay.ucp${num}@yesbankltd`;
}

function QrPlaceholder({ amount }: { amount: number }) {
  const cells = 21;
  const size = 200;
  const cellSize = size / cells;

  const patternRef = useRef<boolean[][]>([]);
  if (patternRef.current.length === 0) {
    const pattern: boolean[][] = [];
    for (let r = 0; r < cells; r++) {
      pattern[r] = [];
      for (let c = 0; c < cells; c++) {
        const inFinder =
          (r < 7 && c < 7) ||
          (r < 7 && c >= cells - 7) ||
          (r >= cells - 7 && c < 7);
        if (inFinder) {
          const isOuterBorder = r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= cells - 7 && (r === cells - 7 || r === cells - 1)) ||
            (c >= cells - 7 && (c === cells - 7 || c === cells - 1));
          const isInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
            (r >= 2 && r <= 4 && c >= cells - 5 && c <= cells - 3) ||
            (r >= cells - 5 && r <= cells - 3 && c >= 2 && c <= 4);
          pattern[r]![c] = isOuterBorder || isInner;
        } else {
          pattern[r]![c] = Math.random() > 0.55;
        }
      }
    }
    patternRef.current = pattern;
  }

  const rects: React.ReactNode[] = [];
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (patternRef.current[r]?.[c]) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize}
            height={cellSize}
            fill={B.blue}
          />,
        );
      }
    }
  }

  return (
    <div className="relative">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect width={size} height={size} fill="white" />
        {rects}
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ pointerEvents: "none" }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white shadow-sm">
          <span className="text-lg font-black" style={{ color: B.blue }}>₹</span>
        </div>
      </div>
    </div>
  );
}

function amountInWords(n: number): string {
  if (!n || n < 1) return "";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function underThousand(x: number): string {
    if (x < 20) return ones[x]!;
    if (x < 100) return `${tens[Math.floor(x / 10)]} ${ones[x % 10]}`.trim();
    return `${ones[Math.floor(x / 100)]} Hundred ${underThousand(x % 100)}`.trim();
  }
  if (n >= 100000) {
    const lakh = Math.floor(n / 100000);
    const rest = n % 100000;
    return `${underThousand(lakh)} Lakh ${rest ? underThousand(rest) : ""}`.trim() + " only";
  }
  if (n >= 1000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    return `${underThousand(th)} Thousand ${rest ? underThousand(rest) : ""}`.trim() + " only";
  }
  return `${underThousand(n)} only`;
}

/** Empty amount → no error yet. Otherwise min / max / ₹100 multiple. */
function amountErrorMessage(n: number): string | null {
  if (!n) return null;
  if (n < MIN_AMOUNT) return `Amount can't be less than ${MIN_AMOUNT}`;
  if (n > MAX_AMOUNT) return `Amount can't be more than ${MAX_AMOUNT}`;
  if (n % 100 !== 0) return "Enter amount in multiples of ₹100";
  return null;
}

export default function UpiCashPointPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("input");
  const [amount, setAmount] = useState("");
  const [earnDismissed, setEarnDismissed] = useState(false);
  const [timer, setTimer] = useState(QR_EXPIRY_SECONDS);
  const [upiId, setUpiId] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    setTimer(QR_EXPIRY_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function handleGenerate() {
    const amt = parseInt(amount, 10);
    if (!amt || amountErrorMessage(amt)) return;
    setUpiId(generateMockUpiId());
    setStage("qr");
    startTimer();
  }

  function handleNewQr() {
    setStage("input");
    setAmount("");
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function handleCopyUpi() {
    void navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const minutes = Math.floor(timer / 60);
  const seconds = timer % 60;
  const timerStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const amountNum = parseInt(amount, 10) || 0;
  const isExpired = timer === 0;
  const amountError = amountErrorMessage(amountNum);
  const amountValid = amountNum > 0 && !amountError;
  const showEarnStrip = amountValid && !earnDismissed;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (stage === "qr" ? handleNewQr() : router.push("/dashboard"))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-gray-50"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              UPI Cash Point
            </h1>
            <p className="text-xs" style={{ color: B.muted }}>
              QR-based cash withdrawal via UPI
            </p>
          </div>
        </div>

        {stage === "input" ? (
          /* Clean spacious layout — roomy type, same outer shell */
          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <div
                className="overflow-hidden rounded-2xl border bg-white shadow-sm"
                style={{ borderColor: B.border }}
              >
                <div className="flex items-start gap-2.5 bg-amber-50 px-5 py-3.5">
                  <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    QR expires in <span className="font-bold">30 seconds</span>. Customer can make
                    payment within <span className="font-bold">2 minutes</span>.
                  </p>
                </div>

                <div className="px-8 pb-8 pt-8 sm:px-12">
                  <p className="mb-6 text-center text-lg font-bold text-gray-900">
                    Amount to Withdraw
                  </p>

                  <div className="mx-auto w-full max-w-[280px]">
                    <div
                      className={clsx(
                        "flex items-center justify-center gap-2 border-b pb-2",
                        amountError ? "border-red-400" : "border-gray-200",
                      )}
                    >
                      <span className="text-3xl font-semibold text-gray-500">₹</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value.replace(/\D/g, "").slice(0, 5));
                          setEarnDismissed(false);
                        }}
                        placeholder="0"
                        className="w-full min-w-0 bg-transparent text-center text-5xl font-bold leading-none tracking-tight tabular-nums text-gray-900 outline-none placeholder:font-semibold placeholder:text-gray-300"
                        aria-invalid={Boolean(amountError)}
                      />
                    </div>
                    {amountError ? (
                      <p className="mt-2 text-center text-sm font-semibold text-red-600">
                        {amountError}
                      </p>
                    ) : null}
                    <p className="mt-2 text-center text-sm text-gray-500">
                      {amountNum > 0
                        ? amountInWords(amountNum)
                        : "Enter amount in multiples of ₹100"}
                    </p>
                  </div>

                  <div className="mx-auto mt-8 flex max-w-[520px] flex-wrap justify-center gap-3">
                    {QUICK_AMOUNTS.map(({ amount: a, hint }) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => {
                          setAmount(String(a));
                          setEarnDismissed(false);
                        }}
                        className={clsx(
                          "min-w-[5.75rem] rounded-xl border px-3 py-3 text-[14px] font-semibold transition",
                          amount === String(a)
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                            : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50",
                        )}
                      >
                        ₹{a.toLocaleString("en-IN")}
                        {hint ? (
                          <span className="mt-1 block text-[11px] font-medium leading-none text-gray-400">
                            {hint}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>

                  <div className="mt-9 flex justify-center">
                    <PrimaryButton
                      type="button"
                      variant="primary"
                      size="md"
                      showArrow={false}
                      disabled={!amountValid}
                      onClick={handleGenerate}
                      className="!w-auto min-w-[240px]"
                    >
                      Generate QR
                      <QrCode size={18} strokeWidth={2.4} />
                    </PrimaryButton>
                  </div>

                  <div className="mt-5 flex items-center justify-center gap-4 text-xs font-semibold tracking-wide text-gray-400">
                    <span>AsanPay</span>
                    <span className="text-gray-300">·</span>
                    <span>YES BANK</span>
                    <span className="text-gray-300">·</span>
                    <span>UPI</span>
                  </div>

                  {/* Earn strip — between logos and Supported Apps; animates in when amount entered */}
                  <div
                    className={clsx(
                      "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out",
                      showEarnStrip
                        ? "mt-4 grid-rows-[1fr] opacity-100"
                        : "mt-0 grid-rows-[0fr] opacity-0",
                    )}
                    aria-hidden={!showEarnStrip}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white shadow-sm">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[12px] font-black">
                            ₹
                          </span>
                          You will earn ₹2 on this transaction
                        </span>
                        <button
                          type="button"
                          onClick={() => setEarnDismissed(true)}
                          className="rounded p-0.5 text-white/70 hover:text-white"
                          aria-label="Dismiss"
                          tabIndex={showEarnStrip ? 0 : -1}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-gray-100 pt-5">
                    <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Supported UPI Apps
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      {UPI_APPS.slice(0, 6).map((app) => (
                        <div
                          key={app.name}
                          className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5"
                        >
                          <div
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white"
                            style={{ backgroundColor: app.color }}
                          >
                            {app.short[0]}
                          </div>
                          <span className="text-xs font-semibold text-gray-700">{app.short}</span>
                        </div>
                      ))}
                      <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-500">
                        +50 Others
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="min-w-0 space-y-4 md:sticky md:top-4">
              <div
                className="rounded-2xl border bg-white p-5 shadow-sm"
                style={{ borderColor: B.border }}
              >
                <h3 className="mb-3 text-sm font-bold text-gray-900">Notes:</h3>
                <ul className="space-y-2.5 text-[10px] leading-relaxed text-gray-600">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                    Daily withdrawal limit per customer is ₹10,000
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                    Minimum gap between 2 transactions of same customer should be 30 minutes
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                    No commission will be paid for transactions made using your own UPI ID
                  </li>
                </ul>
              </div>

              <div
                className="rounded-2xl border bg-white p-5 shadow-sm"
                style={{ borderColor: B.border }}
              >
                <h3 className="mb-3 text-sm font-bold text-gray-900">Help Video</h3>
                <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-900">
                  <div className="text-center">
                    <p className="text-xs font-bold tracking-wide text-white/90">UPI CASH POINT</p>
                    <p className="mt-1 text-[11px] text-white/45">Tutorial coming soon</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          /* ── QR Display Stage ───────────────────────── */
          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
            {/* QR Card */}
            <div className="rounded-2xl border bg-white p-6 text-center shadow-sm" style={{ borderColor: B.border }}>
              <p className="mb-1 text-sm font-semibold text-gray-500">
                Scan QR to withdraw
              </p>
              <p className="mb-5 text-3xl font-black" style={{ color: B.blue }}>
                ₹{amountNum.toLocaleString("en-IN")}
              </p>

              {/* Timer */}
              <div
                className={clsx(
                  "mx-auto mb-5 flex w-fit items-center gap-2 rounded-full px-4 py-2",
                  isExpired ? "bg-red-50" : "bg-amber-50",
                )}
              >
                <Info size={14} className={isExpired ? "text-red-500" : "text-amber-600"} />
                <span
                  className={clsx(
                    "text-sm font-bold",
                    isExpired ? "text-red-600" : "text-amber-700",
                  )}
                >
                  {isExpired ? "QR Expired" : `QR expiring in ${timerStr}`}
                </span>
              </div>

              {!isExpired && (
                <p className="mb-5 text-xs font-medium text-gray-400">
                  Do not refresh the page
                </p>
              )}

              {/* QR Code */}
              <div className={clsx("mx-auto mb-5 inline-block rounded-xl border-2 p-3", isExpired && "opacity-30")}>
                <QrPlaceholder amount={amountNum} />
              </div>

              {/* UPI ID */}
              <div className="mx-auto flex w-fit items-center gap-2 rounded-lg bg-gray-50 px-4 py-2">
                <span className="text-xs text-gray-500">UPI ID:</span>
                <span className="text-xs font-bold text-gray-700">{upiId}</span>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="icon-tooltip rounded p-1 hover:bg-gray-200"
                  aria-label={copied ? "Copied" : "Copy UPI ID"}
                  data-tooltip={copied ? "Copied" : "Copy UPI ID"}
                >
                  {copied ? (
                    <Check size={14} className="text-green-500" />
                  ) : (
                    <Copy size={14} className="text-gray-400" />
                  )}
                </button>
              </div>

              {isExpired && (
                <button
                  type="button"
                  onClick={() => {
                    setUpiId(generateMockUpiId());
                    startTimer();
                  }}
                  className="mt-4 rounded-xl px-8 py-2.5 text-sm font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${B.green} 0%, ${B.greenDark} 100%)` }}
                >
                  Regenerate QR
                </button>
              )}
            </div>

            {/* BHIM UPI branding */}
            <div className="flex items-center justify-center gap-3 rounded-xl border bg-white px-4 py-3" style={{ borderColor: B.border }}>
              <span className="text-sm font-black tracking-wider" style={{ color: B.blue }}>
                BHIM
              </span>
              <span className="text-sm font-black tracking-wider" style={{ color: "#00897B" }}>
                UPI
              </span>
            </div>

            {/* Supported UPI Apps */}
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
                Supported UPI Apps
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {UPI_APPS.map((app) => (
                  <div key={app.name} className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5">
                    <div
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white"
                      style={{ backgroundColor: app.color }}
                    >
                      {app.short[0]}
                    </div>
                    <span className="text-[12px] font-semibold text-gray-600">{app.short}</span>
                  </div>
                ))}
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[12px] font-bold text-gray-500">
                  +50 Others
                </span>
              </div>
            </div>

            {/* New QR / Back */}
            <button
              type="button"
              onClick={handleNewQr}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              New Transaction
            </button>
            </div>

            <aside className="min-w-0 space-y-4 md:sticky md:top-4">
              <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
                <h3 className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
                  Notes:
                </h3>
                <ul className="space-y-2.5 text-xs leading-relaxed text-gray-600">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    Ask customer to pay within the QR timer
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    Hand over cash only after payment success on customer app
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    Do not refresh this page while QR is active
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

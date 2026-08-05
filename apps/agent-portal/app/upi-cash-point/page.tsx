"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Copy, Check, Info } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { B } from "@/lib/brand";

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
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

export default function UpiCashPointPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("input");
  const [amount, setAmount] = useState("");
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
    if (!amt || amt < 1) return;
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
          /* ── Amount Input Stage ──────────────────────── */
          <div className="space-y-5">
            {/* Branding strip */}
            <div
              className="flex items-center justify-center gap-4 rounded-2xl p-4"
              style={{ background: `linear-gradient(135deg, ${B.blue} 0%, #1a3fb8 100%)` }}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <span className="text-sm font-black text-white">AP</span>
                </div>
                <span className="text-sm font-bold text-white/90">AsanPay</span>
              </div>
              <div className="h-5 w-px bg-white/30" />
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <span className="text-sm font-black text-white">YB</span>
                </div>
                <span className="text-sm font-bold text-white/90">YES Bank</span>
              </div>
              <div className="h-5 w-px bg-white/30" />
              <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white/90 tracking-wide">
                UPI CASH POINT
              </span>
            </div>

            {/* Amount card */}
            <div className="rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Withdrawal Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black" style={{ color: B.blue }}>
                  ₹
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter amount"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-4 pl-10 pr-4 text-2xl font-bold outline-none placeholder:text-gray-300 focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                  style={{ color: B.blue }}
                />
              </div>

              <div className="mt-4 flex gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmount(String(a))}
                    className={clsx(
                      "flex-1 rounded-xl border py-2.5 text-sm font-bold transition",
                      amount === String(a)
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    ₹{a.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={amountNum < 1}
                className={clsx(
                  "mt-6 w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition",
                  amountNum >= 1 ? "hover:opacity-90" : "cursor-not-allowed opacity-50",
                )}
                style={{
                  background: amountNum >= 1
                    ? `linear-gradient(135deg, ${B.green} 0%, ${B.greenDark} 100%)`
                    : "#94a3b8",
                }}
              >
                Generate QR Code
              </button>
            </div>

            {/* Info */}
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: B.blue }}>
                How UPI Cash Point Works
              </h3>
              <ol className="space-y-2 text-xs text-gray-600 leading-relaxed">
                {[
                  "Enter withdrawal amount",
                  "QR code is generated with payment details",
                  "Customer scans QR from any UPI app",
                  "Payment received — hand over cash to customer",
                  "Commission credited to your balance",
                ].map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: i === 4 ? "#ECFDF5" : "#EEF3FF",
                        color: i === 4 ? "#059669" : B.blueLight,
                      }}
                    >
                      {i === 4 ? "✓" : i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          /* ── QR Display Stage ───────────────────────── */
          <div className="space-y-5">
            {/* Branding strip */}
            <div
              className="flex items-center justify-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: `linear-gradient(135deg, ${B.blue} 0%, #1a3fb8 100%)` }}
            >
              <div className="flex items-center gap-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-white/20">
                  <span className="text-xs font-black text-white">AP</span>
                </div>
                <span className="text-xs font-bold text-white/90">AsanPay</span>
              </div>
              <div className="h-4 w-px bg-white/30" />
              <div className="flex items-center gap-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-white/20">
                  <span className="text-xs font-black text-white">YB</span>
                </div>
                <span className="text-xs font-bold text-white/90">YES Bank</span>
              </div>
              <div className="h-4 w-px bg-white/30" />
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold text-white/90 tracking-wide">
                UPI CASH POINT
              </span>
            </div>

            {/* QR Card */}
            <div className="rounded-2xl border bg-white p-6 text-center" style={{ borderColor: B.border }}>
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
                  className="rounded p-1 hover:bg-gray-200"
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
            <div className="flex items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 border" style={{ borderColor: B.border }}>
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
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black text-white"
                      style={{ backgroundColor: app.color }}
                    >
                      {app.short[0]}
                    </div>
                    <span className="text-[11px] font-semibold text-gray-600">{app.short}</span>
                  </div>
                ))}
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-500">
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
        )}
      </div>
    </AppShell>
  );
}

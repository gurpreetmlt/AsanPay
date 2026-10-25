"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, Info, QrCode } from "lucide-react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { fetchApi } from "@/lib/api";
import { useBalanceVisibility } from "@/lib/balanceVisibility";
import { B } from "@/lib/brand";
import type { WalletBalance } from "@/lib/types";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";

type Props = {
  quickAmounts: readonly { amount: number; hint: string | null }[];
  amount: string;
  onAmountChange: (v: string) => void;
  amountError: string | null;
  amountHint: string;
  customerMobile: string;
  onMobileChange: (v: string) => void;
  canGenerate: boolean;
  busy: boolean;
  onGenerate: () => void;
  notes: string[];
};

export function UpiNewLayoutForm({
  quickAmounts,
  amount,
  onAmountChange,
  amountError,
  amountHint,
  customerMobile,
  onMobileChange,
  canGenerate,
  busy,
  onGenerate,
  notes,
}: Props) {
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const balanceVisible = useBalanceVisibility((s) => s.visible);
  const toggleBalance = useBalanceVisibility((s) => s.toggle);

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

  const shown = ["main", "aeps"]
    .map((t) => wallets.find((w) => w.walletType === t))
    .filter((w): w is WalletBalance => Boolean(w));

  const inputClass =
    "w-full rounded-xl border bg-gray-50 px-3.5 py-3 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Services / UPI Cash Point</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color: B.blue }}>
            UPI Cash Point
          </h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Customer scans the QR with any UPI app and pays; you hand over the cash.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shown.map((w) => (
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
          ))}
          <button
            type="button"
            onClick={() => toggleBalance()}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border bg-white text-gray-500 shadow-sm"
            style={{ borderColor: B.border }}
            aria-label={balanceVisible ? "Hide balances" : "Show balances"}
          >
            {balanceVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: B.border }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: B.blue }}>
            <QrCode size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">UPI cash withdrawal</h2>
            <p className="text-xs text-gray-500">Enter the amount and customer mobile, then generate the QR.</p>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Quick amount</p>
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map(({ amount: a }) => {
                const active = amount === String(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onAmountChange(String(a))}
                    className={clsx(
                      "cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition",
                      active ? "text-white shadow-md" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                    )}
                    style={active ? { background: B.blue } : undefined}
                  >
                    ₹{a.toLocaleString("en-IN")}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Amount
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="₹ Enter amount"
                className={inputClass}
                style={{ borderColor: amountError ? "#F87171" : "#E5E7EB" }}
                aria-invalid={Boolean(amountError)}
              />
              <p className={clsx("mt-1.5 text-xs", amountError ? "font-semibold text-red-600" : "text-gray-500")}>
                {amountError ?? amountHint}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Customer mobile
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={customerMobile}
                onChange={(e) => onMobileChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Enter 10-digit mobile number"
                maxLength={10}
                className={inputClass}
                style={{ borderColor: "#E5E7EB" }}
              />
            </div>
            <div className="lg:pt-[26px]">
              <PrimaryButton
                type="button"
                variant="primary"
                loading={busy}
                disabled={!canGenerate}
                onClick={onGenerate}
                className="h-[46px] min-w-[180px]"
                showArrow={false}
              >
                Generate QR
                <QrCode size={16} strokeWidth={2.4} />
              </PrimaryButton>
            </div>
          </div>

          <div className="grid gap-2 rounded-xl bg-slate-50 p-3.5 sm:grid-cols-3">
            {notes.map((note) => (
              <p key={note} className="flex items-start gap-2 text-xs leading-relaxed text-gray-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: B.blue }} />
                {note}
              </p>
            ))}
          </div>

          <p className="flex items-start gap-2 text-xs text-gray-500">
            <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
            The QR stays valid for 2 minutes. Your shop location is captured when you tap Generate QR.
          </p>
        </div>
      </section>
    </div>
  );
}

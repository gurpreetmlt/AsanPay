"use client";

import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import type { WalletBalance } from "@/lib/types";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";

interface Props {
  wallets: WalletBalance[];
  onRefresh?: () => void;
  refreshing?: boolean;
  subtitle?: string;
}

export function WalletBar({ wallets, onRefresh, refreshing, subtitle }: Props) {
  const [visible, setVisible] = useState(true);
  const ordered = [...wallets].sort((a, b) => {
    if (a.walletType === "main") return -1;
    if (b.walletType === "main") return 1;
    return a.walletType.localeCompare(b.walletType);
  });
  const primary = ordered[0];
  const secondary = ordered.slice(1);

  return (
    <div className="mt-2 flex overflow-hidden rounded-xl border border-white/55 bg-white shadow-md">
      <div className="w-1 bg-gradient-to-b from-green-500 to-green-700" />
      <div className="flex-1 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {primary ? walletDisplayName(primary.walletType) : "Available balance"}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-gray-500 hover:text-gray-700"
              aria-label="Toggle balance visibility"
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-green-600 disabled:opacity-50"
                aria-label="Refresh balance"
              >
                <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-xl font-extrabold tracking-tight text-gray-900">
          {visible ? formatInr(primary?.balance ?? "0") : "₹ ••••••"}
        </p>
        {subtitle ? (
          <span className="mt-1 inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600">
            {subtitle}
          </span>
        ) : null}
        {secondary.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-4 border-t border-border-subtle pt-2">
            {secondary.map((w) => (
              <div key={w.walletType}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  {walletDisplayName(w.walletType)}
                </p>
                <p className="text-sm font-bold text-gray-800">{visible ? formatInr(w.balance) : "••••"}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

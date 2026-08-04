"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, RefreshCw, LogOut } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import type { WalletBalance } from "@/lib/types";

interface WalletHeaderProps {
  wallets: WalletBalance[];
  onRefresh: () => void;
  refreshing: boolean;
}

export function WalletHeader({ wallets, onRefresh, refreshing }: WalletHeaderProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [visible, setVisible] = useState(true);

  const mainWallet = wallets.find((w) => w.walletType === "main");

  async function handleLogout() {
    const { logoutEverywhere } = await import("@/lib/logout");
    await logoutEverywhere();
    router.replace("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-border-subtle bg-card px-6 py-4">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs text-gray-500">Wallet Balance</p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">
              {visible ? `₹${mainWallet ? Number(mainWallet.balance).toLocaleString("en-IN") : "0"}` : "••••••"}
            </span>
            <button onClick={() => setVisible((v) => !v)} className="text-gray-400 hover:text-gray-600" aria-label="Toggle balance visibility">
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              onClick={onRefresh}
              className="text-gray-400 hover:text-brand-600 disabled:opacity-50"
              disabled={refreshing}
              aria-label="Refresh balance"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {wallets
          .filter((w) => w.walletType !== "main")
          .map((w) => (
            <div key={w.walletType} className="ml-6 border-l border-border-subtle pl-6">
              <p className="text-xs uppercase text-gray-500">{w.walletType}</p>
              <span className="text-sm font-semibold text-gray-700">
                {visible ? `₹${Number(w.balance).toLocaleString("en-IN")}` : "••••••"}
              </span>
            </div>
          ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{user?.name}</p>
          <p className="text-xs text-gray-500">{user?.uid}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-gray-600 hover:bg-surface"
        >
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </header>
  );
}

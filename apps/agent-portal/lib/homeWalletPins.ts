"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type PinnableWallet = "main" | "aeps";

interface HomeWalletPinsState {
  pins: Record<PinnableWallet, boolean>;
  toggle: (wallet: PinnableWallet) => void;
}

/** Wallet cards pinned to the dashboard Home (Settings → Home page). Off by default. */
export const useHomeWalletPins = create<HomeWalletPinsState>()(
  persist(
    (set, get) => ({
      pins: { main: false, aeps: false },
      toggle: (wallet) => set({ pins: { ...get().pins, [wallet]: !get().pins[wallet] } }),
    }),
    {
      name: "asanpay_home_wallet_pins",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ pins: s.pins }),
    },
  ),
);

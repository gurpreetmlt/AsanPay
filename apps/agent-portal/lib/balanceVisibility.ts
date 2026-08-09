"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface BalanceVisibilityState {
  visible: boolean;
  toggle: () => void;
  setVisible: (v: boolean) => void;
}

/** Shared across AppShell header + dashboard + wallet pages. */
export const useBalanceVisibility = create<BalanceVisibilityState>()(
  persist(
    (set, get) => ({
      visible: true,
      toggle: () => set({ visible: !get().visible }),
      setVisible: (visible) => set({ visible }),
    }),
    {
      name: "asanpay_balance_visible",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ visible: s.visible }),
    },
  ),
);

export function maskBalance(visible: boolean, formatted: string, hidden = "₹ ••••••") {
  return visible ? formatted : hidden;
}

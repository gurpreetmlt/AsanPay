import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Admin developer safety switches (browser localStorage).
 * Default OFF — row Delete icons stay hidden until an admin turns this on.
 */
interface DevOptionsState {
  /** When true, table row Delete / Trash actions are shown across admin. */
  rowDeleteEnabled: boolean;
  setRowDeleteEnabled: (enabled: boolean) => void;
}

export const useDevOptionsStore = create<DevOptionsState>()(
  persist(
    (set) => ({
      rowDeleteEnabled: false,
      setRowDeleteEnabled: (rowDeleteEnabled) => set({ rowDeleteEnabled }),
    }),
    {
      name: "asanpay-admin-dev-options",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

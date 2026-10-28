import { create } from "zustand";

export const DEFAULT_STORE_URL = "https://play.google.com/store/apps/details?id=com.asanpay.mobile";

interface AppUpdateState {
  required: boolean;
  storeUrl: string;
  markRequired: (storeUrl?: string) => void;
}

export const useAppUpdateStore = create<AppUpdateState>((set) => ({
  required: false,
  storeUrl: DEFAULT_STORE_URL,
  markRequired: (storeUrl) =>
    set((s) => ({ required: true, storeUrl: storeUrl?.trim() || s.storeUrl })),
}));

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@asanpay/shared-types";

interface AuthState {
  /** Session flag only — the real tokens live in httpOnly cookies set by the BFF routes under
   * /api/auth/*, never in this (localStorage-persisted) client store. */
  isAuthenticated: boolean;
  user: AuthUser | null;
  setAuth: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      setAuth: (user) => set({ user, isAuthenticated: true }),
      logout: () => set({ isAuthenticated: false, user: null }),
    }),
    { name: "asanpay-retailer-auth" },
  ),
);

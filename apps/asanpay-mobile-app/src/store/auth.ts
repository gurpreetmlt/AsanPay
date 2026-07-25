import { create } from "zustand";
import type { AuthUser } from "@asanpay/shared-types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** Session-only: user dismissed “set MPIN” gate. */
  mpinSetupSkipped: boolean;
  setAuth: (user: AuthUser, tokens: { accessToken: string; refreshToken: string }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  updateUser: (user: AuthUser) => void;
  skipMpinSetup: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  mpinSetupSkipped: false,
  setAuth: (user, tokens) =>
    set({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      mpinSetupSkipped: false,
    }),
  setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
  updateUser: (user) => set({ user }),
  skipMpinSetup: () => set({ mpinSetupSkipped: true }),
  logout: () =>
    set({ accessToken: null, refreshToken: null, user: null, mpinSetupSkipped: false }),
}));

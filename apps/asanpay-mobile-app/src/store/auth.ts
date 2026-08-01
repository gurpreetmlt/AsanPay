import { create } from "zustand";
import type { AuthUser } from "@asanpay/shared-types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** Session-only: user dismissed “set MPIN” gate. */
  mpinSetupSkipped: boolean;
  /** Keep 9-step signup mounted after account create / resume from dashboard banner. */
  signupContinue: boolean;
  setAuth: (user: AuthUser, tokens: { accessToken: string; refreshToken: string }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  updateUser: (user: AuthUser) => void;
  skipMpinSetup: () => void;
  setSignupContinue: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  mpinSetupSkipped: false,
  signupContinue: false,
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
  setSignupContinue: (signupContinue) => set({ signupContinue }),
  logout: () =>
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      mpinSetupSkipped: false,
      signupContinue: false,
    }),
}));

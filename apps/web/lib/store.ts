import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthUser } from "@asanpay/shared-types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (user: AuthUser, tokens: { accessToken: string; refreshToken: string }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: (user, tokens) => set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      logout: () => {
        try {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("asanpay-web-biometric");
            window.sessionStorage.removeItem("asanpay-web-biometric");
          }
        } catch {
          /* ignore */
        }
        set({ accessToken: null, refreshToken: null, user: null });
      },
    }),
    {
      name: "asanpay-web-auth-state",
      // localStorage (not sessionStorage) so the session survives an app/process restart —
      // required for the 12h device-trust window (see DEVICE_TRUST_WINDOW_MS in the backend)
      // to actually work on the mobile WebView, which gets killed/restarted by the OS far more
      // often than a desktop browser tab closes.
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

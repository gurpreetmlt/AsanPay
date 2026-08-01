"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import api from "@/lib/api";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";

const SKIP = new Set(["/login", "/signup"]);

/**
 * Refresh /auth/me. Dashboard is allowed without outlet/PIN; KYC lock is UI-level.
 */
export function useOnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const fetching = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      if (!SKIP.has(pathname) && pathname !== "/") router.replace("/login");
      return;
    }

    if (fetching.current) return;
    fetching.current = true;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
        if (cancelled || !data.success) return;
        setUser(data.data.user);
      } catch {
        // keep cached user
      } finally {
        fetching.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, accessToken, pathname, router, setUser]);
}

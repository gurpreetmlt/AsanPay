import { cookies } from "next/headers";

/**
 * Server-only BFF auth cookies. Named per-app (`ap_rw_*`) even though cookies are already
 * origin-scoped (no explicit `domain` set) — keeps them unambiguous in devtools when multiple
 * AsanPay portals are open in the same browser during testing.
 */
export const ACCESS_COOKIE = "ap_rw_at";
export const REFRESH_COOKIE = "ap_rw_rt";

export const BACKEND_URL = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax (not None) is the CSRF defense here: cross-site fetch/XHR POST never attaches a Lax
    // cookie, only same-site requests and top-level GET navigations do. No separate CSRF token.
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const store = await cookies();
  // Access token: short-lived, matches backend's own access-token TTL practice (kept generous
  // here since the proxy refreshes transparently on 401 anyway).
  store.set(ACCESS_COOKIE, accessToken, cookieOptions(60 * 15));
  store.set(REFRESH_COOKIE, refreshToken, cookieOptions(60 * 60 * 24 * 30));
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getAuthCookies(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: store.get(REFRESH_COOKIE)?.value ?? null,
  };
}

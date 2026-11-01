import { cookies } from "next/headers";

export const ACCESS_COOKIE = "ap_w_at";
export const REFRESH_COOKIE = "ap_w_rt";
/** Set after a phone approval — password login on this browser skips approval for 1 day. */
export const TRUSTED_BROWSER_COOKIE = "ap_w_tb";

export const BACKEND_URL =
  (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, cookieOptions(60 * 15));
  store.set(REFRESH_COOKIE, refreshToken, cookieOptions(60 * 60 * 24 * 30));
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function setTrustedBrowserCookie(token: string, expiresAt: string) {
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const store = await cookies();
  store.set(TRUSTED_BROWSER_COOKIE, token, cookieOptions(seconds));
}

export async function getTrustedBrowserCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(TRUSTED_BROWSER_COOKIE)?.value ?? null;
}

export async function getAuthCookies(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: store.get(REFRESH_COOKIE)?.value ?? null,
  };
}

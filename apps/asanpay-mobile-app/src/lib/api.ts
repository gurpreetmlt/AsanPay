import axios from "axios";
import type { ApiResponse } from "@asanpay/shared-types";
import { useAuthStore } from "../store/auth";
import { resolveDevApiHost } from "../utils/resolveDevApiHost";
import { BRAND } from "../theme/brand";

const devHost = resolveDevApiHost();

export const API_BASE = __DEV__
  ? `http://${devHost}:4000/api`
  : "https://api.asanpay.in/api";

if (__DEV__) {
  console.log(`[${BRAND.appName}] API → ${API_BASE}`);
}

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

/** BestAPI → UIDAI Aadhaar OTP can exceed the default mobile timeout. */
export const AADHAAR_OTP_TIMEOUT_MS = 90_000;

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return /\/auth\/(login|refresh|logout|otp|mpin|signup)/.test(url);
}

// Screens fire several requests in parallel (Promise.all). If the access token has expired,
// each one independently hits the 401 branch below — without de-duping, they'd each call
// /auth/refresh with the SAME (not-yet-rotated) refresh token. The backend rotates + revokes
// the old refresh token on first use, so concurrent calls look like a replay attack and it
// responds by revoking every trusted device for the user. This coalesces concurrent refreshes
// for the same token into a single in-flight request.
let inFlightRefresh: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

async function refreshOnce(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const { data } = await axios.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
        `${API_BASE}/auth/refresh`,
        { refreshToken },
      );
      return data.success ? data.data : null;
    } catch {
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthEndpoint(original.url)
    ) {
      original._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        const refreshed = await refreshOnce(refreshToken);
        if (refreshed) {
          useAuthStore.getState().setTokens(refreshed.accessToken, refreshed.refreshToken);
          original.headers.Authorization = `Bearer ${refreshed.accessToken}`;
          return api(original);
        }
        useAuthStore.getState().logout();
      } else {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  },
);

export function setAuthHeader(token: string | null) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

export async function fetchApi<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(path, { params });
  if (!data.success) throw new Error(data.message);
  return data.data;
}

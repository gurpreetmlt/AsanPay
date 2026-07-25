import axios from "axios";
import type { ApiResponse } from "@asanpay/shared-types";
import { useAuthStore } from "../store/auth";
import { resolveDevApiHost } from "../utils/resolveDevApiHost";
import { BRAND } from "../theme/brand";

const devHost = resolveDevApiHost();

export const API_BASE = __DEV__
  ? `http://${devHost}:4000/api`
  : "https://api.asanpay.com/api";

if (__DEV__) {
  console.log(`[${BRAND.appName}] API → ${API_BASE}`);
}

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return /\/auth\/(login|refresh|logout|otp|mpin|signup)/.test(url);
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
        try {
          const { data } = await axios.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
            `${API_BASE}/auth/refresh`,
            { refreshToken },
          );
          if (data.success) {
            useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken);
            original.headers.Authorization = `Bearer ${data.data.accessToken}`;
            return api(original);
          }
        } catch {
          useAuthStore.getState().logout();
        }
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

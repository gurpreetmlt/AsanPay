import axios from "axios";
import type { ApiResponse } from "@asanpay/shared-types";
import { useAuthStore } from "./store";

const API_BASE = "/api/proxy";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  // Default short; Aadhaar OTP / long KYC calls pass a higher per-request timeout.
  timeout: 15_000,
});

/** BestAPI → UIDAI; keep under Coolify upstream limits (~30–60s). */
export const AADHAAR_OTP_TIMEOUT_MS = 45_000;

/** Must stay above backend Vyapar timeout (20s) and under Coolify/Traefik kill. */
export const RECHARGE_TIMEOUT_MS = 28_000;

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const url = String(error.config?.url ?? "");
      // Wrong Aadhaar/PAN OTP must not wipe the signup session.
      const keepSession = /\/kyc\/(aadhaar\/otp|pan)/.test(url);
      if (!keepSession) useAuthStore.getState().logout();
    }
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === "PASSWORD_CHANGE_REQUIRED" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/set-password"
    ) {
      window.location.assign("/set-password");
    }
    return Promise.reject(error);
  },
);

export default api;

export async function fetchApi<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(url, { params });
  if (!data.success) throw new Error(data.message);
  return data.data;
}

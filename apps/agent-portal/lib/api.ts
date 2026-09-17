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

/** BestAPI → UIDAI Aadhaar OTP can exceed the default 15s axios timeout. */
export const AADHAAR_OTP_TIMEOUT_MS = 90_000;

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const url = String(error.config?.url ?? "");
      // Wrong Aadhaar/PAN OTP must not wipe the signup session.
      const keepSession = /\/kyc\/(aadhaar\/otp|pan)/.test(url);
      if (!keepSession) useAuthStore.getState().logout();
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

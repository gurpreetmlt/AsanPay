import axios from "axios";
import type { ApiResponse } from "@asanpay/shared-types";
import { useAuthStore } from "./store";

// Same-origin BFF proxy — never the real backend directly. The httpOnly session cookie is
// attached by the browser automatically; no Authorization header or token handling needed here.
const api = axios.create({
  baseURL: "/api/proxy",
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // The proxy already retried once with a refreshed token server-side; a 401 here means the
    // session is genuinely dead (refresh token invalid/expired too).
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
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

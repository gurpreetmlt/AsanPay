import { API_BASE } from "../lib/api";

type AxiosLike = {
  message?: string;
  response?: {
    status?: number;
    data?: { message?: string; code?: string };
  };
};

export function apiError(err: unknown, fallback: string): string {
  const e = err as AxiosLike;
  const axiosMsg = e.message;

  if (axiosMsg === "Network Error" || axiosMsg?.includes("Network request failed")) {
    return (
      `Cannot reach API (${API_BASE}).\n` +
      `1) Mac Terminal: npm run dev:backend\n` +
      `2) Phone USB: adb reverse tcp:4000 tcp:4000`
    );
  }

  const bodyMsg = e.response?.data?.message;
  if (bodyMsg) return bodyMsg;

  const status = e.response?.status;
  if (status) return `API error ${status} (${API_BASE})`;

  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

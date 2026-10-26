import type { ApiResponse, AuthUser, LinkCheckResult, LinkedAccountsResponse, UserRole } from "@asanpay/shared-types";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";

export type OtpSent = { message: string; expiresInSeconds: number; mobileMasked: string; otp?: string };

function unwrap<T>(res: ApiResponse<T>): { data: T; message: string } {
  if (!res.success) throw new Error(res.message);
  return { data: res.data, message: res.message ?? "" };
}

export async function fetchLinkedAccounts(): Promise<LinkedAccountsResponse> {
  const { data } = await api.get<ApiResponse<LinkedAccountsResponse>>("/linked-accounts");
  return unwrap(data).data;
}

export async function checkLink(mobile: string): Promise<LinkCheckResult> {
  const { data } = await api.post<ApiResponse<LinkCheckResult>>("/linked-accounts/link/check", { mobile });
  return unwrap(data).data;
}

export async function startLink(mobile: string): Promise<OtpSent> {
  const { data } = await api.post<ApiResponse<OtpSent>>("/linked-accounts/link/start", { mobile });
  return unwrap(data).data;
}

export async function verifyLink(input: { mobile: string; otp: string; mpin: string }): Promise<LinkedAccountsResponse> {
  const { data } = await api.post<ApiResponse<LinkedAccountsResponse>>("/linked-accounts/link/verify", input);
  return unwrap(data).data;
}

export async function requestSwitchOtp(targetUserId: string): Promise<OtpSent> {
  const { data } = await api.post<ApiResponse<OtpSent>>("/linked-accounts/switch/otp", { targetUserId });
  return unwrap(data).data;
}

export async function switchToAccount(input: {
  targetUserId: string;
  mpin: string;
  otp?: string;
  acceptedPolicyVersion?: string;
}): Promise<{ user: AuthUser; message: string }> {
  const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/linked-accounts/switch", {
    ...input,
    policyChannel: "web",
  });
  const res = unwrap(data);
  return { user: res.data.user, message: res.message || "Account switched" };
}

export async function unlinkAccount(userId: string): Promise<LinkedAccountsResponse> {
  const { data } = await api.delete<ApiResponse<LinkedAccountsResponse>>(`/linked-accounts/${userId}`);
  return unwrap(data).data;
}

export function apiErrorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } }).response?.data?.code;
}

/** Distributor / SD = blue, Retailer = green (avatar + role chip). */
export function roleTheme(role: UserRole): { avatar: string; chipBg: string; chipText: string } {
  if (role === "retailer") {
    return { avatar: B.walletGrad, chipBg: "#E7F8EF", chipText: B.greenDark };
  }
  return { avatar: B.badgeGrad, chipBg: B.secondary, chipText: B.blue };
}

const SWITCH_TOAST_KEY = "asanpay.switchToast";

/** Full reload after a switch so no cached data from the previous account survives. */
export function finishSwitch(user: AuthUser, message: string): void {
  useAuthStore.getState().setAuth(user, { accessToken: "cookie", refreshToken: "cookie" });
  try {
    window.sessionStorage.setItem(SWITCH_TOAST_KEY, message);
  } catch {
    /* toast is optional */
  }
  window.location.href = "/dashboard";
}

export function takeSwitchToast(): string | null {
  try {
    const msg = window.sessionStorage.getItem(SWITCH_TOAST_KEY);
    if (msg) window.sessionStorage.removeItem(SWITCH_TOAST_KEY);
    return msg;
  } catch {
    return null;
  }
}

import type { ApiResponse, AuthUser, LinkCheckResult, LinkedAccountsResponse, UserRole } from "@asanpay/shared-types";
import { api, setAuthHeader } from "./api";
import { getDeviceId } from "./deviceId";
import { setRememberedLogin } from "./rememberedLogin";
import { useAuthStore } from "../store/auth";
import { colors } from "../theme/colors";

export type OtpSent = { message: string; expiresInSeconds: number; mobileMasked: string; otp?: string };

type SwitchSession = { user: AuthUser; accessToken: string; refreshToken: string };

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
}): Promise<{ session: SwitchSession; message: string }> {
  const { data } = await api.post<ApiResponse<SwitchSession>>("/linked-accounts/switch", {
    ...input,
    refreshToken: useAuthStore.getState().refreshToken ?? undefined,
    policyChannel: "app",
    deviceId: await getDeviceId(),
    deviceLabel: "AsanPay app",
  });
  const res = unwrap(data);
  return { session: res.data, message: res.message || "Account switched" };
}

export async function unlinkAccount(userId: string): Promise<LinkedAccountsResponse> {
  const { data } = await api.delete<ApiResponse<LinkedAccountsResponse>>(`/linked-accounts/${userId}`);
  return unwrap(data).data;
}

export function apiErrorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } }).response?.data?.code;
}

/**
 * Swap the in-memory session to the target account. Root navigator re-renders on the new user,
 * so every tab remounts and nothing cached from the previous account survives.
 */
export async function commitSwitch(session: SwitchSession): Promise<void> {
  const u = session.user;
  setAuthHeader(session.accessToken);
  await setRememberedLogin({
    mobile: u.mobile,
    role: u.role === "super_distributor" || u.role === "distributor" ? u.role : "retailer",
    name: u.name,
    lastAuthAt: Date.now(),
  });
  useAuthStore.getState().setAuth(u, { accessToken: session.accessToken, refreshToken: session.refreshToken });
}

/** Distributor / SD = blue, Retailer = green (avatar + role chip). Same as web. */
export function roleTheme(role: UserRole): { avatar: readonly [string, string]; chipBg: string; chipText: string } {
  if (role === "retailer") {
    return { avatar: [colors.greenLight, colors.greenDark] as const, chipBg: "#E7F8EF", chipText: colors.greenPayEnd };
  }
  return { avatar: colors.gradient, chipBg: colors.bluePale, chipText: colors.blue };
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

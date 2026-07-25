import type { AuthUser } from "@asanpay/shared-types";

/**
 * Post-auth funnel (retailer):
 * InstantPay Register Outlet → txn PIN
 * (Adhikari /kyc is optional / admin path — not the primary onboarding gate.)
 */
export function nextOnboardingPath(user: AuthUser | null | undefined): string | null {
  if (!user) return "/login";

  if (user.role === "retailer" && user.hasInstantpayOutlet !== true) {
    return "/onboarding/outlet";
  }
  if (user.hasTxnPin !== true) {
    return "/onboarding/pin";
  }
  return null;
}

export function extractApiError(err: unknown, fallback: string): string {
  const status = (err as { response?: { status?: number } }).response?.status;
  if (status === 429) return "Too many requests — wait a moment and retry";
  const data = (err as { response?: { data?: { message?: string; errors?: Record<string, string[] | undefined> } } })
    .response?.data;
  if (data?.errors) {
    const first = Object.values(data.errors).flat().find(Boolean);
    if (first) return first;
  }
  return data?.message ?? fallback;
}

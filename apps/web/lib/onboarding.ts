import type { AuthUser } from "@asanpay/shared-types";

/**
 * Post-auth: prefer dashboard. KYC / service unlock is enforced on the dashboard
 * (banner + locked tiles). Outlet / PIN are optional follow-ups, not hard gates.
 */
export function nextOnboardingPath(user: AuthUser | null | undefined): string | null {
  if (!user) return "/login";
  return null;
}

export function isKycServicesUnlocked(user: AuthUser | null | undefined): boolean {
  return user?.kycStatus === "verified";
}

/** Incomplete signup wizard (account exists but PAN/Aadhaar KYC not submitted). */
export function needsSignupKycCompletion(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.kycStatus === "verified") return false;
  if (user.kycStatus === "rejected") return true;
  return !user.hasKycDocs;
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

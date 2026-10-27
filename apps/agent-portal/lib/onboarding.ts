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
  return user?.kycStatus === "verified" && Boolean(user.hasKycDocs);
}

/** Incomplete signup wizard (account exists but PAN/Aadhaar KYC not submitted). */
export function needsSignupKycCompletion(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.kycStatus === "rejected") return true;
  // Verified only counts when PAN+Aadhaar are on file (same as new signup).
  if (user.kycStatus === "verified" && user.hasKycDocs) return false;
  return !user.hasKycDocs;
}

const AEPS_ONBOARDING_SKIP_KEY = "aepsOnboardingSkipped";

/** Session-only: AEPS / UPI Cash Point stop redirecting to onboarding until the tab is closed. */
export function markAepsOnboardingSkipped(): void {
  try {
    sessionStorage.setItem(AEPS_ONBOARDING_SKIP_KEY, "1");
  } catch {
    /* storage blocked — redirect will just show again */
  }
}

export function wasAepsOnboardingSkipped(): boolean {
  try {
    return sessionStorage.getItem(AEPS_ONBOARDING_SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function extractApiError(err: unknown, fallback: string): string {
  const status = (err as { response?: { status?: number } }).response?.status;
  if (status === 429) return "Too many requests — wait a moment and retry";
  const data = (
    err as {
      response?: { data?: { message?: string; code?: string; errors?: Record<string, string[] | undefined> } };
    }
  ).response?.data;
  if (status === 401 && data?.code === "UNAUTHENTICATED") {
    return "Your session has ended. Log in again to continue.";
  }
  if (data?.errors) {
    const first = Object.values(data.errors).flat().find(Boolean);
    if (first) return first;
  }
  if (data?.message) return data.message;

  const code = (err as { code?: string }).code;
  const msg = err instanceof Error ? err.message : "";
  if (code === "ECONNABORTED" || /timeout/i.test(msg)) {
    return "Request timed out. Check your connection and try again.";
  }
  if (code === "ERR_NETWORK" || /network error/i.test(msg)) {
    return "Could not reach the API. Try again in a moment.";
  }
  return fallback;
}

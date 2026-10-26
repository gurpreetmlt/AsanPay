import { POLICY_VERSION } from "@asanpay/shared-types";

/** Last legal bundle version accepted on this browser; pre-ticks the login checkbox. */
const POLICY_STORAGE_NAME = "asanpay.policyAccepted.v1";

export function hasAcceptedCurrentPolicy(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(POLICY_STORAGE_NAME) === POLICY_VERSION;
  } catch {
    return false;
  }
}

export function rememberPolicyAccepted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POLICY_STORAGE_NAME, POLICY_VERSION);
  } catch {
    /* storage unavailable — checkbox just won't be pre-ticked next time */
  }
}

export function forgetPolicyAccepted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(POLICY_STORAGE_NAME);
  } catch {
    /* ignore */
  }
}

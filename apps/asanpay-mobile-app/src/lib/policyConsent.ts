import { POLICY_VERSION } from "@asanpay/shared-types";
import { createAppStorage } from "./appStorage";

/** Last legal bundle version accepted on this device; pre-ticks the login checkbox. */
const POLICY_STORAGE_NAME = "asanpay.policyAccepted.v1";
const storage = createAppStorage();

export async function hasAcceptedCurrentPolicy(): Promise<boolean> {
  try {
    return (await storage.getItem(POLICY_STORAGE_NAME)) === POLICY_VERSION;
  } catch {
    return false;
  }
}

export async function rememberPolicyAccepted(): Promise<void> {
  await storage.setItem(POLICY_STORAGE_NAME, POLICY_VERSION);
}

export async function forgetPolicyAccepted(): Promise<void> {
  await storage.removeItem(POLICY_STORAGE_NAME);
}

/** Extra login body fields once the user has ticked the box (or accepted earlier on this device). */
export const POLICY_PAYLOAD = { acceptedPolicyVersion: POLICY_VERSION, policyChannel: "app" } as const;

export function isPolicyRequiredError(err: unknown): boolean {
  return (err as { response?: { data?: { code?: string } } })?.response?.data?.code === "POLICY_ACCEPTANCE_REQUIRED";
}

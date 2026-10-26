import { env, isNobleAepsMode } from "../../config/env";

/**
 * Service codes that STILL follow AEPS_PROVIDER_MODE (single env switch).
 * - agent_auth (daily 2FA) — must not 503 when provider_services seed is incomplete;
 *   same rail as AEPS_PROVIDER_MODE so finger capture → unlock works in prod
 *
 * Other AEPS/DMT product ops use `provider_services` (Developer Options → Providers).
 */
export const AEPS_ROUTED_SERVICE_CODES = new Set(["agent_auth"]);

export function isAepsRoutedService(serviceCode: string): boolean {
  return AEPS_ROUTED_SERVICE_CODES.has(serviceCode);
}

/** Adapter registry code for the current AEPS mode. */
export function aepsAdapterCode(): "noble" | null {
  return isNobleAepsMode() ? "noble" : null;
}

export function aepsProviderModeLabel(): string {
  return env.AEPS_PROVIDER_MODE;
}

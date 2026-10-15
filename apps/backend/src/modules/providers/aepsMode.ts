import { env, isInstantPayAepsMode, isPaySprintAepsMode } from "../../config/env";

/**
 * Service codes that STILL follow AEPS_PROVIDER_MODE (single env switch).
 * - Nepal remittance (InstantPay-specific endpoints)
 * - agent_auth (daily 2FA) — must not 503 when provider_services seed is incomplete;
 *   same rail as AEPS_PROVIDER_MODE so finger capture → unlock works in prod
 *
 * Other AEPS/DMT product ops use `provider_services` (Developer Options → Providers).
 */
export const AEPS_ROUTED_SERVICE_CODES = new Set([
  "agent_auth",
  "nepal_static_data",
  "nepal_payment_locations",
  "nepal_state_district",
  "nepal_outlet_status",
  "nepal_outlet_registration",
  "nepal_outlet_ekyc_initiate",
  "nepal_outlet_ekyc_status",
  "nepal_outlet_ekyc_process",
  "nepal_remitter_profile",
  "nepal_otp_request",
  "nepal_remitter_registration",
  "nepal_remitter_ekyc_initiate",
  "nepal_remitter_ekyc_status",
  "nepal_remitter_ekyc_process",
  "nepal_remitter_update",
  "nepal_beneficiary_registration",
  "nepal_service_charge",
  "nepal_fund_transfer",
  "nepal_fetch_txn_status",
  /** Nepal fund transfer settles against catalog service `MONEY_TRANSFER`. */
  "MONEY_TRANSFER",
]);

export function isAepsRoutedService(serviceCode: string): boolean {
  return AEPS_ROUTED_SERVICE_CODES.has(serviceCode);
}

/** Adapter registry code for the current AEPS mode. */
export function aepsAdapterCode(): "instantpay" | "paysprint" | null {
  if (isInstantPayAepsMode()) return "instantpay";
  if (isPaySprintAepsMode()) return "paysprint";
  return null;
}

export function aepsProviderModeLabel(): string {
  return env.AEPS_PROVIDER_MODE;
}

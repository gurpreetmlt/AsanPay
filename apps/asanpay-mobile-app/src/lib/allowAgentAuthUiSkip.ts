/**
 * Temporary UI-only bypass for daily agent 2FA screens (AePS / DMT / Nepal).
 * Does NOT call the provider — real money txns stay blocked until fingerprint succeeds.
 *
 * Release / Play builds: off. Metro debug (__DEV__) only.
 */
const FORCE_AGENT_AUTH_UI_SKIP = false;

export function allowAgentAuthUiSkip(): boolean {
  if (FORCE_AGENT_AUTH_UI_SKIP) return true;
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

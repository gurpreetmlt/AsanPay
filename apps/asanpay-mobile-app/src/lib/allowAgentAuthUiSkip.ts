/**
 * Temporary UI-only bypass for daily agent 2FA screens (AePS / DMT / Nepal).
 * Does NOT call the provider — real money txns stay blocked until fingerprint succeeds.
 *
 * Enabled in Metro debug (__DEV__) and also in release builds for now so demos work
 * without RD on phone. Set FORCE_AGENT_AUTH_UI_SKIP to false before Play Store public ship.
 */
const FORCE_AGENT_AUTH_UI_SKIP = true;

export function allowAgentAuthUiSkip(): boolean {
  if (FORCE_AGENT_AUTH_UI_SKIP) return true;
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

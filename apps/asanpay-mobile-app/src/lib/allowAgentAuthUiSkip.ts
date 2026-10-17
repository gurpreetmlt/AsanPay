/**
 * Temporary UI-only bypass for daily agent 2FA screens.
 * __DEV__ builds only (release APK never shows Skip).
 */
export function allowAgentAuthUiSkip(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

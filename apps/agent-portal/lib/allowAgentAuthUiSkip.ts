/**
 * Temporary UI-only bypass for daily agent 2FA screens (AePS / DMT / Nepal).
 * Does NOT call the provider or set lastAgentAuthAt — real txns stay blocked.
 *
 * Visible on localhost, *.dev hosts, and when NEXT_PUBLIC_ALLOW_AGENT_AUTH_UI_SKIP=true.
 * Never shows on production hostnames (e.g. app.asanpay.in) unless the env flag is set.
 */
export function allowAgentAuthUiSkip(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_ALLOW_AGENT_AUTH_UI_SKIP === "true") return true;

  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === "dev.asanpay.in" || host.endsWith(".dev.asanpay.in")) return true;
  if (host.startsWith("dev.") || host.includes(".dev.")) return true;
  return false;
}

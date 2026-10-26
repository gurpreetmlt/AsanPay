const SENSITIVE_QUERY_KEY = /token|secret|key|signature|password|passwd|otp|auth|hash|pin/i;

export const REDACTED = "[REDACTED]";

/** Replaces values of credential-like query params (webhook tokens, api keys, OTPs) before logging. */
export function redactUrlQuery(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const pairs = url
    .slice(q + 1)
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq < 0) return pair;
      const rawKey = pair.slice(0, eq);
      let key = rawKey;
      try {
        key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      } catch {
        /* keep raw key */
      }
      return SENSITIVE_QUERY_KEY.test(key) ? `${rawKey}=${REDACTED}` : pair;
    });
  return `${url.slice(0, q)}?${pairs.join("&")}`;
}

const SENSITIVE_LOG_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "otp",
  "mpin",
  "pin",
  "transactionPin",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "api_key",
  "secret",
  "aadhaar",
  "aadhaarNumber",
  "panNumber",
  "biometricPayload",
  "pidData",
  "bankAccountNumber",
  "accountNumber",
];

/** pino `redact` paths: top level, one level deep (`{ body: {...} }`) and two levels deep. */
export const LOG_REDACT_PATHS: string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "*.headers.authorization",
  "*.headers.cookie",
  ...SENSITIVE_LOG_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

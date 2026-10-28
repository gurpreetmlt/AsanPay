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
  "dob",
  "fatherName",
];

/** Personal contact fields: masked (last 4 digits / first letter of email), not removed — support still needs a hint. */
const MASKED_LOG_KEYS = ["mobile", "customerMobile", "mobileNumber", "beneMobileNumber", "email", "to"];

/** pino `redact` paths: top level, one level deep (`{ body: {...} }`) and two levels deep. */
export const LOG_REDACT_PATHS: string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "*.headers.authorization",
  "*.headers.cookie",
  ...[...SENSITIVE_LOG_KEYS, ...MASKED_LOG_KEYS].flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

/** pino censor: mask phone numbers and emails, fully redact everything else on the list. */
export function censorLogValue(value: unknown, path: string[]): unknown {
  const key = path[path.length - 1] ?? "";
  if (!MASKED_LOG_KEYS.includes(key)) return REDACTED;
  if (typeof value !== "string") return value;
  const at = value.indexOf("@");
  if (at > 0) return `${value[0]}***${value.slice(at)}`;
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 6) return `••••${digits.slice(-4)}`;
  return value;
}

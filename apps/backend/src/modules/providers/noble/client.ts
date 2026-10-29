import { env, isNobleConfigured } from "../../../config/env";
import { sendSlackAlert } from "../../../utils/alert";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import {
  readNobleSession,
  readNobleSessionRow,
  withNobleLoginLock,
  type SessionOwner,
  type StoredSession,
} from "./tokenStore";

const LOGIN_PATH = "/api/v1.0/client_auth/login";

/** Refresh this long before the stored expiry. */
const TOKEN_SKEW_MS = 60_000;
/** Login runs inside a DB transaction; must stay well under idle_in_transaction_session_timeout (60 s). */
const LOGIN_TIMEOUT_MS = 20_000;
/** Provider allows only a few logins per day; after a limit reply, don't ask again for this long. */
const LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
const LIMIT_ALERT_EVERY_MS = 60 * 60 * 1000;
/** Header token rejected: 401, AE0026 (invalid), AE0027 (expired). */
const TOKEN_REJECTED_CODES = new Set(["AE0026", "AE0027"]);
/** Under the 90 s "initiated" recheck window, so a hung submit never races its own status check. */
const NOBLE_TIMEOUT_MS = 40_000;

export type NobleHost = "service" | "aeps" | "dmt" | "recharge" | "cms";

export interface NobleApiResponse {
  status?: number;
  statusCode?: string;
  message?: string;
  description?: string;
  responseData?: unknown;
  [key: string]: unknown;
}

let cachedToken: string | null = null;
let cachedExpiresAtMs: number | null = null;
let loginInFlight: Promise<string> | null = null;
let limitHitAtMs: number | null = null;
let limitAlertAtMs: number | null = null;

export function nobleBaseUrl(host: NobleHost): string {
  switch (host) {
    case "service":
      return env.NOBLE_BASE_SERVICE;
    case "aeps":
      return env.NOBLE_BASE_AEPS;
    case "dmt":
      return env.NOBLE_BASE_DMT;
    case "recharge":
      return env.NOBLE_BASE_RECHARGE;
    case "cms":
      return env.NOBLE_BASE_CMS;
  }
}

/**
 * Provider requires IST wall-clock: yyyy-MM-dd'T'HH:mm:ss (skew ~15s).
 * Built via Asia/Kolkata so the server TZ does not matter.
 */
export function nobleTimestamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export function assertNobleConfigured(): void {
  if (isNobleConfigured()) return;
  throw new HttpError(
    503,
    "AEPS provider is not configured on the server. Contact support.",
    "NOBLE_NOT_CONFIGURED",
  );
}

/** Test helper — clear in-memory token between unit tests. */
export function clearNobleTokenCache(): void {
  cachedToken = null;
  cachedExpiresAtMs = null;
  loginInFlight = null;
  limitHitAtMs = null;
  limitAlertAtMs = null;
}

function parseJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  const segment = parts[1];
  if (!segment) return null;
  try {
    const payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as {
      exp?: number;
    };
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function istDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

/** Fallback expiry when the token carries no exp: end of the current IST day minus 5 minutes. */
function endOfIstDayMs(now: Date = new Date()): number {
  const [y, m, d] = istDay(now).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d! + 1) - 330 * 60_000 - 5 * 60_000;
}

function processOwner(): SessionOwner {
  if (/[\\/]scripts[\\/]/.test(process.argv[1] ?? "")) return "script";
  return env.PROCESS_ROLE;
}

function usable(session: StoredSession | null, failedToken: string | undefined): session is StoredSession {
  return (
    session != null &&
    session.token !== failedToken &&
    Date.now() < session.expiresAtMs - TOKEN_SKEW_MS
  );
}

function remember(session: StoredSession): string {
  cachedToken = session.token;
  cachedExpiresAtMs = session.expiresAtMs;
  return session.token;
}

const LIMIT_MESSAGE =
  "The provider login limit for today is reached. Services resume automatically when the provider resets the limit — contact support if this continues.";

function limitError(): HttpError {
  return new HttpError(503, LIMIT_MESSAGE, "NOBLE_TOKEN_LIMIT");
}

function onLoginLimit(detail: string, statusCode: string | undefined): never {
  const now = Date.now();
  limitHitAtMs = now;
  logger.error({ path: LOGIN_PATH, statusCode, owner: processOwner() }, "Provider daily login limit reached");
  if (limitAlertAtMs == null || now - limitAlertAtMs >= LIMIT_ALERT_EVERY_MS) {
    limitAlertAtMs = now;
    void sendSlackAlert("Provider daily login limit reached", "critical", {
      errorCode: statusCode ?? "NOBLE_TOKEN_LIMIT",
      message: `${detail} — all provider calls fail until the provider resets the limit.`,
      owner: processOwner(),
    }).catch((err) => logger.error({ err }, "Login limit alert failed"));
  }
  throw limitError();
}

async function loginForToken(): Promise<string> {
  assertNobleConfigured();
  if (limitHitAtMs != null && Date.now() - limitHitAtMs < LIMIT_COOLDOWN_MS) throw limitError();
  const url = `${nobleBaseUrl("service")}${LOGIN_PATH}`;
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": nobleTimestamp(),
      },
      body: JSON.stringify({
        apiKey: env.NOBLE_API_KEY!.trim(),
        apiValue: env.NOBLE_API_VALUE!.trim(),
      }),
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error({ err, path: LOGIN_PATH }, "Provider login network error");
    throw new HttpError(502, "Could not reach the AEPS provider. Try again.", "NOBLE_LOGIN_NETWORK");
  }

  const text = await res.text();
  let json: NobleApiResponse = {};
  try {
    json = text ? (JSON.parse(text) as NobleApiResponse) : {};
  } catch {
    logger.warn(
      { path: LOGIN_PATH, httpStatus: res.status, bodyLen: text.length },
      "Provider login non-JSON body",
    );
    throw new HttpError(502, "AEPS provider login returned an invalid response. Try again.", "NOBLE_LOGIN_INVALID");
  }

  const data = Array.isArray(json.responseData) ? json.responseData[0] : null;
  const token =
    data && typeof data === "object" && data !== null && "token" in data
      ? String((data as { token?: unknown }).token ?? "")
      : "";

  logger.info(
    {
      path: LOGIN_PATH,
      httpStatus: res.status,
      status: json.status,
      statusCode: json.statusCode,
      tokenLen: token.length,
      durationMs: Date.now() - started,
    },
    "Provider login response",
  );

  if (!res.ok || json.status !== 1 || !token) {
    const detail =
      (typeof json.description === "string" && json.description) ||
      (typeof json.message === "string" && json.message) ||
      "AEPS provider login failed";
    const statusCode = typeof json.statusCode === "string" ? json.statusCode : undefined;
    if (/token generation limit/i.test(detail)) onLoginLimit(detail, statusCode);
    throw new HttpError(res.status === 401 ? 401 : 502, detail, statusCode ?? "NOBLE_LOGIN_FAILED");
  }

  limitHitAtMs = null;
  return token;
}

async function loginAndStore(failedToken: string | undefined): Promise<string> {
  try {
    return await withNobleLoginLock(async (store) => {
      // Another process may have logged in while this one waited for the lock.
      const current = await store.read();
      if (usable(current, failedToken)) return remember(current);
      const token = await loginForToken();
      const session = { token, expiresAtMs: parseJwtExpMs(token) ?? endOfIstDayMs() };
      await store.save(session.token, session.expiresAtMs, processOwner(), istDay());
      return remember(session);
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Shared store unavailable (e.g. table not migrated yet): keep serving with a process-local token.
    logger.error({ err }, "Provider session store failed; using a process-local login");
    const token = await loginForToken();
    return remember({ token, expiresAtMs: parseJwtExpMs(token) ?? endOfIstDayMs() });
  }
}

/**
 * Login is capped per day for the whole client, so the token is shared through provider_sessions:
 * memory → DB → (advisory lock, re-check DB) → login. Pass failedToken after the provider rejected
 * a token; a newer token from another process is reused instead of logging in again.
 */
export async function getNobleToken(failedToken?: string): Promise<string> {
  const memory = cachedToken ? { token: cachedToken, expiresAtMs: cachedExpiresAtMs ?? 0 } : null;
  if (usable(memory, failedToken)) return memory.token;

  let stored: StoredSession | null = null;
  try {
    stored = await readNobleSession();
  } catch (err) {
    logger.error({ err }, "Provider session read failed");
  }
  if (usable(stored, failedToken)) return remember(stored);

  if (!loginInFlight) {
    loginInFlight = loginAndStore(failedToken).finally(() => {
      loginInFlight = null;
    });
  }
  return loginInFlight;
}

export interface NobleSessionInfo {
  expiresAt: string | null;
  obtainedAt: string | null;
  obtainedBy: string | null;
  loginsToday: number;
}

export async function getNobleSessionInfo(): Promise<NobleSessionInfo> {
  const row = await readNobleSessionRow();
  if (!row) return { expiresAt: null, obtainedAt: null, obtainedBy: null, loginsToday: 0 };
  return {
    expiresAt: row.expiresAt.toISOString(),
    obtainedAt: row.obtainedAt.toISOString(),
    obtainedBy: row.obtainedBy,
    loginsToday: row.loginCountDay === istDay() ? row.loginCount : 0,
  };
}

export async function noblePost(
  host: NobleHost,
  path: string,
  body: Record<string, unknown>,
  opts?: { retryOnUnauthorized?: boolean },
): Promise<{ httpStatus: number; json: NobleApiResponse }> {
  return nobleRequest("POST", host, path, body, opts);
}

export async function nobleGet(
  host: NobleHost,
  path: string,
  opts?: { retryOnUnauthorized?: boolean },
): Promise<{ httpStatus: number; json: NobleApiResponse }> {
  return nobleRequest("GET", host, path, null, opts);
}

async function nobleRequest(
  method: "GET" | "POST",
  host: NobleHost,
  path: string,
  body: Record<string, unknown> | null,
  opts?: { retryOnUnauthorized?: boolean },
): Promise<{ httpStatus: number; json: NobleApiResponse }> {
  assertNobleConfigured();
  const retryOnUnauthorized = opts?.retryOnUnauthorized !== false;
  const url = `${nobleBaseUrl(host)}${path.startsWith("/") ? path : `/${path}`}`;

  const doFetch = async (token: string) => {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Timestamp": nobleTimestamp(),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(NOBLE_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        logger.error({ host, path, timeoutMs: NOBLE_TIMEOUT_MS }, "Provider request timed out");
        throw new HttpError(
          504,
          "The provider did not answer in time. The transaction is pending — check its status in a few minutes.",
          "NOBLE_TIMEOUT",
        );
      }
      logger.error({ err, host, path }, "Provider network error");
      throw new HttpError(502, "Could not reach the AEPS provider. Try again.", "NOBLE_NETWORK");
    }

    const text = await res.text();
    let json: NobleApiResponse = {};
    try {
      json = text ? (JSON.parse(text) as NobleApiResponse) : {};
    } catch {
      json = { status: -1, message: text.slice(0, 200), rawText: text };
    }

    logger.info(
      {
        host,
        path,
        httpStatus: res.status,
        status: json.status,
        statusCode: json.statusCode,
        durationMs: Date.now() - started,
      },
      "Provider response",
    );
    return { httpStatus: res.status, json };
  };

  const token = await getNobleToken();
  const result = await doFetch(token);
  const rejected =
    result.httpStatus === 401 ||
    (typeof result.json.statusCode === "string" && TOKEN_REJECTED_CODES.has(result.json.statusCode));
  if (rejected && retryOnUnauthorized) {
    return doFetch(await getNobleToken(token));
  }
  return result;
}

import { env, isNobleConfigured } from "../../../config/env";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";

const LOGIN_PATH = "/api/v1.0/client_auth/login";

/** Soft refresh ahead of JWT exp when present; otherwise refresh only on 401. */
const TOKEN_SKEW_MS = 60_000;

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

function tokenStillValid(): boolean {
  if (!cachedToken) return false;
  if (cachedExpiresAtMs == null) return true;
  return Date.now() < cachedExpiresAtMs - TOKEN_SKEW_MS;
}

async function loginForToken(): Promise<string> {
  assertNobleConfigured();
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
    throw new HttpError(
      res.status === 401 ? 401 : 502,
      detail,
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_LOGIN_FAILED",
    );
  }

  cachedToken = token;
  cachedExpiresAtMs = parseJwtExpMs(token);
  return token;
}

export async function getNobleToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenStillValid()) return cachedToken!;
  return loginForToken();
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
      });
    } catch (err) {
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

  let token = await getNobleToken();
  let result = await doFetch(token);
  if (result.httpStatus === 401 && retryOnUnauthorized) {
    token = await getNobleToken(true);
    result = await doFetch(token);
  }
  return result;
}

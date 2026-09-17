import { env } from "../../../config/env";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";

export type BestApiJson = Record<string, unknown>;

export function bestApiConfigured(): boolean {
  return Boolean(env.BESTAPI_API_KEY?.trim() && env.BESTAPI_API_SECRET?.trim());
}

function bestApiCreds(): { key: string; secret: string; base: string } {
  const key = env.BESTAPI_API_KEY?.trim();
  const secret = env.BESTAPI_API_SECRET?.trim();
  if (!key || !secret) {
    throw new HttpError(
      503,
      "BestAPI is not configured. Set BESTAPI_API_KEY and BESTAPI_API_SECRET on the backend.",
      "BESTAPI_NOT_CONFIGURED",
    );
  }
  return {
    key,
    secret,
    base: (env.BESTAPI_BASE_URL || "https://bestapi.in").replace(/\/$/, ""),
  };
}

function buildUrl(base: string, path: string, query?: Record<string, string | undefined>): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalized, `${base}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && String(v).trim() !== "") url.searchParams.set(k, String(v).trim());
    }
  }
  return url.toString();
}

function stripLargeStrings(value: unknown, depth = 0): unknown {
  if (value == null || depth > 8) return value;
  if (typeof value === "string") {
    return value.length > 400 ? `[omitted ${value.length} chars]` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => stripLargeStrings(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripLargeStrings(v, depth + 1);
    }
    return out;
  }
  return value;
}

export async function bestApiRequest(
  method: "GET" | "POST",
  path: string,
  opts?: {
    body?: Record<string, unknown>;
    query?: Record<string, string | undefined>;
    /** Override default 25s (must stay under Coolify/Traefik upstream kill). */
    timeoutMs?: number;
  },
): Promise<{ httpStatus: number; json: BestApiJson }> {
  const { key, secret, base } = bestApiCreds();
  const url = buildUrl(base, path, opts?.query);
  const started = Date.now();
  // Coolify/Traefik often drops idle upstream sockets ~30–60s. Return a JSON error before that
  // so the agent-portal proxy does not surface "Could not reach the API".
  const timeoutMs = opts?.timeoutMs ?? 25_000;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "X-Api-Key": key,
        "X-Api-Secret": secret,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(opts?.body ?? {}) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut =
      (err instanceof Error && err.name === "TimeoutError") || /aborted|timeout/i.test(msg);
    logger.error({ err, path, method, timedOut, timeoutMs }, "BestAPI network error");
    throw new HttpError(
      502,
      timedOut
        ? "Aadhaar verification is taking too long. Tap Resend OTP and try again."
        : "BestAPI network error. Try again.",
      timedOut ? "BESTAPI_TIMEOUT" : "BESTAPI_NETWORK",
    );
  }

  const text = await res.text();
  let json: BestApiJson = {};
  try {
    const parsed = text ? (JSON.parse(text) as BestApiJson) : {};
    // Aadhaar verify often returns huge base64 photos — strip before any deep walk / logging.
    json = stripLargeStrings(parsed) as BestApiJson;
  } catch {
    json = { message: text.slice(0, 200) };
  }

  logger.info(
    {
      path,
      method,
      queryKeys: opts?.query ? Object.keys(opts.query) : [],
      httpStatus: res.status,
      durationMs: Date.now() - started,
      bodyBytes: text.length,
      ok: res.ok,
    },
    "BestAPI response",
  );

  return { httpStatus: res.status, json };
}

export async function bestApiPost(
  path: string,
  body: Record<string, unknown>,
  query?: Record<string, string | undefined>,
  timeoutMs?: number,
): Promise<{ httpStatus: number; json: BestApiJson }> {
  return bestApiRequest("POST", path, { body, query, timeoutMs });
}

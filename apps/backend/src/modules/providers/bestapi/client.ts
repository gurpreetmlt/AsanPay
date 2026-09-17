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

export async function bestApiRequest(
  method: "GET" | "POST",
  path: string,
  opts?: { body?: Record<string, unknown>; query?: Record<string, string | undefined> },
): Promise<{ httpStatus: number; json: BestApiJson }> {
  const { key, secret, base } = bestApiCreds();
  const url = buildUrl(base, path, opts?.query);
  const started = Date.now();

  let res: Response;
  try {
    // Aadhaar OTP verify can wait on UIDAI; cap so Coolify/proxy don't kill a hung socket.
    res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "X-Api-Key": key,
        "X-Api-Secret": secret,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(opts?.body ?? {}) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut =
      (err instanceof Error && err.name === "TimeoutError") || /aborted|timeout/i.test(msg);
    logger.error({ err, path, method, timedOut }, "BestAPI network error");
    throw new HttpError(
      502,
      timedOut
        ? "Verification service timed out. Try again in a minute."
        : "BestAPI network error. Try again.",
      timedOut ? "BESTAPI_TIMEOUT" : "BESTAPI_NETWORK",
    );
  }

  const text = await res.text();
  let json: BestApiJson = {};
  try {
    json = text ? (JSON.parse(text) as BestApiJson) : {};
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
): Promise<{ httpStatus: number; json: BestApiJson }> {
  return bestApiRequest("POST", path, { body, query });
}

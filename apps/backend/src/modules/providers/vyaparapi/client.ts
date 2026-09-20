import { env } from "../../../config/env";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";

export interface VyaparApiJson {
  status?: boolean | string;
  statusCode?: number | string;
  message?: string;
  tid?: string;
  partnerid?: string;
  liveid?: string;
  number?: string;
  amount?: string | number;
  operator?: string;
  circle?: string;
  debited?: string | number;
  partnerBalance?: string | number;
  partnerHold?: string;
  ipAddress?: string;
  requestTime?: number;
  responseTime?: number;
  [key: string]: unknown;
}

export function vyaparApiKey(): string {
  const key = env.VYAPARAPI_API_KEY?.trim();
  if (!key) {
    throw new HttpError(
      503,
      "VyaparAPI is not configured. Set VYAPARAPI_API_KEY on the backend.",
      "VYAPARAPI_NOT_CONFIGURED",
    );
  }
  return key;
}

export function vyaparBaseUrl(): string {
  return env.VYAPARAPI_BASE_URL.replace(/\/$/, "");
}

export async function vyaparGet(
  path: string,
  query: Record<string, string | undefined>,
  opts?: { timeoutMs?: number },
): Promise<{ httpStatus: number; json: VyaparApiJson }> {
  const url = new URL(`${vyaparBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }

  // Coolify/Traefik often kills idle upstream ~30–60s. Fail before that so the portal
  // button stops spinning and the user gets a clear message (not a blank hang).
  const timeoutMs = opts?.timeoutMs ?? 20_000;

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut =
      (err instanceof Error && err.name === "TimeoutError") || /aborted|timeout/i.test(msg);
    logger.error({ err, path, timedOut, timeoutMs }, "VyaparAPI network error");
    throw new HttpError(
      502,
      timedOut
        ? "Operator did not respond in time. Check Transactions — do not recharge again with the same details until status is clear."
        : "VyaparAPI network error. Try again or check status later.",
      timedOut ? "VYAPARAPI_TIMEOUT" : "VYAPARAPI_NETWORK",
    );
  }

  const text = await res.text();
  let json: VyaparApiJson = {};
  try {
    json = text ? (JSON.parse(text) as VyaparApiJson) : {};
  } catch {
    json = { message: text.slice(0, 200), status: "PENDING" };
  }

  logger.info(
    {
      path,
      httpStatus: res.status,
      statusCode: json.statusCode,
      status: json.status,
      durationMs: Date.now() - started,
    },
    "VyaparAPI response",
  );

  return { httpStatus: res.status, json };
}

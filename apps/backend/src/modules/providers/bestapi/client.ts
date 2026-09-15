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

export async function bestApiPost(
  path: string,
  body: Record<string, unknown>,
): Promise<{ httpStatus: number; json: BestApiJson }> {
  const { key, secret, base } = bestApiCreds();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Api-Key": key,
        "X-Api-Secret": secret,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error({ err, path }, "BestAPI network error");
    throw new HttpError(502, "BestAPI network error. Try again.", "BESTAPI_NETWORK");
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
      httpStatus: res.status,
      durationMs: Date.now() - started,
      ok: res.ok,
    },
    "BestAPI response",
  );

  return { httpStatus: res.status, json };
}

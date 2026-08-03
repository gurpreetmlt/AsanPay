import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireIdempotencyKey when the Idempotency-Key header is present and valid. */
      idempotencyKey?: string;
    }
  }
}

/**
 * Money-mutating POSTs must send Idempotency-Key so a client retry cannot create a second
 * credit. The key is also available on req.idempotencyKey for handlers that store a replay.
 */
export function requireIdempotencyKey(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.headers["idempotency-key"];
  const key = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() : "";

  if (!key || key.length < 8 || key.length > 100) {
    throw new HttpError(
      422,
      "Idempotency-Key header is required (8–100 characters)",
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }

  req.idempotencyKey = key;
  next();
}

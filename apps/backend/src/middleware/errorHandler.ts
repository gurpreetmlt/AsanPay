import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

/** Drizzle wraps PG errors in `cause` — walk the chain so we can map schema misses. */
function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 6; depth += 1) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
      continue;
    }
    if (typeof cur === "object" && cur !== null && "message" in cur) {
      parts.push(String((cur as { message: unknown }).message));
      cur = (cur as { cause?: unknown }).cause;
      continue;
    }
    break;
  }
  return parts.join(" | ");
}

function isHttpErrorLike(err: unknown): err is HttpError {
  if (err instanceof HttpError) return true;
  if (typeof err !== "object" || err === null) return false;
  const e = err as { statusCode?: unknown; message?: unknown; code?: unknown; errors?: unknown };
  return typeof e.statusCode === "number" && typeof e.message === "string";
}

/** Drizzle / pg often wrap thrown HttpErrors in `cause` — unwrap before treating as 500. */
function findHttpError(err: unknown): HttpError | null {
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 6; depth += 1) {
    if (isHttpErrorLike(cur)) return cur;
    if (cur instanceof Error) {
      cur = cur.cause;
      continue;
    }
    if (typeof cur === "object" && cur !== null && "cause" in cur) {
      cur = (cur as { cause?: unknown }).cause;
      continue;
    }
    break;
  }
  return null;
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  const httpErr = findHttpError(err);
  if (httpErr) {
    res.status(httpErr.statusCode).json({
      success: false,
      message: httpErr.message,
      code: httpErr.code,
      errors: httpErr.errors,
    });
    return;
  }

  logger.error({ err, path: req.path }, "Unhandled error");

  const msg = collectErrorText(err);
  if (/column "?\w+"? does not exist/i.test(msg) || /relation "?\w+"? does not exist/i.test(msg)) {
    res.status(500).json({
      success: false,
      message: "Database is out of date. Run npm run db:migrate and restart the backend.",
      code: "DB_SCHEMA_OUTDATED",
    });
    return;
  }
  if (/invalid input value for enum/i.test(msg)) {
    res.status(500).json({
      success: false,
      message: "Database is out of date. Run npm run db:migrate on EC2 and restart the backend.",
      code: "DB_SCHEMA_OUTDATED",
    });
    return;
  }
  if (/Overdraft blocked/i.test(msg) || /Insufficient balance/i.test(msg)) {
    res.status(422).json({
      success: false,
      message:
        "Not enough balance left to reverse this entry — part of the credited amount was already spent.",
      code: "INSUFFICIENT_BALANCE",
    });
    return;
  }
  if (/wallets_balance_nonnegative|settleable_within_balance/i.test(msg)) {
    res.status(422).json({
      success: false,
      message:
        "Wallet balance cannot be reversed cleanly — the agent may have already spent part of this credit.",
      code: "INSUFFICIENT_BALANCE",
    });
    return;
  }
  if (/wallet_ledger_groups_ref_uidx|duplicate key value violates unique constraint/i.test(msg)) {
    res.status(500).json({
      success: false,
      message: "A ledger passbook row for this reference already exists. Try again or contact support.",
      code: "LEDGER_GROUP_CONFLICT",
    });
    return;
  }

  res.status(500).json({ success: false, message: "Internal server error" });
}

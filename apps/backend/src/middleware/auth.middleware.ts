import type { NextFunction, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { verifyAccessToken } from "../utils/jwt";
import { HttpError } from "../utils/httpError";
import { db } from "../db/postgres";
import { users, accounts } from "../db/postgres/schema";
import type { JwtAccessPayload } from "@asanpay/shared-types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtAccessPayload;
    }
  }
}

/**
 * Verifies Bearer JWT, then reloads the user from DB so deactivated accounts and
 * role changes take effect before the access token naturally expires.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new HttpError(401, "Missing or malformed Authorization header", "UNAUTHENTICATED");
      }

      const token = header.slice("Bearer ".length);
      let payload: JwtAccessPayload;
      try {
        payload = verifyAccessToken(token);
        if (payload.type !== "access") throw new Error("wrong token type");
      } catch {
        throw new HttpError(401, "Invalid or expired access token", "UNAUTHENTICATED");
      }

      // `block_login` is the full-freeze flag and is checked alongside `is_active`. Everything
      // short of a full freeze — services off, top-up off, even settlement off — must still let
      // the agent sign in: they need to see their balance, raise a ticket and call their upline.
      // Taking login away turns any suspicion into a customer you never hear from again.
      // bool_or rather than a plain join column: a user can own more than one account row (the
      // LEDGERTEST tenant creates its own, and per-tenant accounts are on the roadmap), and
      // picking an arbitrary one with limit(1) would make the freeze depend on row order.
      const [row] = await db
        .select({
          id: users.id,
          role: users.role,
          isActive: users.isActive,
          blockLogin: sql<boolean>`bool_or(coalesce(${accounts.blockLogin}, false))`,
        })
        .from(users)
        .leftJoin(accounts, eq(accounts.userId, users.id))
        .where(eq(users.id, payload.sub))
        .groupBy(users.id, users.role, users.isActive)
        .limit(1);

      if (!row || !row.isActive) {
        throw new HttpError(401, "Account is inactive", "ACCOUNT_INACTIVE");
      }
      if (row.blockLogin) {
        throw new HttpError(401, "Account is frozen — contact support", "ACCOUNT_FROZEN");
      }

      req.auth = { ...payload, role: row.role };
      next();
    } catch (err) {
      next(err);
    }
  })();
}

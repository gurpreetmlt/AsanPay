import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "../utils/jwt";
import { HttpError } from "../utils/httpError";
import { db } from "../db/postgres";
import { users } from "../db/postgres/schema";
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

      const [row] = await db
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (!row || !row.isActive) {
        throw new HttpError(401, "Account is inactive", "ACCOUNT_INACTIVE");
      }

      req.auth = { ...payload, role: row.role };
      next();
    } catch (err) {
      next(err);
    }
  })();
}

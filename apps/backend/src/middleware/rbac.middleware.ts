import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import type { UserRole } from "@asanpay/shared-types";

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    }
    if (!roles.includes(req.auth.role)) {
      throw new HttpError(403, "You do not have permission to perform this action", "FORBIDDEN");
    }
    next();
  };
}

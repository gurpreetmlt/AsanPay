import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import { getAppVersionConfig, getDeletionRequestStatus, requestAccountDeletion } from "./account.service";

/** Mounted at `/api` ahead of the other routers so the version check below sees every app request. */
export const accountRouter = Router();

// Only the mobile app sends X-App-Version-Code; web and server callers are never blocked.
accountRouter.use((req: Request, _res: Response, next: NextFunction) => {
  const raw = req.get("x-app-version-code");
  if (!raw || req.path === "/app/version") return next();
  const versionCode = Number.parseInt(raw, 10);
  const { minVersionCode } = getAppVersionConfig();
  if (Number.isFinite(versionCode) && versionCode < minVersionCode) {
    return next(
      new HttpError(
        426,
        "This app version is no longer supported. Update AsanPay from the Play Store to continue.",
        "APP_UPDATE_REQUIRED",
      ),
    );
  }
  next();
});

accountRouter.get("/app/version", (_req, res) => {
  sendSuccess(res, getAppVersionConfig());
});

const deletionSchema = z.object({
  reason: z.string().trim().max(300, "Reason must be 300 characters or less").optional(),
});

accountRouter.get("/account/deletion-request", requireAuth, async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  sendSuccess(res, await getDeletionRequestStatus(req.auth.sub));
});

accountRouter.post("/account/deletion-request", requireAuth, async (req, res) => {
  if (!req.auth) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  const parsed = deletionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Reason must be 300 characters or less", "VALIDATION_ERROR");
  }
  const result = await requestAccountDeletion(req.auth.sub, parsed.data, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
  sendSuccess(res, result, "Account deletion requested", 201);
});

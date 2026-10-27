import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { geoLinkPublicLimiter } from "../../middleware/rateLimiter";
import { validateBody } from "../../middleware/validate";
import { sendSuccess } from "../../utils/apiResponse";
import { HttpError } from "../../utils/httpError";
import {
  confirmGeoLink,
  confirmPublicGeoLink,
  getGeoLinkStatus,
  getPublicGeoLink,
  isSignupGeoPurpose,
  startGeoLink,
} from "./geoLink.service";

export const geoLinkRouter = Router();

const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/, "This location QR is not valid. Scan the QR shown on the web again.");

function publicToken(raw: unknown): string {
  const parsed = tokenSchema.safeParse(String(raw ?? ""));
  if (!parsed.success) {
    throw new HttpError(
      404,
      "This location link is not valid. Tap Generate new QR on the computer and scan again.",
      "GEO_LINK_NOT_FOUND",
    );
  }
  return parsed.data;
}

const publicConfirmSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyMeters: z.coerce.number().min(0).max(100000).optional(),
});

/** Public (phone camera → browser, no login): what this signup link captures. */
geoLinkRouter.get("/public/:token", geoLinkPublicLimiter, async (req, res) => {
  sendSuccess(res, await getPublicGeoLink(publicToken(req.params.token)));
});

/** Public: the phone browser posts its GPS for a signup shop / home link. */
geoLinkRouter.post(
  "/public/:token/confirm",
  geoLinkPublicLimiter,
  validateBody(publicConfirmSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof publicConfirmSchema>;
    const result = await confirmPublicGeoLink(publicToken(req.params.token), body, {
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    sendSuccess(res, result, "Location captured");
  },
);

geoLinkRouter.use(requireAuth);

const startSchema = z.object({
  purpose: z.enum(["onboarding", "aeps", "shop", "home"]),
});

const confirmSchema = z.object({
  token: tokenSchema,
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyMeters: z.coerce.number().min(0).max(100000).optional(),
  isMockLocation: z.boolean().optional(),
});

/** Web: create a QR for the phone to scan. Signup shop / home is open to every agent role. */
geoLinkRouter.post("/start", validateBody(startSchema), async (req, res) => {
  const body = req.body as z.infer<typeof startSchema>;
  if (!isSignupGeoPurpose(body.purpose) && req.auth!.role !== "retailer") {
    throw new HttpError(403, "You do not have permission to perform this action", "FORBIDDEN");
  }
  sendSuccess(res, await startGeoLink(req.auth!.sub, body.purpose));
});

/** Mobile: post the phone's GPS for a scanned QR. */
geoLinkRouter.post("/confirm", requireRole("retailer"), validateBody(confirmSchema), async (req, res) => {
  const body = req.body as z.infer<typeof confirmSchema>;
  sendSuccess(res, await confirmGeoLink(req.auth!.sub, body), "Location sent to the web");
});

/** Web: poll until the phone has verified the location. */
geoLinkRouter.get("/:token", async (req, res) => {
  sendSuccess(res, await getGeoLinkStatus(req.auth!.sub, String(req.params.token)));
});

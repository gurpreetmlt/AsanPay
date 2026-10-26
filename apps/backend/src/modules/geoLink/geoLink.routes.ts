import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validateBody } from "../../middleware/validate";
import { sendSuccess } from "../../utils/apiResponse";
import { confirmGeoLink, getGeoLinkStatus, startGeoLink } from "./geoLink.service";

export const geoLinkRouter = Router();

geoLinkRouter.use(requireAuth, requireRole("retailer"));

const startSchema = z.object({
  purpose: z.enum(["onboarding", "aeps"]),
});

const confirmSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{48}$/, "This location QR is not valid. Scan the QR shown on the web again."),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyMeters: z.coerce.number().min(0).max(100000).optional(),
  isMockLocation: z.boolean().optional(),
});

/** Web: create a QR for the phone to scan. */
geoLinkRouter.post("/start", validateBody(startSchema), async (req, res) => {
  const body = req.body as z.infer<typeof startSchema>;
  sendSuccess(res, await startGeoLink(req.auth!.sub, body.purpose));
});

/** Mobile: post the phone's GPS for a scanned QR. */
geoLinkRouter.post("/confirm", validateBody(confirmSchema), async (req, res) => {
  const body = req.body as z.infer<typeof confirmSchema>;
  sendSuccess(res, await confirmGeoLink(req.auth!.sub, body), "Location sent to the web");
});

/** Web: poll until the phone has verified the location. */
geoLinkRouter.get("/:token", async (req, res) => {
  sendSuccess(res, await getGeoLinkStatus(req.auth!.sub, String(req.params.token)));
});

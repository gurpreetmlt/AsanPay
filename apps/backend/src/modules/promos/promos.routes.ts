import { Router } from "express";
import { z } from "zod";
import { sendSuccess } from "../../utils/apiResponse";
import {
  absolutePromoUrl,
  listPromoSlides,
  type PromoPlacement,
} from "../tenants/promo.service";
import { resolveTenantId } from "../fund-requests/tenant";

export const promosRouter = Router();

function requestOrigin(req: { protocol: string; get: (h: string) => string | undefined }): string {
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  return `${proto}://${host}`;
}

/** Public — dashboard sidebar + future login slider. */
promosRouter.get("/", async (req, res) => {
  const placement = z
    .enum(["dashboard", "login"])
    .optional()
    .parse(typeof req.query.placement === "string" ? req.query.placement : undefined);
  const tenantId = await resolveTenantId();
  const slides = await listPromoSlides(tenantId, placement as PromoPlacement | undefined, true);
  const origin = requestOrigin(req);
  sendSuccess(
    res,
    slides.map((s) => ({
      ...s,
      imageUrl: absolutePromoUrl(s.imageUrl, origin),
    })),
  );
});

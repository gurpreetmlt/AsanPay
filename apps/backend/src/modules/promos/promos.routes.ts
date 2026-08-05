import { Router } from "express";
import { z } from "zod";
import { access } from "fs/promises";
import { constants } from "fs";
import { sendSuccess } from "../../utils/apiResponse";
import {
  absolutePromoUrl,
  listPromoSlides,
  resolvePromoFilePath,
  type PromoPlacement,
} from "../tenants/promo.service";
import { resolveTenantId } from "../fund-requests/tenant";
import { HttpError } from "../../utils/httpError";

export const promosRouter = Router();

function requestOrigin(req: { protocol: string; get: (h: string) => string | undefined }): string {
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  return `${proto}://${host}`;
}

/** Stream uploaded promo file — works via Coolify /api and portal /api/proxy. */
promosRouter.get("/file/:name", async (req, res, next) => {
  try {
    const file = resolvePromoFilePath(req.params.name);
    if (!file) throw new HttpError(404, "Image not found", "PROMO_FILE_NOT_FOUND");
    await access(file, constants.R_OK);
    res.sendFile(file);
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError(404, "Image not found", "PROMO_FILE_NOT_FOUND"));
  }
});

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

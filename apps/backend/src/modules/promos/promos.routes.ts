import { Router } from "express";
import { z } from "zod";
import { access } from "fs/promises";
import { constants } from "fs";
import { sendSuccess } from "../../utils/apiResponse";
import {
  clientPromoImageUrl,
  getPromoAssetDataUrl,
  getPromoSlideById,
  listPromoSlides,
  resolvePromoFilePath,
  resolvePromoImagePayload,
  resolveSlideImagePayload,
  type PromoPlacement,
} from "../tenants/promo.service";
import { resolveTenantId } from "../fund-requests/tenant";
import { HttpError } from "../../utils/httpError";

export const promosRouter = Router();

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

/** Stream DB-stored promo asset (survives Coolify redeploy). */
promosRouter.get("/asset/:id", async (req, res, next) => {
  try {
    const tenantId = await resolveTenantId();
    const dataUrl = await getPromoAssetDataUrl(tenantId, req.params.id);
    if (!dataUrl) throw new HttpError(404, "Image not found", "PROMO_FILE_NOT_FOUND");
    const payload = resolvePromoImagePayload(dataUrl);
    if (!payload || "filePath" in payload) {
      throw new HttpError(404, "Image not found", "PROMO_FILE_NOT_FOUND");
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Content-Type", payload.contentType);
    res.send(payload.buffer);
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError(404, "Image not found", "PROMO_FILE_NOT_FOUND"));
  }
});

/** Serve slide image by id (asset / data-URL / file) — keeps list JSON small/fast. */
promosRouter.get("/by-id/:id", async (req, res, next) => {
  try {
    const tenantId = await resolveTenantId();
    const slide = await getPromoSlideById(tenantId, req.params.id);
    if (!slide?.imageUrl) throw new HttpError(404, "Image not found", "PROMO_FILE_NOT_FOUND");
    const payload = await resolveSlideImagePayload(tenantId, slide);
    if (!payload) throw new HttpError(404, "Image not found", "PROMO_FILE_NOT_FOUND");
    res.setHeader("Cache-Control", "public, max-age=300");
    if ("filePath" in payload) {
      await access(payload.filePath, constants.R_OK);
      return res.sendFile(payload.filePath);
    }
    res.setHeader("Content-Type", payload.contentType);
    res.send(payload.buffer);
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError(404, "Image not found", "PROMO_FILE_NOT_FOUND"));
  }
});

/** Public — dashboard sidebar + login slider (lightweight URLs, not embedded base64). */
promosRouter.get("/", async (req, res) => {
  const placement = z
    .enum(["dashboard", "login"])
    .optional()
    .parse(typeof req.query.placement === "string" ? req.query.placement : undefined);
  const tenantId = await resolveTenantId();
  const slides = await listPromoSlides(tenantId, placement as PromoPlacement | undefined, true);
  sendSuccess(
    res,
    slides.map((s) => ({
      ...s,
      imageUrl: clientPromoImageUrl(s),
    })),
  );
});

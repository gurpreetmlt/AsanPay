import { randomUUID } from "crypto";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import { constants } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { tenants } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { asSettings, type TenantSettings } from "./tenantSettings.service";

export type PromoPlacement = "dashboard" | "login";

export type PromoSlide = {
  id: string;
  imageUrl: string;
  title: string;
  linkUrl: string;
  placement: PromoPlacement;
  sortOrder: number;
  active: boolean;
};

export const PROMO_MAX_SLIDES = 8;
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "promos");
const MAX_ASSETS = 40;

function normalizeSlide(raw: unknown, index: number): PromoSlide | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const imageUrl = typeof o.imageUrl === "string" ? o.imageUrl.trim() : "";
  if (!imageUrl) return null;
  const placement: PromoPlacement = o.placement === "login" ? "login" : "dashboard";
  return {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID(),
    // Slides should store short refs (/asset/, /file/, https). data: only briefly during migrate.
    imageUrl: imageUrl.startsWith("data:") ? imageUrl.slice(0, 2_000_000) : imageUrl.slice(0, 2000),
    title: typeof o.title === "string" ? o.title.trim().slice(0, 120) : "",
    linkUrl: typeof o.linkUrl === "string" ? o.linkUrl.trim().slice(0, 2000) : "",
    placement,
    sortOrder: typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder) ? o.sortOrder : index,
    active: o.active !== false,
  };
}

function readSlides(settings: TenantSettings): PromoSlide[] {
  const raw = settings.promoSlides;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s, i) => normalizeSlide(s, i))
    .filter((s): s is PromoSlide => Boolean(s))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function readAssets(settings: TenantSettings): Record<string, string> {
  const raw = settings.promoAssets;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === "string" && k && typeof v === "string" && v.startsWith("data:image/")) {
      out[k] = v;
    }
  }
  return out;
}

export function isPromoAssetRef(url: string): string | null {
  const m = url.trim().match(/\/(?:api\/)?(?:proxy\/)?promos\/asset\/([^/?#]+)/i);
  return m?.[1] ?? null;
}

function isPromoByIdRef(url: string): string | null {
  const m = url.trim().match(/\/(?:api\/)?(?:proxy\/)?promos\/by-id\/([^/?#]+)/i);
  return m?.[1] ?? null;
}

function assetPublicUrl(id: string): string {
  return `/api/promos/asset/${encodeURIComponent(id)}`;
}

function collectAssetIds(slides: PromoSlide[]): Set<string> {
  const ids = new Set<string>();
  for (const s of slides) {
    const id = isPromoAssetRef(s.imageUrl);
    if (id) ids.add(id);
  }
  return ids;
}

function pruneAssets(
  assets: Record<string, string>,
  keep: Set<string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const id of keep) {
    if (assets[id]) next[id] = assets[id]!;
  }
  // If somehow empty keep but assets remain (upload before save), keep newest MAX_ASSETS
  if (Object.keys(next).length === 0 && Object.keys(assets).length > 0) {
    const entries = Object.entries(assets).slice(-MAX_ASSETS);
    for (const [k, v] of entries) next[k] = v;
  }
  return next;
}

export async function listPromoSlides(
  tenantId: string,
  placement?: PromoPlacement,
  activeOnly = false,
): Promise<PromoSlide[]> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  let slides = readSlides(asSettings(row?.settings));
  if (placement) slides = slides.filter((s) => s.placement === placement);
  if (activeOnly) slides = slides.filter((s) => s.active && Boolean(s.imageUrl));
  return slides;
}

export async function getPromoSlideById(
  tenantId: string,
  slideId: string,
): Promise<PromoSlide | null> {
  const slides = await listPromoSlides(tenantId);
  return slides.find((s) => s.id === slideId) ?? null;
}

export async function getPromoAssetDataUrl(
  tenantId: string,
  assetId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const assets = readAssets(asSettings(row?.settings));
  return assets[assetId] ?? null;
}

/** Resolve bytes for a slide (asset map, data URL, or disk file). */
export async function resolveSlideImagePayload(
  tenantId: string,
  slide: PromoSlide,
): Promise<{ contentType: string; buffer: Buffer } | { filePath: string } | null> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const assets = readAssets(asSettings(row?.settings));
  const assetId = isPromoAssetRef(slide.imageUrl);
  if (assetId) {
    const dataUrl = assets[assetId];
    if (!dataUrl) return null;
    return resolvePromoImagePayload(dataUrl);
  }
  return resolvePromoImagePayload(slide.imageUrl);
}

/** Replace all slides for one placement (max 5). Other placements untouched. */
export async function replacePromoSlides(
  tenantId: string,
  placement: PromoPlacement,
  incoming: unknown[],
): Promise<PromoSlide[]> {
  if (!Array.isArray(incoming)) {
    throw new HttpError(422, "Slides must be an array", "INVALID_PROMOS");
  }
  if (incoming.length > PROMO_MAX_SLIDES) {
    throw new HttpError(
      422,
      `Maximum ${PROMO_MAX_SLIDES} slides allowed for this placement`,
      "PROMO_LIMIT",
    );
  }

  const normalized = incoming
    .map((s, i) => normalizeSlide({ ...(s as object), placement }, i))
    .filter((s): s is PromoSlide => Boolean(s))
    .map((s, i) => ({ ...s, placement, sortOrder: i }));

  for (const s of normalized) {
    const ok =
      s.imageUrl.startsWith("data:image/") ||
      s.imageUrl.startsWith("http") ||
      s.imageUrl.startsWith("/uploads/") ||
      s.imageUrl.startsWith("/api/promos/file/") ||
      Boolean(isPromoAssetRef(s.imageUrl)) ||
      Boolean(isPromoByIdRef(s.imageUrl));
    if (!ok) {
      throw new HttpError(
        422,
        "Each slide needs an image — use Upload image, then Save",
        "INVALID_PROMO_IMAGE",
      );
    }
    if (s.imageUrl.startsWith("data:image/") && s.imageUrl.length > 1_800_000) {
      throw new HttpError(422, "Image must be under 1.5 MB", "IMAGE_TOO_LARGE");
    }
    if (s.linkUrl && !s.linkUrl.startsWith("http") && !s.linkUrl.startsWith("/")) {
      throw new HttpError(422, "Link URL must start with https:// or /", "INVALID_PROMO_LINK");
    }
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .for("update")
      .limit(1);
    if (!row) throw new HttpError(404, "Tenant not found", "TENANT_NOT_FOUND");

    const prev = asSettings(row.settings);
    const prevSlides = readSlides(prev);
    let assets = readAssets(prev);

    for (let i = 0; i < normalized.length; i++) {
      const s = normalized[i]!;
      const slideNo = i + 1;

      const refId = isPromoByIdRef(s.imageUrl);
      if (refId) {
        const old =
          prevSlides.find((p) => p.id === s.id) || prevSlides.find((p) => p.id === refId);
        if (old?.imageUrl && !isPromoByIdRef(old.imageUrl)) {
          s.imageUrl = old.imageUrl;
        }
      }

      if (isPromoByIdRef(s.imageUrl)) {
        throw new HttpError(
          422,
          `Slide ${slideNo}: image missing — re-upload the image, then Save`,
          "PROMO_IMAGE_MISSING",
        );
      }

      // Inline data: → promoAssets (keeps Save payload small next time; survives redeploy)
      if (s.imageUrl.startsWith("data:image/")) {
        const id = randomUUID();
        assets[id] = s.imageUrl.slice(0, 2_000_000);
        s.imageUrl = assetPublicUrl(id);
        continue;
      }

      const assetId = isPromoAssetRef(s.imageUrl);
      if (assetId) {
        if (!assets[assetId]) {
          throw new HttpError(
            422,
            `Slide ${slideNo}: image missing — re-upload the image, then Save`,
            "PROMO_IMAGE_MISSING",
          );
        }
        s.imageUrl = assetPublicUrl(assetId);
        continue;
      }

      if (s.imageUrl.startsWith("http://") || s.imageUrl.startsWith("https://")) {
        continue;
      }

      // Legacy disk file → migrate into promoAssets when readable
      const filePath = resolvePromoFilePath(s.imageUrl);
      if (!filePath) {
        throw new HttpError(
          422,
          `Slide ${slideNo}: image missing — re-upload the image, then Save`,
          "PROMO_IMAGE_MISSING",
        );
      }
      try {
        await access(filePath, constants.R_OK);
        const buf = await readFile(filePath);
        if (buf.length > 1_500_000) {
          throw new HttpError(422, `Slide ${slideNo}: Image must be under 1.5 MB`, "IMAGE_TOO_LARGE");
        }
        const ext = path.extname(filePath).toLowerCase().replace(".", "") || "jpeg";
        const mime =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : "image/jpeg";
        const id = randomUUID();
        assets[id] = `data:${mime};base64,${buf.toString("base64")}`;
        s.imageUrl = assetPublicUrl(id);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(
          422,
          `Slide ${slideNo}: image missing on server — re-upload the image, then Save`,
          "PROMO_IMAGE_MISSING",
        );
      }
    }

    const others = prevSlides.filter((s) => s.placement !== placement);
    const mergedSlides = [...others, ...normalized];
    assets = pruneAssets(assets, collectAssetIds(mergedSlides));

    const next: TenantSettings = {
      ...prev,
      promoSlides: mergedSlides,
      promoAssets: assets,
    };

    await tx
      .update(tenants)
      .set({ settings: next as Record<string, unknown> })
      .where(eq(tenants.id, tenantId));

    return normalized;
  });
}

/**
 * Store image in DB (promoAssets) — survives Coolify redeploy.
 * Returns a short URL so admin Save stays small (no multi-MB JSON).
 */
export async function savePromoUpload(
  tenantId: string,
  dataUrl: string,
): Promise<{ imageUrl: string }> {
  const m = /^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!m) {
    throw new HttpError(
      422,
      "Upload a PNG, JPEG, WebP, or GIF image",
      "INVALID_IMAGE_UPLOAD",
    );
  }
  const extRaw = m[2];
  const b64 = m[3];
  if (!extRaw || !b64) {
    throw new HttpError(422, "Upload a PNG, JPEG, WebP, or GIF image", "INVALID_IMAGE_UPLOAD");
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 1_500_000) {
    throw new HttpError(422, "Image must be under 1.5 MB", "IMAGE_TOO_LARGE");
  }

  const id = randomUUID();
  const stored = dataUrl.trim().slice(0, 2_000_000);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .for("update")
      .limit(1);
    if (!row) throw new HttpError(404, "Tenant not found", "TENANT_NOT_FOUND");
    const prev = asSettings(row.settings);
    const assets = readAssets(prev);
    assets[id] = stored;
    // Cap growth before slides reference them
    const keys = Object.keys(assets);
    if (keys.length > MAX_ASSETS) {
      for (const k of keys.slice(0, keys.length - MAX_ASSETS)) {
        if (k !== id) delete assets[k];
      }
    }
    await tx
      .update(tenants)
      .set({
        settings: { ...prev, promoAssets: assets } as Record<string, unknown>,
      })
      .where(eq(tenants.id, tenantId));
  });

  // Optional disk cache (may vanish on redeploy — DB asset is source of truth)
  try {
    const ext = (extRaw.toLowerCase() === "jpeg" ? "jpg" : extRaw.toLowerCase()) as string;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, `${id}.${ext}`), buf);
  } catch {
    /* ignore disk errors */
  }

  return { imageUrl: assetPublicUrl(id) };
}

/** Safe path inside uploads/promos, or null. */
export function resolvePromoFilePath(nameOrUrl: string): string | null {
  const base = nameOrUrl.trim().split("?")[0] ?? "";
  const m =
    base.match(/\/(?:api\/)?promos\/file\/([^/]+)$/) ||
    base.match(/\/uploads\/promos\/([^/]+)$/) ||
    (/^[\w.-]+$/.test(base) ? [null, base] : null);
  const name = m?.[1];
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  return path.join(UPLOAD_DIR, name);
}

/**
 * List/API response URL — never embed multi-MB data: URLs in JSON.
 */
export function clientPromoImageUrl(slide: PromoSlide, _origin?: string): string {
  if (isPromoAssetRef(slide.imageUrl)) {
    return slide.imageUrl.startsWith("/api/")
      ? slide.imageUrl
      : `/api/promos/asset/${encodeURIComponent(isPromoAssetRef(slide.imageUrl)!)}`;
  }
  if (
    slide.imageUrl.startsWith("data:") ||
    resolvePromoFilePath(slide.imageUrl) ||
    isPromoByIdRef(slide.imageUrl)
  ) {
    return `/api/promos/by-id/${encodeURIComponent(slide.id)}`;
  }
  return absolutePromoUrl(slide.imageUrl, _origin || "http://localhost");
}

export function absolutePromoUrl(imageUrl: string, origin: string): string {
  if (imageUrl.startsWith("data:")) return imageUrl;
  const assetId = isPromoAssetRef(imageUrl);
  if (assetId) return assetPublicUrl(assetId);
  const file = resolvePromoFilePath(
    imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
      ? (() => {
          try {
            return new URL(imageUrl).pathname;
          } catch {
            return imageUrl;
          }
        })()
      : imageUrl,
  );
  if (file) {
    return `/api/promos/file/${path.basename(file)}`;
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  const base = origin.replace(/\/$/, "");
  return `${base}${imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`}`;
}

/** Parse data-URL or resolve file for streaming. */
export function resolvePromoImagePayload(imageUrl: string): {
  contentType: string;
  buffer: Buffer;
} | { filePath: string } | null {
  const data = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(imageUrl.trim());
  if (data?.[1] && data[2]) {
    return { contentType: data[1], buffer: Buffer.from(data[2], "base64") };
  }
  const filePath = resolvePromoFilePath(imageUrl);
  if (filePath) return { filePath };
  return null;
}

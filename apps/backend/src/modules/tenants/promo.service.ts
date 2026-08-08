import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
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

export const PROMO_MAX_SLIDES = 5;
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "promos");

function normalizeSlide(raw: unknown, index: number): PromoSlide | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const imageUrl = typeof o.imageUrl === "string" ? o.imageUrl.trim() : "";
  if (!imageUrl) return null;
  const placement: PromoPlacement = o.placement === "login" ? "login" : "dashboard";
  return {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID(),
    // data: URLs can be large; cap stored length in replacePromoSlides
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

function isPromoByIdRef(url: string): string | null {
  const m = url.trim().match(/\/(?:api\/)?(?:proxy\/)?promos\/by-id\/([^/?#]+)/i);
  return m?.[1] ?? null;
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
      Boolean(isPromoByIdRef(s.imageUrl));
    if (!ok) {
      throw new HttpError(
        422,
        "Each slide needs an image (upload a file, or use https://… / /api/promos/file/…)",
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

  // Keep data: URLs in DB — Coolify containers lose uploads/ on redeploy, so file paths
  // break admin preview + login after refresh. Data URLs survive in tenant settings.

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

    // Admin list returns /api/promos/by-id/:id instead of huge data URLs. On Save, restore
    // the real image payload from the previous row when the client echoes that ref.
    for (const s of normalized) {
      const refId = isPromoByIdRef(s.imageUrl);
      if (!refId) continue;
      const old =
        prevSlides.find((p) => p.id === s.id) || prevSlides.find((p) => p.id === refId);
      if (old?.imageUrl) s.imageUrl = old.imageUrl;
    }

    const others = prevSlides.filter((s) => s.placement !== placement);
    const mergedSlides = [...others, ...normalized];
    const next: TenantSettings = { ...prev, promoSlides: mergedSlides };

    await tx
      .update(tenants)
      .set({ settings: next as Record<string, unknown> })
      .where(eq(tenants.id, tenantId));

    return normalized;
  });
}

/** Save a data-URL image under uploads/promos and return public path. */
export async function savePromoUpload(dataUrl: string): Promise<{ imageUrl: string }> {
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
  const ext = extRaw.toLowerCase() === "jpeg" ? "jpg" : extRaw.toLowerCase();
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 1_500_000) {
    throw new HttpError(422, "Image must be under 1.5 MB", "IMAGE_TOO_LARGE");
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buf);
  // Served via GET /api/promos/file/:name (works through Coolify /api + portal proxy)
  return { imageUrl: `/api/promos/file/${filename}` };
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
 * List/API response URL — never embed multi-MB data: URLs in JSON (slow admin load).
 * data: → /api/promos/by-id/:id ; files → /api/promos/file/:name
 */
export function clientPromoImageUrl(slide: PromoSlide, _origin?: string): string {
  if (slide.imageUrl.startsWith("data:")) {
    return `/api/promos/by-id/${encodeURIComponent(slide.id)}`;
  }
  return absolutePromoUrl(slide.imageUrl, _origin || "http://localhost");
}

/** Prefer data URLs as-is. File slides → stable relative path (portals rewrite via /api/proxy). */
export function absolutePromoUrl(imageUrl: string, origin: string): string {
  if (imageUrl.startsWith("data:")) return imageUrl;
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

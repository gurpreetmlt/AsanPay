import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { userPhotos } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";

const MAX_PHOTO_BYTES = 600 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

function parsePhotoDataUrl(dataUrl: string): { contentType: string; data: string } {
  const m = DATA_URL.exec(dataUrl.trim());
  if (!m) throw new HttpError(400, "Photo must be a JPG, PNG or WebP image", "INVALID_PHOTO");
  const data = m[2]!.replace(/\s/g, "");
  const bytes = Buffer.byteLength(data, "base64");
  if (bytes < 100) throw new HttpError(400, "Photo is empty. Pick another image.", "INVALID_PHOTO");
  if (bytes > MAX_PHOTO_BYTES) throw new HttpError(400, "Photo must be under 600 KB", "PHOTO_TOO_LARGE");
  return { contentType: m[1] === "image/jpg" ? "image/jpeg" : m[1]!, data };
}

/** GET /api/account/photo — the signed-in user's own photo as a data URL (null when not set). */
export async function getMyPhoto(userId: string): Promise<{ dataUrl: string | null; updatedAt: string | null }> {
  const [row] = await db.select().from(userPhotos).where(eq(userPhotos.userId, userId)).limit(1);
  if (!row) return { dataUrl: null, updatedAt: null };
  return { dataUrl: `data:${row.contentType};base64,${row.data}`, updatedAt: row.updatedAt.toISOString() };
}

/** PUT /api/account/photo */
export async function setMyPhoto(userId: string, dataUrl: string) {
  const { contentType, data } = parsePhotoDataUrl(dataUrl);
  const now = new Date();
  await db
    .insert(userPhotos)
    .values({ userId, contentType, data, updatedAt: now })
    .onConflictDoUpdate({ target: userPhotos.userId, set: { contentType, data, updatedAt: now } });
  return { dataUrl: `data:${contentType};base64,${data}`, updatedAt: now.toISOString() };
}

/** DELETE /api/account/photo */
export async function deleteMyPhoto(userId: string) {
  await db.delete(userPhotos).where(eq(userPhotos.userId, userId));
  return { dataUrl: null, updatedAt: null };
}

/** Admin: raw bytes of an agent's profile photo, or null. */
export async function getUserPhotoBytes(userId: string): Promise<{ contentType: string; buffer: Buffer } | null> {
  const [row] = await db
    .select({ contentType: userPhotos.contentType, data: userPhotos.data })
    .from(userPhotos)
    .where(eq(userPhotos.userId, userId))
    .limit(1);
  return row ? { contentType: row.contentType, buffer: Buffer.from(row.data, "base64") } : null;
}

export async function getUserPhotoUpdatedAt(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ updatedAt: userPhotos.updatedAt })
    .from(userPhotos)
    .where(eq(userPhotos.userId, userId))
    .limit(1);
  return row ? row.updatedAt.toISOString() : null;
}

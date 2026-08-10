import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { HttpError } from "../../utils/httpError";

export const KYC_DOC_SLOTS = [
  "panImage",
  "aadhaarFront",
  "aadhaarBack",
  "cancelledCheque",
  "personalPhoto",
  "shopPhoto",
] as const;

export type KycDocSlot = (typeof KYC_DOC_SLOTS)[number];

/** Admin UI document keys → storage slot */
export const KYC_DOC_KEY_TO_SLOT: Record<string, KycDocSlot> = {
  panCard: "panImage",
  aadhaarFront: "aadhaarFront",
  aadhaarBack: "aadhaarBack",
  chequeOrPassbook: "cancelledCheque",
  personalPhoto: "personalPhoto",
  shopPhoto: "shopPhoto",
};

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "kyc");
const MAX_BYTES = 1_500_000;

export function isKycDocSlot(v: string): v is KycDocSlot {
  return (KYC_DOC_SLOTS as readonly string[]).includes(v);
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:(image\/(png|jpeg|jpg|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/i.exec(
    dataUrl.trim(),
  );
  if (!m?.[3]) return null;
  const mime = (m[1] || "image/jpeg").toLowerCase().replace("image/jpg", "image/jpeg");
  return { mime, buffer: Buffer.from(m[3], "base64") };
}

/** Validate data-URL image; persist under uploads/kyc and keep data URL for Coolify disk wipe. */
export async function saveKycDocumentDataUrl(
  userId: string,
  slot: KycDocSlot,
  dataUrl: string,
): Promise<{ dataUrl: string; fileName: string; publicPath: string }> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new HttpError(422, "Upload a JPG, PNG, WEBP, or HEIC image", "INVALID_IMAGE_UPLOAD");
  }
  if (parsed.buffer.length > MAX_BYTES) {
    throw new HttpError(422, "Image must be under 1.5 MB", "IMAGE_TOO_LARGE");
  }

  const ext =
    parsed.mime.includes("png")
      ? "png"
      : parsed.mime.includes("webp")
        ? "webp"
        : parsed.mime.includes("heic") || parsed.mime.includes("heif")
          ? "heic"
          : "jpg";

  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "user";
  const fileName = `${slot}-${randomUUID().slice(0, 8)}.${ext}`;
  const dir = path.join(UPLOAD_DIR, safeUser);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), parsed.buffer);

  const publicPath = `/uploads/kyc/${safeUser}/${fileName}`;
  const storedDataUrl = dataUrl.trim().slice(0, 2_000_000);
  return { dataUrl: storedDataUrl, fileName, publicPath };
}

export function metaDataUrlKey(slot: KycDocSlot): string {
  return `${slot}DataUrl`;
}

export function metaFileNameKey(slot: KycDocSlot): string {
  const map: Record<KycDocSlot, string> = {
    panImage: "panImageFileName",
    aadhaarFront: "aadhaarFrontFileName",
    aadhaarBack: "aadhaarBackFileName",
    cancelledCheque: "cancelledChequeFileName",
    personalPhoto: "personalPhotoFileName",
    shopPhoto: "shopPhotoFileName",
  };
  return map[slot];
}

export function metaPublicPathKey(slot: KycDocSlot): string {
  return `${slot}Url`;
}

export function hasStoredKycPhoto(meta: Record<string, unknown>, slot: KycDocSlot): boolean {
  const dataUrl = meta[metaDataUrlKey(slot)];
  if (typeof dataUrl === "string" && parseDataUrl(dataUrl)) return true;
  const publicPath = meta[metaPublicPathKey(slot)];
  return typeof publicPath === "string" && publicPath.startsWith("/uploads/kyc/");
}

/** Load photo bytes from audit metadata (data URL preferred) or disk path. */
export async function loadKycPhotoBytes(
  meta: Record<string, unknown>,
  slot: KycDocSlot,
): Promise<{ contentType: string; buffer: Buffer } | null> {
  const dataUrl = meta[metaDataUrlKey(slot)];
  if (typeof dataUrl === "string") {
    const parsed = parseDataUrl(dataUrl);
    if (parsed) return { contentType: parsed.mime, buffer: parsed.buffer };
  }

  const publicPath = meta[metaPublicPathKey(slot)];
  if (typeof publicPath !== "string" || !publicPath.startsWith("/uploads/kyc/")) return null;

  const rel = publicPath.slice("/uploads/kyc/".length);
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) return null;
  const full = path.join(UPLOAD_DIR, rel);
  if (!full.startsWith(UPLOAD_DIR)) return null;

  try {
    const buffer = await readFile(full);
    const ext = path.extname(full).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".heic" || ext === ".heif"
            ? "image/heic"
            : "image/jpeg";
    return { contentType, buffer };
  } catch {
    return null;
  }
}

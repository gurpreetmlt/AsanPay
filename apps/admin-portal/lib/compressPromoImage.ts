/** High-quality promo image compress (browser canvas). Prefer WebP @ ~0.92. */

export type PromoCompressPlacement = "dashboard" | "login";

const HARD_MAX_BYTES = 1_400_000;
/** Prefer smaller payloads for faster agent load; quality stays high. */
const SOFT_TARGET_BYTES = 900_000;
const MIN_QUALITY = 0.85;
const START_QUALITY = 0.92;

const MAX_DIM: Record<PromoCompressPlacement, { w: number; h: number }> = {
  dashboard: { w: 800, h: 1200 },
  // Allow square 1800 or landscape 1920×1600 without forced squeeze
  login: { w: 1920, h: 1920 },
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function fitSize(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (srcW <= maxW && srcH <= maxH) return { w: srcW, h: srcH };
  const scale = Math.min(maxW / srcW, maxH / srcH);
  return {
    w: Math.max(1, Math.round(srcW * scale)),
    h: Math.max(1, Math.round(srcH * scale)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not encode image"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscale only if larger than placement max; encode WebP (or JPEG) at high quality.
 * Never upscales. Quality floor 0.85 — visible loss should be minimal.
 */
export async function compressPromoImage(
  file: File,
  placement: PromoCompressPlacement,
): Promise<{ dataUrl: string; bytes: number; compressed: boolean }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a PNG, JPEG, WebP, or GIF image");
  }
  if (file.size > 8_000_000) {
    throw new Error("Image must be under 8 MB before compress");
  }

  const img = await loadImage(file);
  const max = MAX_DIM[placement];
  const { w, h } = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, max.w, max.h);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not compress image");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  const tryTypes = ["image/webp", "image/jpeg"] as const;
  let best: Blob | null = null;

  for (const type of tryTypes) {
    let quality = START_QUALITY;
    let blob = await canvasToBlob(canvas, type, quality);
    if (!blob || blob.size === 0) continue;

    while (blob.size > SOFT_TARGET_BYTES && quality > MIN_QUALITY + 0.01) {
      quality = Math.max(MIN_QUALITY, quality - 0.03);
      const next = await canvasToBlob(canvas, type, quality);
      if (!next || next.size === 0) break;
      blob = next;
    }

    // Still over hard max — one more step at floor
    if (blob.size > HARD_MAX_BYTES) {
      const floor = await canvasToBlob(canvas, type, MIN_QUALITY);
      if (floor && floor.size > 0) blob = floor;
    }

    if (blob.size <= HARD_MAX_BYTES) {
      best = blob;
      break;
    }
    if (!best || blob.size < best.size) best = blob;
  }

  if (!best) {
    throw new Error("Image compress failed — try a smaller PNG/JPG");
  }
  if (best.size > HARD_MAX_BYTES) {
    throw new Error("Image is still over 1.4 MB after compress — use a simpler graphic");
  }

  // Keep original if it was already smaller and within dims (no benefit)
  const dimsOk =
    (img.naturalWidth || img.width) <= max.w && (img.naturalHeight || img.height) <= max.h;
  if (dimsOk && file.size <= best.size && file.size <= HARD_MAX_BYTES && file.type !== "image/gif") {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
    return { dataUrl, bytes: file.size, compressed: false };
  }

  const dataUrl = await blobToDataUrl(best);
  return { dataUrl, bytes: best.size, compressed: true };
}

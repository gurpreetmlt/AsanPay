import sharp from "sharp";

export const MIN_SHORT_SIDE_PX = 600;
/** Mean greyscale (0–255) below this = too dark to read. */
export const MIN_BRIGHTNESS = 45;
/** Laplacian variance at ANALYSIS_WIDTH below this = blurry. Tuned low on purpose — a false fail blocks signup. */
export const MIN_SHARPNESS = 30;
const ANALYSIS_WIDTH = 1000;

export type QualityResult =
  | { decoded: false }
  | {
      decoded: true;
      width: number;
      height: number;
      brightness: number;
      sharpness: number;
      tooSmall: boolean;
      tooDark: boolean;
      blurry: boolean;
    };

/** Variance of the 4-neighbour Laplacian over a greyscale buffer. */
export function laplacianVariance(grey: Uint8Array | Buffer, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const v = grey[i - width]! + grey[i + width]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export async function checkImageQuality(buffer: Buffer): Promise<QualityResult> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { failOn: "none" }).metadata();
  } catch {
    return { decoded: false };
  }
  if (!meta.width || !meta.height) return { decoded: false };

  try {
    const { data, info } = await sharp(buffer, { failOn: "none" })
      .rotate()
      .greyscale()
      .resize({ width: ANALYSIS_WIDTH, withoutEnlargement: false })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let total = 0;
    for (let i = 0; i < data.length; i++) total += data[i]!;
    const brightness = data.length ? total / data.length : 0;
    const sharpness = laplacianVariance(data, info.width, info.height);
    const shortSide = Math.min(meta.width, meta.height);

    return {
      decoded: true,
      width: meta.width,
      height: meta.height,
      brightness: Math.round(brightness),
      sharpness: Math.round(sharpness),
      tooSmall: shortSide < MIN_SHORT_SIDE_PX,
      tooDark: brightness < MIN_BRIGHTNESS,
      blurry: sharpness < MIN_SHARPNESS,
    };
  } catch {
    return { decoded: false };
  }
}

/** Upright RGBA frames at a few sizes for the QR scanner (dense Secure QR needs resolution). */
export async function rgbaFrames(
  buffer: Buffer,
  widths: number[],
): Promise<{ data: Uint8ClampedArray; width: number; height: number }[]> {
  const frames: { data: Uint8ClampedArray; width: number; height: number }[] = [];
  for (const width of widths) {
    try {
      const { data, info } = await sharp(buffer, { failOn: "none" })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (frames.some((f) => f.width === info.width)) continue;
      frames.push({
        data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
        width: info.width,
        height: info.height,
      });
    } catch {
      /* skip this size */
    }
  }
  return frames;
}

export type OcrVariant = "sharp" | "plain" | "bw";

/**
 * Upright PNG for OCR. `sharp` = greyscale + contrast + sharpen; `plain` = greyscale + contrast;
 * `bw` = black / white threshold (cards with busy coloured backgrounds).
 */
export async function ocrReadyPng(buffer: Buffer, variant: OcrVariant = "sharp"): Promise<Buffer | null> {
  try {
    const base = sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 1600, withoutEnlargement: false })
      .greyscale()
      .normalize();
    const img = variant === "bw" ? base.threshold(150) : variant === "sharp" ? base.sharpen() : base;
    return await img.png().toBuffer();
  } catch {
    return null;
  }
}

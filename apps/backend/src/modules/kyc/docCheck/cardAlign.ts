import sharp from "sharp";
import { logger } from "../../../utils/logger";
import { boxBounds, paddleRead, type PaddleLine, type PaddleRead } from "./paddleOcr";

/**
 * Auto-crop + straighten a KYC card photo before OCR, using where Paddle found text:
 * sideways → 90° / 270°, weak read → try 180°, then crop to the text area (drops the table / hand,
 * upscales a small card) and remove tilt. The agent's manual crop in the app still runs first; this
 * only improves what we read. The stored photo is never changed.
 */

/** Below this mean line confidence (0–1) the photo may be upside down. */
const UPSIDE_DOWN_SUSPECT = 0.75;
const MIN_TILT_DEG = 1.5;
const MAX_TILT_DEG = 30;
/** Crop only when the text area is clearly smaller than the photo. */
const CROP_MAX_AREA = 0.7;
const CROP_MARGIN = 0.06;

function sideLengths(line: PaddleLine): { width: number; height: number } {
  const [p0, p1, , p3] = line.box ?? [];
  if (!p0 || !p1 || !p3) return { width: 0, height: 0 };
  return {
    width: Math.hypot((p1[0] ?? 0) - (p0[0] ?? 0), (p1[1] ?? 0) - (p0[1] ?? 0)),
    height: Math.hypot((p3[0] ?? 0) - (p0[0] ?? 0), (p3[1] ?? 0) - (p0[1] ?? 0)),
  };
}

/** Characters read, weighted by confidence — compares the same photo in different orientations. */
export function readScore(lines: PaddleLine[]): number {
  return lines.reduce((sum, l) => sum + l.text.replace(/[^A-Za-z0-9]/g, "").length * l.mean, 0);
}

/** Length of text running left ↔ right vs up ↓ down, by the direction of each box's long side. */
function runDirections(lines: PaddleLine[]): { vertical: number; horizontal: number } {
  let vertical = 0;
  let horizontal = 0;
  for (const l of lines) {
    const [p0, p1, p2] = l.box ?? [];
    if (!p0 || !p1 || !p2) continue;
    const a = [(p1[0] ?? 0) - (p0[0] ?? 0), (p1[1] ?? 0) - (p0[1] ?? 0)] as const;
    const b = [(p2[0] ?? 0) - (p1[0] ?? 0), (p2[1] ?? 0) - (p1[1] ?? 0)] as const;
    const la = Math.hypot(a[0], a[1]);
    const lb = Math.hypot(b[0], b[1]);
    if (Math.max(la, lb) < 1.5 * Math.min(la, lb)) continue;
    const long = la >= lb ? a : b;
    if (Math.abs(long[1]) > Math.abs(long[0])) vertical += Math.max(la, lb);
    else horizontal += Math.max(la, lb);
  }
  return { vertical, horizontal };
}

/** Text lines mostly run up / down → the card is lying on its side. */
export function isSideways(lines: PaddleLine[]): boolean {
  const { vertical, horizontal } = runDirections(lines);
  return vertical > 200 && vertical > 1.5 * horizontal;
}

/**
 * Orientation score: characters read × confidence × share of text running left ↔ right. Paddle
 * still reads sideways text (merged into a few long boxes), so confidence alone picks the wrong way.
 */
export function orientationScore(lines: PaddleLine[]): number {
  const { vertical, horizontal } = runDirections(lines);
  const total = vertical + horizontal;
  return readScore(lines) * (total ? horizontal / total : 0);
}

/** Width-weighted median slope of long text lines, in degrees (positive = text runs down to the right). */
export function tiltAngle(lines: PaddleLine[]): number {
  const samples: { deg: number; weight: number }[] = [];
  for (const l of lines) {
    const [p0, p1] = l.box ?? [];
    const { width, height } = sideLengths(l);
    if (!p0 || !p1 || width < 40 || width < 3 * height) continue;
    const deg = (Math.atan2((p1[1] ?? 0) - (p0[1] ?? 0), (p1[0] ?? 0) - (p0[0] ?? 0)) * 180) / Math.PI;
    if (Math.abs(deg) <= MAX_TILT_DEG) samples.push({ deg, weight: width });
  }
  if (!samples.length) return 0;
  samples.sort((a, b) => a.deg - b.deg);
  const half = samples.reduce((s, x) => s + x.weight, 0) / 2;
  let acc = 0;
  for (const s of samples) {
    acc += s.weight;
    if (acc >= half) return s.deg;
  }
  return 0;
}

/** Text area + margin, clamped to the image. Null when it is not clearly smaller than the photo. */
export function textCrop(lines: PaddleLine[], width: number, height: number) {
  if (!lines.length) return null;
  const all = lines.map(boxBounds);
  const left = Math.min(...all.map((b) => b.left));
  const right = Math.max(...all.map((b) => b.right));
  const top = Math.min(...all.map((b) => b.top));
  const bottom = Math.max(...all.map((b) => b.bottom));
  const mx = (right - left) * CROP_MARGIN + 8;
  const my = (bottom - top) * CROP_MARGIN + 8;
  const rect = {
    left: Math.max(0, Math.floor(left - mx)),
    top: Math.max(0, Math.floor(top - my)),
    right: Math.min(width, Math.ceil(right + mx)),
    bottom: Math.min(height, Math.ceil(bottom + my)),
  };
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  if (w < 64 || h < 32 || (w * h) / (width * height) > CROP_MAX_AREA) return null;
  return { left: rect.left, top: rect.top, width: w, height: h };
}

function meanConfidence(lines: PaddleLine[]): number {
  return lines.length ? lines.reduce((s, l) => s + l.mean, 0) / lines.length : 0;
}

async function oriented(buffer: Buffer, deg: number): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" }).rotate().rotate(deg).png().toBuffer();
}

export type AlignedCard = {
  /** Upright, cropped, de-tilted card for the Tesseract backup. */
  card: Buffer;
  /** Paddle passes on the final orientation (merged by the caller). */
  reads: PaddleRead[];
  rotation: number;
  tilt: number;
  cropped: boolean;
};

export type UprightCard = { image: Buffer; read: PaddleRead; rotation: number };

/**
 * Cards are landscape: a portrait photo or up / down text → also try 90° / 270°; a weak read → also
 * try 180°. Keeps the orientation with the best `orientationScore`. At most 4 Paddle passes.
 */
export async function uprightCard(buffer: Buffer): Promise<UprightCard | null> {
  const first = await paddleRead(buffer);
  if (!first) return null;

  const candidates: UprightCard[] = [{ read: first, image: buffer, rotation: 0 }];
  const rotate = async (deg: number) => {
    const image = await oriented(buffer, deg);
    const read = await paddleRead(image);
    if (read) candidates.push({ read, image, rotation: deg });
  };
  if (first.height > first.width || isSideways(first.lines)) {
    await rotate(90);
    await rotate(270);
  }
  if (meanConfidence(first.lines) < UPSIDE_DOWN_SUSPECT) await rotate(180);
  return candidates.reduce((best, c) =>
    orientationScore(c.read.lines) > orientationScore(best.read.lines) ? c : best,
  );
}

/** Null when Paddle is off / unavailable — callers OCR the original photo as before. */
export async function alignCard(buffer: Buffer): Promise<AlignedCard | null> {
  const best = await uprightCard(buffer);
  if (!best) return null;

  const { read } = best;
  const tilt = tiltAngle(read.lines);
  const crop = textCrop(read.lines, read.width, read.height);
  const deskew = Math.abs(tilt) >= MIN_TILT_DEG;
  if (!crop && !deskew) {
    return { card: best.image, reads: [read], rotation: best.rotation, tilt: 0, cropped: false };
  }

  try {
    // Same raster Paddle read (EXIF + rotation + 1600 px), so box coordinates line up.
    let img = sharp(await sharp(best.image, { failOn: "none" }).rotate().resize({ width: read.width }).png().toBuffer());
    if (crop) img = sharp(await img.extract(crop).png().toBuffer());
    if (deskew) img = img.rotate(-tilt, { background: "#FFFFFF" });
    const card = await img.png().toBuffer();
    const again = await paddleRead(card);
    const reads = again ? [read, again] : [read];
    logger.info({ rotation: best.rotation, tilt: Math.round(tilt * 10) / 10, cropped: Boolean(crop) }, "KYC card aligned");
    return { card, reads, rotation: best.rotation, tilt, cropped: Boolean(crop) };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "KYC card align failed — using the photo as is");
    return { card: best.image, reads: [read], rotation: best.rotation, tilt: 0, cropped: false };
  }
}

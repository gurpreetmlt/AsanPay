import { createRequire } from "node:module";
import sharp from "sharp";
import { logger } from "../../../utils/logger";
import { uprightCard, tiltAngle } from "./cardAlign";
import { ocrWorkingCopy } from "./imageQuality";
import { boxBounds, type PaddleLine } from "./paddleOcr";

/**
 * Auto-crop shown to the agent after picking a PAN / Aadhaar photo ("Adjust crop" opens the manual
 * cropper on the original). Order: upright (0 / 90 / 180 / 270°) → card outline from edges, flattened
 * (fixes perspective) → else a card-shaped box around the text, de-tilted → else the upright photo.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- opencv.js ships without usable types */
type Cv = any;
type Mat = any;

/** ID-1 card (PAN / Aadhaar PVC) 85.6 × 54 mm. */
const CARD_RATIO = 85.6 / 54;
const EDGE_WIDTH = 800;
const MIN_CARD_AREA = 0.12;
const MAX_CARD_AREA = 0.98;
/** Long / short side of a card outline, wide enough for photos taken at an angle. */
const MIN_RATIO = 1.25;
const MAX_RATIO = 2.0;
/** Share of text boxes that must sit inside a card outline. */
const MIN_TEXT_INSIDE = 0.6;
const OUTPUT_WIDTH = 1600;

let cvReady: Promise<{ cv: Cv }> | null = null;

/**
 * The opencv.js module object has a `then` method that re-resolves to itself, so it must never be
 * awaited, returned from an async function or loaded with `import()` — it is required and always
 * passed around wrapped in `{ cv }`.
 */
function getCv(): Promise<{ cv: Cv }> {
  if (!cvReady) {
    cvReady = new Promise<{ cv: Cv }>((resolve, reject) => {
      const cv: Cv = createRequire(import.meta.url)("@techstark/opencv-js");
      if (cv.Mat) return resolve({ cv });
      const timer = setTimeout(() => reject(new Error("opencv init timeout")), 20_000);
      const prev = cv.onRuntimeInitialized;
      cv.onRuntimeInitialized = () => {
        clearTimeout(timer);
        prev?.();
        resolve({ cv });
      };
    }).catch((err) => {
      cvReady = null;
      throw err;
    });
  }
  return cvReady;
}

/** Load OpenCV at boot so the first auto-crop doesn't spend its time budget on startup. */
export function warmCardCrop(): void {
  void getCv().catch((err) => logger.warn({ err: (err as Error).message }, "KYC auto-crop warm-up failed"));
}

type Pt = [number, number];

/** tl, tr, br, bl. */
export function orderQuad(points: Pt[]): Pt[] {
  const bySum = [...points].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const byDiff = [...points].sort((a, b) => a[1] - a[0] - (b[1] - b[0]));
  return [bySum[0]!, byDiff[0]!, bySum[3]!, byDiff[3]!];
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function insidePolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function textCentres(lines: PaddleLine[]): Pt[] {
  return lines.map((l) => {
    const b = boxBounds(l);
    return [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
  });
}

/** Largest convex 4-corner outline with card proportions that holds most of the text. Raster coords. */
function findCardQuad(cv: Cv, rgba: Mat, centres: Pt[]): Pt[] | null {
  const scale = EDGE_WIDTH / rgba.cols;
  const mats: Mat[] = [];
  const track = <T extends Mat>(m: T): T => {
    mats.push(m);
    return m;
  };
  try {
    const small = track(new cv.Mat());
    cv.resize(rgba, small, new cv.Size(EDGE_WIDTH, Math.round(rgba.rows * scale)), 0, 0, cv.INTER_AREA);
    const grey = track(new cv.Mat());
    cv.cvtColor(small, grey, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(grey, grey, new cv.Size(5, 5), 0);
    const edges = track(new cv.Mat());
    cv.Canny(grey, edges, 40, 120);
    const kernel = track(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2);
    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = small.cols * small.rows;
    let best: { quad: Pt[]; area: number } | null = null;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        const area = cv.contourArea(contour);
        if (area < MIN_CARD_AREA * imageArea || area > MAX_CARD_AREA * imageArea) continue;
        const approx = new cv.Mat();
        try {
          cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
          if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
          const pts: Pt[] = [];
          for (let k = 0; k < 4; k++) pts.push([approx.data32S[k * 2] / scale, approx.data32S[k * 2 + 1] / scale]);
          const quad = orderQuad(pts);
          const w = Math.max(dist(quad[0]!, quad[1]!), dist(quad[3]!, quad[2]!));
          const h = Math.max(dist(quad[0]!, quad[3]!), dist(quad[1]!, quad[2]!));
          const ratio = Math.max(w, h) / Math.max(1, Math.min(w, h));
          if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
          if (centres.length) {
            const inside = centres.filter((c) => insidePolygon(c, quad)).length;
            if (inside / centres.length < MIN_TEXT_INSIDE) continue;
          }
          if (!best || area > best.area) best = { quad, area };
        } finally {
          approx.delete();
        }
      } finally {
        contour.delete();
      }
    }
    return best?.quad ?? null;
  } finally {
    for (const m of mats) m.delete();
  }
}

/** Flatten the card outline into a straight rectangle. */
function warpQuad(cv: Cv, rgba: Mat, quad: Pt[]): Mat {
  const w = Math.max(dist(quad[0]!, quad[1]!), dist(quad[3]!, quad[2]!));
  const h = Math.max(dist(quad[0]!, quad[3]!), dist(quad[1]!, quad[2]!));
  const outW = OUTPUT_WIDTH;
  const outH = Math.round((OUTPUT_WIDTH * h) / Math.max(1, w));
  const src = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flat());
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
  const m = cv.getPerspectiveTransform(src, dst);
  const out = new cv.Mat();
  try {
    cv.warpPerspective(rgba, out, m, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    return out;
  } finally {
    src.delete();
    dst.delete();
    m.delete();
  }
}

/** No clear outline: de-tilt, then a card-shaped box around the text (cards print text on most of their height). */
function cropAroundText(cv: Cv, rgba: Mat, lines: PaddleLine[]): Mat | null {
  if (lines.length < 3) return null;
  const tilt = tiltAngle(lines);
  const centre = new cv.Point(rgba.cols / 2, rgba.rows / 2);
  const rot = cv.getRotationMatrix2D(centre, tilt, 1);
  const straight = new cv.Mat();
  try {
    cv.warpAffine(rgba, straight, rot, new cv.Size(rgba.cols, rgba.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    const m = rot.data64F as Float64Array;
    const pts = lines.flatMap((l) => (l.box ?? []).map((p) => [p[0] ?? 0, p[1] ?? 0] as Pt));
    const moved = pts.map(([x, y]) => [m[0]! * x + m[1]! * y + m[2]!, m[3]! * x + m[4]! * y + m[5]!] as Pt);
    const left = Math.min(...moved.map((p) => p[0]));
    const right = Math.max(...moved.map((p) => p[0]));
    const top = Math.min(...moved.map((p) => p[1]));
    const bottom = Math.max(...moved.map((p) => p[1]));
    const cardH = (bottom - top) * 1.3;
    const cardW = Math.max((right - left) * 1.1, cardH * CARD_RATIO);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const x0 = Math.max(0, Math.round(cx - cardW / 2));
    const y0 = Math.max(0, Math.round(cy - cardH / 2));
    const x1 = Math.min(rgba.cols, Math.round(cx + cardW / 2));
    const y1 = Math.min(rgba.rows, Math.round(cy + cardH / 2));
    if (x1 - x0 < 64 || y1 - y0 < 40) return null;
    if ((x1 - x0) * (y1 - y0) > 0.9 * rgba.cols * rgba.rows && Math.abs(tilt) < 1.5) return null;
    return straight.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0)).clone();
  } finally {
    straight.delete();
    rot.delete();
  }
}

async function matToJpeg(mat: Mat): Promise<Buffer> {
  return sharp(Buffer.from(mat.data), { raw: { width: mat.cols, height: mat.rows, channels: 4 } })
    .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

export type CardCropResult = {
  image: Buffer;
  /** False = no card found; the app opens the manual cropper instead. */
  detected: boolean;
  method: "edges" | "text" | "none";
  rotation: number;
};

export async function autoCropCard(buffer: Buffer): Promise<CardCropResult> {
  // Find the card on the small OCR copy, then cut it from the photo as received so the crop keeps its detail.
  const upright = await uprightCard(await ocrWorkingCopy(buffer)).catch(() => null);
  const rotation = upright?.rotation ?? 0;

  const { data, info } = await sharp(buffer, { failOn: "none" })
    .rotate()
    .rotate(rotation)
    .resize({ width: OUTPUT_WIDTH, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const k = upright ? info.width / upright.read.width : 1;
  const lines = (upright?.read.lines ?? []).map((l) => ({
    ...l,
    box: l.box?.map((p) => [(p[0] ?? 0) * k, (p[1] ?? 0) * k]),
  }));

  let cv: Cv;
  try {
    ({ cv } = await getCv());
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "KYC auto-crop: opencv unavailable");
    const raw = { width: info.width, height: info.height, channels: 4 as const };
    return { image: await sharp(data, { raw }).jpeg({ quality: 88 }).toBuffer(), detected: false, method: "none", rotation };
  }

  const rgba = cv.matFromArray(info.height, info.width, cv.CV_8UC4, data);
  let out: Mat | null = null;
  try {
    const quad = findCardQuad(cv, rgba, textCentres(lines));
    let method: CardCropResult["method"] = "none";
    if (quad) {
      out = warpQuad(cv, rgba, quad);
      method = "edges";
    } else {
      out = cropAroundText(cv, rgba, lines);
      if (out) method = "text";
    }
    logger.info({ method, rotation }, "KYC auto-crop");
    return {
      image: await matToJpeg(out ?? rgba),
      detected: method !== "none",
      method,
      rotation,
    };
  } finally {
    rgba.delete();
    out?.delete();
  }
}

import { readFile, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";

/**
 * PaddleOCR (ONNX) — primary reader for KYC card photos; Tesseract (`ocr.ts`) is the backup.
 * Models run on our own server, so photos never leave it.
 *
 * v5 (default): PP-OCRv5 mobile detection + PP-OCRv5 English recognition, Apache-2.0, in
 * `assets/ocr/pp-ocrv5` (sha256 det 1eb7b4f7…, en_rec 4e16deb2…).
 * v4: PP-OCRv4 models bundled in `@gutenye/ocr-models` (rollback).
 */

export type PaddleLine = { text: string; mean: number; box?: number[][] };
type PaddleEngine = {
  detect(image: { data: Buffer; width: number; height: number }): Promise<{
    texts: PaddleLine[];
    resizedImageWidth: number;
    resizedImageHeight: number;
  }>;
};

/** One Paddle pass. Box coordinates are in the `width` × `height` image that was read. */
export type PaddleRead = {
  text: string;
  /** 0–100, same scale as Tesseract. */
  confidence: number;
  lines: PaddleLine[];
  width: number;
  height: number;
};

export const PADDLE_INPUT_WIDTH = 1600;
/** After this many load failures in a row the engine stays off until restart (Tesseract carries on). */
const MAX_LOAD_FAILURES = 3;

const V5_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../assets/ocr/pp-ocrv5");

/**
 * The library splits the dictionary on "\n" and appends the space token, so a trailing newline
 * (editors / the end-of-file hook add one) would shift the space index. Load a trimmed copy.
 */
async function v5Models() {
  const raw = await readFile(path.join(V5_DIR, "en_dict.txt"), "utf8");
  const dictionaryPath = path.join(tmpdir(), "asanpay-ppocrv5-en-dict.txt");
  await writeFile(dictionaryPath, raw.replace(/\r/g, "").replace(/\n+$/, ""));
  return {
    detectionPath: path.join(V5_DIR, "det.onnx"),
    recognitionPath: path.join(V5_DIR, "en_rec.onnx"),
    dictionaryPath,
  };
}

let engine: Promise<PaddleEngine> | null = null;
let loadFailures = 0;

/** One pass uses every core; parallel passes only slow each other down (2 vCPU server). */
const OCR_THREADS = Math.max(1, availableParallelism());
let queue: Promise<unknown> = Promise.resolve();

/** Run Paddle passes one at a time, in arrival order. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export function paddleOcrEnabled(): boolean {
  return env.KYC_OCR_PADDLE === "on" && loadFailures < MAX_LOAD_FAILURES;
}

/** Loaded lazily so a broken native runtime degrades to Tesseract instead of crashing boot. */
function getEngine(): Promise<PaddleEngine> {
  if (!engine) {
    engine = (async () => {
      const mod = (await import("@gutenye/ocr-node")) as unknown as {
        default: { create(options?: Record<string, unknown>): Promise<PaddleEngine> };
      };
      const model = env.KYC_OCR_PADDLE_MODEL;
      const onnxOptions = { intraOpNumThreads: OCR_THREADS, interOpNumThreads: 1, executionMode: "sequential" };
      const ocr = await mod.default.create(
        model === "v5" ? { models: await v5Models(), onnxOptions } : { onnxOptions },
      );
      logger.info({ model, threads: OCR_THREADS }, "KYC PaddleOCR ready");
      return ocr;
    })().catch((err) => {
      engine = null;
      loadFailures++;
      throw err;
    });
  }
  return engine;
}

/** Axis-aligned extent of a line box. */
export function boxBounds(line: PaddleLine) {
  const xs = (line.box ?? []).map((p) => p[0] ?? 0);
  const ys = (line.box ?? []).map((p) => p[1] ?? 0);
  return xs.length
    ? { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
    : { left: 0, right: 0, top: 0, bottom: 0 };
}

/**
 * Paddle returns one box per text run, in no fixed order. Rebuild reading order: rows top → bottom
 * (boxes whose vertical centres overlap share a row), runs left → right inside a row. The text rules
 * rely on this, e.g. the PAN date of birth sits on the line below its label.
 */
export function linesToText(lines: PaddleLine[]): string {
  const runs = lines
    .filter((l) => l.text.trim())
    .map((l) => {
      const b = boxBounds(l);
      return { text: l.text.trim(), left: b.left, mid: (b.top + b.bottom) / 2, height: b.bottom - b.top };
    })
    .sort((a, b) => a.mid - b.mid);

  const rows: (typeof runs)[] = [];
  for (const run of runs) {
    const row = rows[rows.length - 1];
    const anchor = row?.[0];
    if (row && anchor && Math.abs(run.mid - anchor.mid) <= Math.max(anchor.height, run.height) / 2) row.push(run);
    else rows.push([run]);
  }
  return rows.map((row) => row.sort((a, b) => a.left - b.left).map((r) => r.text).join("  ")).join("\n");
}

/** Read an image (any format sharp opens, EXIF-rotated, scaled to 1600 px wide). Null when Paddle is off / unavailable. */
export async function paddleRead(buffer: Buffer): Promise<PaddleRead | null> {
  if (!paddleOcrEnabled()) return null;
  let ocr: PaddleEngine;
  try {
    ocr = await getEngine();
  } catch (err) {
    logger.warn({ err: (err as Error).message, loadFailures }, "KYC PaddleOCR unavailable — using Tesseract");
    return null;
  }
  try {
    const { data, info } = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: PADDLE_INPUT_WIDTH, withoutEnlargement: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { texts, resizedImageWidth, resizedImageHeight } = await enqueue(() =>
      ocr.detect({ data, width: info.width, height: info.height }),
    );
    const sx = info.width / (resizedImageWidth || info.width);
    const sy = info.height / (resizedImageHeight || info.height);
    const lines = texts.map((t) => ({ ...t, box: t.box?.map((p) => [(p[0] ?? 0) * sx, (p[1] ?? 0) * sy]) }));
    const scores = lines.map((t) => t.mean).filter((m) => Number.isFinite(m));
    const confidence = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : 0;
    return { text: linesToText(lines), confidence, lines, width: info.width, height: info.height };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "KYC PaddleOCR failed — using Tesseract");
    return null;
  }
}

export function warmPaddleOcr(): void {
  if (!paddleOcrEnabled()) return;
  void getEngine().catch((err) => logger.warn({ err: (err as Error).message }, "KYC PaddleOCR warm-up failed"));
}

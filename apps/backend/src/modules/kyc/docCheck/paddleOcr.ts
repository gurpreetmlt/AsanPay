import sharp from "sharp";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";

/**
 * PaddleOCR (PP-OCRv4, ONNX) — primary reader for KYC card photos; Tesseract (`ocr.ts`) is the
 * backup. Models ship inside the npm package, so nothing is fetched at runtime and photos never
 * leave the server.
 */

type PaddleLine = { text: string; mean: number; box?: number[][] };
type PaddleEngine = {
  detect(image: { data: Buffer; width: number; height: number }): Promise<{ texts: PaddleLine[] }>;
};

const INPUT_WIDTH = 1600;
/** After this many load failures in a row the engine stays off until restart (Tesseract carries on). */
const MAX_LOAD_FAILURES = 3;

let engine: Promise<PaddleEngine> | null = null;
let loadFailures = 0;

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
      const ocr = await mod.default.create();
      logger.info("KYC PaddleOCR ready");
      return ocr;
    })().catch((err) => {
      engine = null;
      loadFailures++;
      throw err;
    });
  }
  return engine;
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
      const ys = (l.box ?? []).map((p) => p[1] ?? 0);
      const xs = (l.box ?? []).map((p) => p[0] ?? 0);
      const top = ys.length ? Math.min(...ys) : 0;
      const bottom = ys.length ? Math.max(...ys) : 0;
      return { text: l.text.trim(), left: xs.length ? Math.min(...xs) : 0, mid: (top + bottom) / 2, height: bottom - top };
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

/** Same shape as Tesseract's `ocrImage` (confidence 0–100), or null when Paddle is off / unavailable. */
export async function paddleOcrImage(buffer: Buffer): Promise<{ text: string; confidence: number } | null> {
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
      .resize({ width: INPUT_WIDTH, withoutEnlargement: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { texts } = await ocr.detect({ data, width: info.width, height: info.height });
    const scores = texts.map((t) => t.mean).filter((m) => Number.isFinite(m));
    const confidence = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : 0;
    return { text: linesToText(texts), confidence };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "KYC PaddleOCR failed — using Tesseract");
    return null;
  }
}

export function warmPaddleOcr(): void {
  if (!paddleOcrEnabled()) return;
  void getEngine().catch((err) => logger.warn({ err: (err as Error).message }, "KYC PaddleOCR warm-up failed"));
}

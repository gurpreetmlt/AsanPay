import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import Tesseract from "tesseract.js";
import { logger } from "../../../utils/logger";

const LANGS = ["eng", "hin"] as const;
/** Matches tesseract.js default for OEM LSTM_ONLY. */
const MODEL_DIR = "4.0.0_best_int";
const TESSDATA_DIR = path.join(os.tmpdir(), "asanpay-tessdata");

let workerPromise: Promise<Tesseract.Worker> | null = null;

/**
 * Language data comes from the @tesseract.js-data/* npm packages so OCR never fetches
 * from a CDN at runtime. tesseract.js takes a single langPath, so both files are copied
 * into one temp dir first.
 */
async function prepareLangPath(): Promise<string> {
  const require = createRequire(import.meta.url);
  await mkdir(TESSDATA_DIR, { recursive: true });
  for (const lang of LANGS) {
    const pkgDir = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
    await copyFile(
      path.join(pkgDir, MODEL_DIR, `${lang}.traineddata.gz`),
      path.join(TESSDATA_DIR, `${lang}.traineddata.gz`),
    );
  }
  return TESSDATA_DIR;
}

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const langPath = await prepareLangPath();
      const worker = await Tesseract.createWorker([...LANGS], Tesseract.OEM.LSTM_ONLY, {
        langPath,
        cacheMethod: "none",
        gzip: true,
      });
      logger.info("KYC OCR worker ready");
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export async function ocrImage(png: Buffer): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker();
  const { data } = await worker.recognize(png);
  return { text: data.text ?? "", confidence: data.confidence ?? 0 };
}

/** Load the OCR model at boot so the first signup photo doesn't pay the startup cost. */
export function warmKycOcr(): void {
  void getWorker().catch((err) => logger.warn({ err: (err as Error).message }, "KYC OCR warm-up failed"));
}

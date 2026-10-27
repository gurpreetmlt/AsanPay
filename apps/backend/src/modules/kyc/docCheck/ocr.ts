import { createRequire } from "node:module";
import path from "node:path";
import Tesseract from "tesseract.js";
import { logger } from "../../../utils/logger";
import { warmCardCrop } from "./cardCrop";
import { warmPaddleOcr } from "./paddleOcr";

/**
 * English only: every PAN / Aadhaar prints its key fields in English, and mixing in Hindi made
 * Latin text read worse (Latin letters guessed as Devanagari) and OCR ~3× slower.
 */
const LANG = "eng";
/** Matches tesseract.js default for OEM LSTM_ONLY. */
const MODEL_DIR = "4.0.0_best_int";

/**
 * Two page-layout modes read different fields on ID cards: `auto` (PSM 3) gets block text such
 * as names, `sparse` (PSM 11) gets scattered text such as the Aadhaar number and DOB. One worker
 * per mode so concurrent checks never flip each other's parameters.
 */
export type OcrMode = "auto" | "sparse";
const PSM: Record<OcrMode, string> = { auto: "3", sparse: "11" };

const workers = new Map<OcrMode, Promise<Tesseract.Worker>>();

/** Language data ships in the @tesseract.js-data/eng npm package — OCR never fetches from a CDN. */
function langPath(): string {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve(`@tesseract.js-data/${LANG}/package.json`)), MODEL_DIR);
}

function getWorker(mode: OcrMode): Promise<Tesseract.Worker> {
  let worker = workers.get(mode);
  if (!worker) {
    worker = (async () => {
      const w = await Tesseract.createWorker(LANG, Tesseract.OEM.LSTM_ONLY, {
        langPath: langPath(),
        cacheMethod: "none",
        gzip: true,
      });
      await w.setParameters({
        tessedit_pageseg_mode: PSM[mode] as Tesseract.PSM,
        user_defined_dpi: "300",
      });
      logger.info({ mode }, "KYC OCR worker ready");
      return w;
    })().catch((err) => {
      workers.delete(mode);
      throw err;
    });
    workers.set(mode, worker);
  }
  return worker;
}

export async function ocrImage(png: Buffer, mode: OcrMode = "auto"): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker(mode);
  const { data } = await worker.recognize(png);
  return { text: data.text ?? "", confidence: data.confidence ?? 0 };
}

/** Load PaddleOCR, both Tesseract models and OpenCV at boot so the first signup photo doesn't pay the startup cost. */
export function warmKycOcr(): void {
  warmPaddleOcr();
  warmCardCrop();
  for (const mode of ["auto", "sparse"] as const) {
    void getWorker(mode).catch((err) =>
      logger.warn({ mode, err: (err as Error).message }, "KYC OCR warm-up failed"),
    );
  }
}

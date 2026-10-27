import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { cacheGet, cacheSet } from "../../../cache/redis";
import { db } from "../../../db/postgres";
import { findLatestAuditLog } from "../../../db/postgres/repositories/auditLog";
import { users } from "../../../db/postgres/schema";
import { decryptPII } from "../../../utils/aes";
import { HttpError } from "../../../utils/httpError";
import { logger } from "../../../utils/logger";
import { KYC_DOC_MAX_BYTES, parseKycDataUrl } from "../kycDocuments.service";
import { scanAadhaarQr, type AadhaarQrData, type AadhaarQrScan } from "./aadhaarSecureQr";
import {
  analyzeDocText,
  bestNameMatch,
  classifyDocType,
  dobMatches,
  isAadhaarLike,
  looksLikePan,
  nameSimilarity,
  normalizeDob,
  normalizeGender,
  type DocTextAnalysis,
  type DocType,
} from "./docText";
import { escalateDifferentPerson } from "./identityRules";
import { checkImageQuality, ocrReadyPng, type OcrVariant } from "./imageQuality";
import { ocrImage, type OcrMode } from "./ocr";
import { alignCard } from "./cardAlign";

export const DOC_CHECK_SLOTS = ["panImage", "aadhaarFront", "aadhaarBack"] as const;
export type DocCheckSlot = (typeof DOC_CHECK_SLOTS)[number];

export type DocCheckStatus = "pass" | "flag" | "fail";
export type DocCheckItem = {
  id: string;
  label: string;
  status: DocCheckStatus | "skip";
  /** User-facing English sentence for flag / fail items. */
  detail?: string;
  /** 0–100, name match only. */
  score?: number;
};

export type DocCheckQr = {
  verified: boolean;
  signatureChecked: boolean;
  name: string;
  dob: string;
  gender: string;
  aadhaarLast4: string;
  address: string;
};

export type DocCheckResult = {
  ok: boolean;
  status: DocCheckStatus;
  docType: DocType;
  checks: DocCheckItem[];
  message: string;
  qr?: DocCheckQr;
  checkedAt: string;
  durationMs: number;
};

/** Shape saved in `kyc.submit` metadata → `docChecks[slot]` (no address). */
export type StoredDocCheck = Omit<DocCheckResult, "ok" | "durationMs" | "qr"> & {
  qr?: Omit<DocCheckQr, "address">;
};

const CHECK_TIMEOUT_MS = 12_000;
const NAME_MATCH_MIN = 0.8;
const CACHE_TTL_SEC = 2 * 60 * 60;
const MEMORY_CACHE_MAX = 500;
const CACHE_KEY_PREFIX = "kyc:doccheck:";

export const MSG_FLAG = "We couldn't fully read this photo — it will be reviewed.";
export const MSG_BLURRY = "Photo is blurry. Retake it in good light with the full card visible.";
const MSG_DARK = "Photo is too dark. Retake it in good light with the full card visible.";
const MSG_SMALL = "Photo is too small (under 600 px). Retake it with the card filling the frame.";
const MSG_UNSUPPORTED = "We couldn't open this photo format for checking — it will be reviewed.";

const PASS_MESSAGE: Record<DocCheckSlot, string> = {
  panImage: "PAN card verified",
  aadhaarFront: "Aadhaar card verified",
  aadhaarBack: "Aadhaar card verified",
};
const SIDE: Record<Exclude<DocCheckSlot, "panImage">, string> = {
  aadhaarFront: "front",
  aadhaarBack: "back",
};

export function isDocCheckSlot(v: string): v is DocCheckSlot {
  return (DOC_CHECK_SLOTS as readonly string[]).includes(v);
}

// ── Reference data (what the photo must match) ───────────────────────────────

type RefData = {
  pan: string | null;
  panName: string | null;
  aadhaarLast4: string | null;
  aadhaarName: string | null;
  aadhaarDob: string | null;
  userName: string | null;
} & EnteredData;

/** What the agent typed in the form — sent with the check (only Aadhaar last 4, never the full number). */
type EnteredData = {
  enteredDob: string | null;
  enteredGender: "male" | "female" | "other" | null;
  enteredAadhaarLast4: string | null;
};

export type DocCheckHints = { dob?: string | null; gender?: string | null; aadhaarLast4?: string | null };

const EMPTY_REFS: RefData = {
  pan: null,
  panName: null,
  aadhaarLast4: null,
  aadhaarName: null,
  aadhaarDob: null,
  userName: null,
  enteredDob: null,
  enteredGender: null,
  enteredAadhaarLast4: null,
};

function enteredFromHints(hints?: DocCheckHints): EnteredData {
  const last4 = (hints?.aadhaarLast4 ?? "").replace(/\D/g, "").slice(-4);
  return {
    enteredDob: normalizeDob(hints?.dob),
    enteredGender: normalizeGender(hints?.gender),
    enteredAadhaarLast4: last4.length === 4 ? last4 : null,
  };
}

function safeDecrypt(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  try {
    return decryptPII(v);
  } catch {
    return null;
  }
}

function metaStr(meta: Record<string, unknown> | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function loadReferenceData(userId: string): Promise<RefData> {
  const [[user], panAudit, aadhaarAudit] = await Promise.all([
    db
      .select({
        name: users.name,
        panNumberEncrypted: users.panNumberEncrypted,
        aadhaarNumberEncrypted: users.aadhaarNumberEncrypted,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    findLatestAuditLog({ userId, action: "kyc.pan_verified" }),
    findLatestAuditLog({ userId, action: "kyc.aadhaar_otp_verified" }),
  ]);
  const panMeta = panAudit?.metadata;
  const aadhaarMeta = aadhaarAudit?.metadata;

  const pan = (safeDecrypt(panMeta?.panEncrypted) ?? safeDecrypt(user?.panNumberEncrypted))
    ?.toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const aadhaarDigits = safeDecrypt(user?.aadhaarNumberEncrypted)?.replace(/\D/g, "") ?? "";

  return {
    pan: pan && /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : null,
    panName: metaStr(panMeta, "fullName"),
    aadhaarLast4:
      metaStr(aadhaarMeta, "aadhaarLast4") ?? (aadhaarDigits.length === 12 ? aadhaarDigits.slice(-4) : null),
    aadhaarName: metaStr(aadhaarMeta, "fullName"),
    aadhaarDob: normalizeDob(metaStr(aadhaarMeta, "dob")),
    userName: user?.name?.trim() || null,
    enteredDob: null,
    enteredGender: null,
    enteredAadhaarLast4: null,
  };
}

// ── Result assembly ──────────────────────────────────────────────────────────

function finalize(
  slot: DocCheckSlot,
  docType: DocType,
  checks: DocCheckItem[],
  started: number,
  passMessage = PASS_MESSAGE[slot],
  qr?: DocCheckQr,
): DocCheckResult {
  const failed = checks.find((c) => c.status === "fail");
  const flagged = checks.find((c) => c.status === "flag");
  const status: DocCheckStatus = failed ? "fail" : flagged ? "flag" : "pass";
  return {
    ok: status !== "fail",
    status,
    docType,
    checks,
    message: failed?.detail ?? flagged?.detail ?? passMessage,
    ...(qr ? { qr } : {}),
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}

function nameCheck(expected: string | null, score: number | null, source: string): DocCheckItem {
  if (!expected || score == null) {
    return { id: "name", label: "Name match", status: "skip", detail: "No verified name to compare yet" };
  }
  const pct = Math.round(score * 100);
  return score >= NAME_MATCH_MIN
    ? { id: "name", label: "Name match", status: "pass", score: pct }
    : {
        id: "name",
        label: "Name match",
        status: "flag",
        score: pct,
        detail: `Name on the ${source} doesn't fully match your verified name (${pct}%) — it will be reviewed.`,
      };
}

/** DOB printed on the card vs the DOB the agent entered (or Aadhaar eKYC). Unreadable on the card → skip. */
function dobCheck(cardDob: string | null, expectedDob: string | null, source: string): DocCheckItem {
  const matched = dobMatches(cardDob, expectedDob);
  if (matched == null) {
    return { id: "dob", label: "Date of birth match", status: "skip" };
  }
  return matched
    ? { id: "dob", label: "Date of birth match", status: "pass" }
    : {
        id: "dob",
        label: "Date of birth match",
        status: "flag",
        detail: `Date of birth on the ${source} doesn't match the date of birth you entered — it will be reviewed.`,
      };
}

/** Gender printed on the Aadhaar vs the gender the agent selected. Unreadable → skip. */
function genderCheck(cardGender: string | null, enteredGender: string | null): DocCheckItem {
  if (!cardGender || !enteredGender) return { id: "gender", label: "Gender match", status: "skip" };
  return cardGender === enteredGender
    ? { id: "gender", label: "Gender match", status: "pass" }
    : {
        id: "gender",
        label: "Gender match",
        status: "flag",
        detail: "Gender on the Aadhaar card doesn't match the gender you selected — it will be reviewed.",
      };
}

/** Tesseract backup passes after PaddleOCR — each reads fields the others miss on real card photos. */
const OCR_PASSES: { variant: OcrVariant; mode: OcrMode }[] = [
  { variant: "sharp", mode: "auto" },
  { variant: "plain", mode: "sparse" },
  { variant: "bw", mode: "auto" },
];

/**
 * OCR the card: auto-crop / straighten + PaddleOCR first, then Tesseract passes on the aligned card
 * until the slot's key fields are found. The text of every pass is merged before the rules run.
 */
async function readText(
  buffer: Buffer,
  enough: (a: DocTextAnalysis) => boolean,
): Promise<DocTextAnalysis | null> {
  const passes: { text: string; confidence: number }[] = [];
  const merged = () =>
    analyzeDocText(passes.map((p) => p.text).join("\n"), Math.max(...passes.map((p) => p.confidence)));
  const aligned = await alignCard(buffer);
  for (const read of aligned?.reads ?? []) {
    if (read.text.trim()) passes.push(read);
  }
  if (passes.length && enough(merged())) return merged();
  const source = aligned?.card ?? buffer;
  for (const { variant, mode } of OCR_PASSES) {
    const png = await ocrReadyPng(source, variant);
    if (!png) continue;
    try {
      passes.push(await ocrImage(png, mode));
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "KYC OCR failed");
      continue;
    }
    if (enough(merged())) break;
  }
  return passes.length ? merged() : null;
}

// ── PAN ─────────────────────────────────────────────────────────────────────

async function checkPan(buffer: Buffer, refs: RefData, checks: DocCheckItem[], started: number) {
  const slot = "panImage" as const;
  const text = await readText(buffer, (a) => looksLikePan(a) && a.panNumbers.length > 0 && a.dob != null);
  if (!text) {
    checks.push({ id: "ocr", label: "Read card text", status: "flag", detail: MSG_FLAG });
    return finalize(slot, "unknown", checks, started);
  }

  // Older PAN cards (glossy, hologram) often OCR without the "Income Tax" header or a clean PAN
  // number; "Govt. of India" + a DOB label with no Aadhaar marker is still a PAN layout.
  const panLayout = looksLikePan(text) || (!isAadhaarLike(text) && text.aadhaarGov && text.dobLabel);
  if (!panLayout) {
    const docType = classifyDocType(text);
    if (isAadhaarLike(text)) {
      checks.push({
        id: "docType",
        label: "PAN card",
        status: "fail",
        detail: "This looks like an Aadhaar card. Upload a photo of your PAN card here.",
      });
    } else if (!text.clearlyReadable) {
      checks.push({ id: "ocr", label: "Read card text", status: "flag", detail: MSG_FLAG });
    } else {
      checks.push({
        id: "docType",
        label: "PAN card",
        status: "fail",
        detail: "This photo is not a PAN card. Upload a clear photo of the front of your PAN card.",
      });
    }
    return finalize(slot, docType, checks, started);
  }
  checks.push({ id: "docType", label: "PAN card", status: "pass" });

  let panMismatch = false;
  if (!text.panNumbers.length) {
    checks.push({
      id: "panNumber",
      label: "PAN number",
      status: "flag",
      detail: "We couldn't read the PAN number on this photo — it will be reviewed.",
    });
  } else if (!refs.pan) {
    checks.push({ id: "panNumber", label: "PAN number", status: "skip", detail: "No verified PAN to compare yet" });
  } else if (text.panNumbers.includes(refs.pan)) {
    checks.push({ id: "panNumber", label: "PAN number", status: "pass" });
  } else {
    panMismatch = true;
    checks.push({
      id: "panNumber",
      label: "PAN number",
      status: "flag",
      detail: "PAN number on this photo does not match your verified PAN.",
    });
  }

  const expected = refs.panName ?? refs.userName;
  checks.push(nameCheck(expected, expected ? bestNameMatch(expected, text.lines) : null, "PAN card"));
  checks.push(dobCheck(text.dob, refs.enteredDob ?? refs.aadhaarDob, "PAN card"));
  // The verified PAN came from the provider, so a different number on the card is red on its own.
  escalateDifferentPerson(checks, "PAN card", panMismatch, true);
  return finalize(slot, "pan", checks, started);
}

// ── Aadhaar ──────────────────────────────────────────────────────────────────

function toQr(data: AadhaarQrData, signatureValid: boolean | null): DocCheckQr {
  return {
    verified: signatureValid === true,
    signatureChecked: signatureValid !== null,
    name: data.name,
    dob: data.dob,
    gender: data.gender,
    aadhaarLast4: data.aadhaarLast4,
    address: data.address,
  };
}

async function checkAadhaar(
  slot: "aadhaarFront" | "aadhaarBack",
  buffer: Buffer,
  refs: RefData,
  checks: DocCheckItem[],
  started: number,
) {
  const side = SIDE[slot];
  const sideDocType: DocType = slot === "aadhaarFront" ? "aadhaar_front" : "aadhaar_back";
  // Cross-check against the PAN holder (verified PAN name) and the Aadhaar eKYC name; best wins.
  const expectedNames = [refs.panName ?? refs.userName, refs.aadhaarName].filter((n): n is string => Boolean(n));
  const expectedName = expectedNames[0] ?? null;
  const scoreName = (score: (expected: string) => number) =>
    expectedNames.length ? Math.max(...expectedNames.map(score)) : null;
  const expectedDob = refs.enteredDob ?? refs.aadhaarDob;
  // OTP-verified Aadhaar first; before OTP, the number typed in the form.
  const refLast4 = refs.aadhaarLast4 ?? refs.enteredAadhaarLast4;

  const scan: AadhaarQrScan = await scanAadhaarQr(buffer).catch(() => ({ found: false }) as const);
  const qrData = scan.found && scan.secure ? scan.data : null;
  const qr = scan.found && scan.secure ? toQr(scan.data, scan.signatureValid) : undefined;

  if (scan.found && scan.secure) {
    if (scan.signatureValid === true) {
      checks.push({ id: "aadhaarQr", label: "Aadhaar QR", status: "pass" });
    } else if (scan.signatureValid === false) {
      checks.push({
        id: "aadhaarQr",
        label: "Aadhaar QR",
        status: "flag",
        detail: "The Aadhaar QR signature could not be verified — it will be reviewed.",
      });
    } else {
      checks.push({ id: "aadhaarQr", label: "Aadhaar QR", status: "skip", detail: "UIDAI certificate not installed" });
    }
  } else {
    checks.push({
      id: "aadhaarQr",
      label: "Aadhaar QR",
      status: "skip",
      detail: scan.found ? "QR code is not an Aadhaar Secure QR" : "No readable QR code",
    });
  }

  // Signed QR = UIDAI data, so OCR is not needed and a different Aadhaar is a hard fail.
  if (qrData && qr?.verified) {
    if (refLast4) {
      checks.push(
        qrData.aadhaarLast4 === refLast4
          ? { id: "aadhaarNumber", label: "Aadhaar number", status: "pass" }
          : {
              id: "aadhaarNumber",
              label: "Aadhaar number",
              status: "fail",
              detail: "This Aadhaar does not match the Aadhaar number you entered. Upload a photo of your own Aadhaar card.",
            },
      );
    }
    checks.push(nameCheck(expectedName, scoreName((n) => nameSimilarity(n, qrData.name)), "Aadhaar QR"));
    checks.push(dobCheck(normalizeDob(qrData.dob), expectedDob, "Aadhaar QR"));
    checks.push(genderCheck(normalizeGender(qrData.gender), refs.enteredGender));
    escalateDifferentPerson(checks, "Aadhaar card", false);
    return finalize(slot, sideDocType, checks, started, "Aadhaar QR verified", qr);
  }

  const text = await readText(
    buffer,
    (a) =>
      isAadhaarLike(a) &&
      !looksLikePan(a) &&
      a.aadhaarLast4.length > 0 &&
      (slot === "aadhaarBack" || (a.dob != null && a.genderValue != null)),
  );
  const legacyQr = scan.found && !scan.secure && scan.legacyAadhaar;
  const pan = text ? looksLikePan(text) : false;
  const aadhaarEvidence = Boolean(qrData) || legacyQr || (text ? isAadhaarLike(text) && !pan : false);

  if (!text) {
    checks.push({ id: "ocr", label: "Read card text", status: "flag", detail: MSG_FLAG });
    return finalize(slot, aadhaarEvidence ? sideDocType : "unknown", checks, started, undefined, qr);
  }

  if (!aadhaarEvidence) {
    if (pan) {
      checks.push({
        id: "docType",
        label: "Aadhaar card",
        status: "fail",
        detail: `This looks like a PAN card. Upload a photo of the ${side} of your Aadhaar card here.`,
      });
    } else if (!text.clearlyReadable) {
      checks.push({ id: "ocr", label: "Read card text", status: "flag", detail: MSG_FLAG });
    } else {
      checks.push({
        id: "docType",
        label: "Aadhaar card",
        status: "fail",
        detail: `This photo is not an Aadhaar card. Upload a clear photo of the ${side} of your Aadhaar card.`,
      });
    }
    return finalize(slot, classifyDocType(text), checks, started, undefined, qr);
  }

  const frontMarkers = text.dobLabel || text.gender;
  const backMarkers = text.uidai || text.address || scan.found;
  if (slot === "aadhaarFront" && !frontMarkers && (text.uidai || text.address)) {
    checks.push({
      id: "docType",
      label: "Aadhaar front",
      status: "fail",
      detail: "This is the back of your Aadhaar card. Upload the front side (with your photo, name and date of birth) here.",
    });
    return finalize(slot, "aadhaar_back", checks, started, undefined, qr);
  }
  if (slot === "aadhaarBack" && frontMarkers && !backMarkers) {
    checks.push({
      id: "docType",
      label: "Aadhaar back",
      status: "fail",
      detail: "This is the front of your Aadhaar card. Upload the back side (with your address and QR code) here.",
    });
    return finalize(slot, "aadhaar_front", checks, started, undefined, qr);
  }
  if (slot === "aadhaarFront" && !frontMarkers && !qrData) {
    checks.push({
      id: "docType",
      label: "Aadhaar front",
      status: "flag",
      detail: "We couldn't confirm this is the front of the Aadhaar card — it will be reviewed.",
    });
  } else {
    checks.push({ id: "docType", label: slot === "aadhaarFront" ? "Aadhaar front" : "Aadhaar back", status: "pass" });
  }

  // Unsigned QR data is more accurate than OCR but not trusted enough to hard-fail on alone.
  const last4s = qrData ? [qrData.aadhaarLast4] : text.aadhaarLast4;
  let numberMismatch = false;
  if (refLast4) {
    if (!last4s.length) {
      if (slot === "aadhaarFront") {
        checks.push({
          id: "aadhaarNumber",
          label: "Aadhaar number",
          status: "flag",
          detail: "We couldn't read the Aadhaar number on this photo — it will be reviewed.",
        });
      }
    } else if (last4s.includes(refLast4)) {
      checks.push({ id: "aadhaarNumber", label: "Aadhaar number", status: "pass" });
    } else {
      numberMismatch = true;
      checks.push({
        id: "aadhaarNumber",
        label: "Aadhaar number",
        status: "flag",
        detail: "Aadhaar number on this photo doesn't match the Aadhaar number you entered — it will be reviewed.",
      });
    }
  }

  if (qrData) {
    checks.push(nameCheck(expectedName, scoreName((n) => nameSimilarity(n, qrData.name)), "Aadhaar QR"));
    checks.push(dobCheck(normalizeDob(qrData.dob), expectedDob, "Aadhaar QR"));
    checks.push(genderCheck(normalizeGender(qrData.gender), refs.enteredGender));
  } else if (slot === "aadhaarFront") {
    checks.push(nameCheck(expectedName, scoreName((n) => bestNameMatch(n, text.lines)), "Aadhaar card"));
    checks.push(dobCheck(text.dob, expectedDob, "Aadhaar card"));
    checks.push(genderCheck(text.genderValue, refs.enteredGender));
  }

  escalateDifferentPerson(checks, "Aadhaar card", numberMismatch);
  return finalize(slot, sideDocType, checks, started, undefined, qr);
}

// ── Engine ───────────────────────────────────────────────────────────────────

async function runDocCheck(
  userId: string,
  slot: DocCheckSlot,
  buffer: Buffer,
  entered: EnteredData,
): Promise<DocCheckResult> {
  const started = Date.now();
  const checks: DocCheckItem[] = [];
  const refsPromise = loadReferenceData(userId).catch((err) => {
    logger.warn({ userId, err: (err as Error).message }, "KYC doc check: reference data unavailable");
    return EMPTY_REFS;
  });

  const quality = await checkImageQuality(buffer);
  if (!quality.decoded) {
    checks.push({ id: "quality", label: "Photo quality", status: "flag", detail: MSG_UNSUPPORTED });
    return finalize(slot, "unknown", checks, started);
  }
  const qualityFail = quality.tooSmall ? MSG_SMALL : quality.tooDark ? MSG_DARK : quality.blurry ? MSG_BLURRY : null;
  checks.push(
    qualityFail
      ? { id: "quality", label: "Photo quality", status: "fail", detail: qualityFail }
      : { id: "quality", label: "Photo quality", status: "pass" },
  );
  if (qualityFail) return finalize(slot, "unknown", checks, started);

  const refs: RefData = { ...(await refsPromise), ...entered };
  return slot === "panImage"
    ? checkPan(buffer, refs, checks, started)
    : checkAadhaar(slot, buffer, refs, checks, started);
}

function timeoutResult(slot: DocCheckSlot, started: number): DocCheckResult {
  return finalize(slot, "unknown", [{ id: "timeout", label: "Photo check", status: "flag", detail: MSG_FLAG }], started);
}

// ── Cache (result reused by submitKyc so photos aren't checked twice) ────────

const memoryCache = new Map<string, { result: DocCheckResult; expiresAt: number }>();
const inFlight = new Map<string, Promise<DocCheckResult>>();

/** Result depends on the photo AND what was typed in the form, so both are in the key. */
function cacheKey(userId: string, slot: DocCheckSlot, buffer: Buffer, entered: EnteredData): string {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  const form = `${entered.enteredDob ?? "-"}:${entered.enteredGender ?? "-"}:${entered.enteredAadhaarLast4 ?? "-"}`;
  return `${CACHE_KEY_PREFIX}${userId}:${slot}:${hash}:${form}`;
}

async function remember(key: string, result: DocCheckResult): Promise<void> {
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_SEC * 1000 });
  await cacheSet(key, JSON.stringify(result), CACHE_TTL_SEC);
}

async function recall(key: string): Promise<DocCheckResult | null> {
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.result;
  if (mem) memoryCache.delete(key);
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DocCheckResult;
  } catch {
    return null;
  }
}

/**
 * Check a KYC photo (PAN / Aadhaar front / Aadhaar back) on our own server.
 * Never throws for checker problems and never takes longer than 12 s — slow or broken
 * checks come back as `flag` so signup is never blocked by the checker itself.
 */
export async function checkKycDocument(
  userId: string,
  slot: DocCheckSlot,
  dataUrl: string,
  hints?: DocCheckHints,
): Promise<DocCheckResult> {
  const entered = enteredFromHints(hints);
  const parsed = parseKycDataUrl(dataUrl);
  if (!parsed) {
    throw new HttpError(422, "Upload a JPG, PNG, WEBP, or HEIC image", "INVALID_IMAGE_UPLOAD");
  }
  if (parsed.buffer.length > KYC_DOC_MAX_BYTES) {
    throw new HttpError(422, "Image must be under 1.5 MB", "IMAGE_TOO_LARGE");
  }

  const key = cacheKey(userId, slot, parsed.buffer, entered);
  const cached = await recall(key);
  if (cached) return cached;

  const started = Date.now();
  let run = inFlight.get(key);
  if (!run) {
    run = runDocCheck(userId, slot, parsed.buffer, entered)
      .catch((err) => {
        logger.warn({ userId, slot, err: (err as Error).message }, "KYC doc check crashed");
        return timeoutResult(slot, started);
      })
      .then(async (result) => {
        await remember(key, result);
        logger.info(
          {
            userId,
            slot,
            status: result.status,
            docType: result.docType,
            durationMs: result.durationMs,
            notPassed: result.checks.filter((c) => c.status === "fail" || c.status === "flag").map((c) => c.id),
          },
          "KYC doc check",
        );
        return result;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, run);
  }

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<DocCheckResult>((resolve) => {
    timer = setTimeout(() => resolve(timeoutResult(slot, started)), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function toStoredDocCheck(result: DocCheckResult): StoredDocCheck {
  const stored: StoredDocCheck = {
    status: result.status,
    docType: result.docType,
    checks: result.checks,
    message: result.message,
    checkedAt: result.checkedAt,
  };
  if (result.qr) {
    stored.qr = {
      verified: result.qr.verified,
      signatureChecked: result.qr.signatureChecked,
      name: result.qr.name,
      dob: result.qr.dob,
      gender: result.qr.gender,
      aadhaarLast4: result.qr.aadhaarLast4,
    };
  }
  return stored;
}

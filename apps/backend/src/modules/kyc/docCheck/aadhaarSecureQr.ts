import { createVerify, X509Certificate, type KeyObject } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import jsQR from "jsqr";
import { logger } from "../../../utils/logger";
import { rgbaFrames } from "./imageQuality";

const SIGNATURE_BYTES = 256;
const DELIMITER = 255;
/** Text fields after the version tag (V2+) / at the start (V1), in UIDAI order. */
const FIELD_NAMES = [
  "emailMobileIndicator",
  "referenceId",
  "name",
  "dob",
  "gender",
  "careOf",
  "district",
  "landmark",
  "house",
  "location",
  "pincode",
  "postOffice",
  "state",
  "street",
  "subDistrict",
  "vtc",
] as const;

/** UIDAI offline-verification public certs (.cer / .pem), bundled in the repo. */
const CERT_DIR = path.join(process.cwd(), "assets", "uidai");

export type AadhaarQrData = {
  version: string;
  /** Only the last 4 Aadhaar digits ever leave this module. */
  aadhaarLast4: string;
  name: string;
  dob: string;
  gender: string;
  address: string;
  hasPhoto: boolean;
};

export type AadhaarQrScan =
  | { found: false }
  | { found: true; secure: false; /** Old unsigned XML Aadhaar QR (pre-2018 cards). */ legacyAadhaar: boolean }
  | {
      found: true;
      secure: true;
      data: AadhaarQrData;
      /** true = UIDAI signature valid · false = invalid · null = no UIDAI cert installed */
      signatureValid: boolean | null;
    };

let publicKeys: KeyObject[] | null = null;

function loadPublicKeys(): KeyObject[] {
  if (publicKeys) return publicKeys;
  const keys: KeyObject[] = [];
  try {
    for (const file of readdirSync(CERT_DIR)) {
      if (!/\.(cer|crt|pem)$/i.test(file)) continue;
      try {
        keys.push(new X509Certificate(readFileSync(path.join(CERT_DIR, file))).publicKey);
      } catch (err) {
        logger.warn({ file, err: (err as Error).message }, "UIDAI cert could not be parsed");
      }
    }
  } catch {
    /* directory missing — signature check reports null */
  }
  if (!keys.length) logger.warn({ dir: CERT_DIR }, "No UIDAI public cert installed; Aadhaar QR signatures unverified");
  publicKeys = keys;
  return keys;
}

function decompress(buf: Buffer): Buffer | null {
  for (const fn of [gunzipSync, inflateSync, inflateRawSync]) {
    try {
      return fn(buf);
    } catch {
      /* try next format */
    }
  }
  return null;
}

/** Read `count` 0xFF-delimited latin1 fields from the start of `bytes`. */
function readFields(bytes: Buffer, count: number): { fields: string[]; end: number } | null {
  const fields: string[] = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    const idx = bytes.indexOf(DELIMITER, start);
    if (idx < 0) return null;
    fields.push(bytes.subarray(start, idx).toString("latin1").trim());
    start = idx + 1;
  }
  return { fields, end: start };
}

/** Parse the decimal payload of an Aadhaar Secure QR. Returns null when it isn't one. */
export function parseSecureQrPayload(text: string): { data: AadhaarQrData; signed: Buffer; signature: Buffer } | null {
  const digits = text.trim();
  if (!/^\d{200,}$/.test(digits)) return null;

  let hex = BigInt(digits).toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = decompress(Buffer.from(hex, "hex"));
  if (!bytes || bytes.length <= SIGNATURE_BYTES + 32) return null;

  const signed = bytes.subarray(0, bytes.length - SIGNATURE_BYTES);
  const signature = bytes.subarray(bytes.length - SIGNATURE_BYTES);

  const first = readFields(signed, 1);
  if (!first) return null;
  const versioned = /^V\d+$/i.test(first.fields[0] ?? "");
  const total = FIELD_NAMES.length + (versioned ? 1 : 0);
  const read = readFields(signed, total);
  if (!read) return null;

  const values = versioned ? read.fields.slice(1) : read.fields;
  const f = Object.fromEntries(FIELD_NAMES.map((k, i) => [k, values[i] ?? ""])) as Record<
    (typeof FIELD_NAMES)[number],
    string
  >;
  const last4 = f.referenceId.slice(0, 4);
  if (!/^\d{4}$/.test(last4) || !f.name) return null;

  const address = [f.house, f.street, f.landmark, f.location, f.vtc, f.postOffice, f.subDistrict, f.district, f.state, f.pincode]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");

  return {
    data: {
      version: versioned ? first.fields[0]!.toUpperCase() : "V1",
      aadhaarLast4: last4,
      name: f.name,
      dob: f.dob,
      gender: f.gender,
      address,
      hasPhoto: signed.length - read.end > 64,
    },
    signed,
    signature,
  };
}

export function verifySecureQrSignature(signed: Buffer, signature: Buffer): boolean | null {
  const keys = loadPublicKeys();
  if (!keys.length) return null;
  for (const key of keys) {
    try {
      if (createVerify("RSA-SHA256").update(signed).verify(key, signature)) return true;
    } catch {
      /* try next cert */
    }
  }
  return false;
}

/** Find and decode an Aadhaar Secure QR in a photo. Tries a few sizes — the QR is dense. */
export async function scanAadhaarQr(buffer: Buffer): Promise<AadhaarQrScan> {
  const frames = await rgbaFrames(buffer, [1800, 1200, 2600]);
  let sawQr = false;
  let legacyAadhaar = false;
  for (const frame of frames) {
    const qr = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
    if (!qr?.data) continue;
    sawQr = true;
    if (/PrintLetterBarcodeData/i.test(qr.data)) {
      legacyAadhaar = true;
      break;
    }
    const parsed = parseSecureQrPayload(qr.data);
    if (!parsed) continue;
    return {
      found: true,
      secure: true,
      data: parsed.data,
      signatureValid: verifySecureQrSignature(parsed.signed, parsed.signature),
    };
  }
  return sawQr ? { found: true, secure: false, legacyAadhaar } : { found: false };
}

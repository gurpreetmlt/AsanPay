import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
/** Values written before versioning have no prefix; they were all encrypted the same way as v1. */
const VERSION_PREFIX = "v1:";

export function parseAesKey(raw: string, name = "AES_ENCRYPTION_KEY"): Buffer {
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes (base64-encoded AES-256 key)`);
  }
  return key;
}

function decryptionKeys(): Buffer[] {
  const keys = [parseAesKey(env.AES_ENCRYPTION_KEY)];
  const previous = env.AES_ENCRYPTION_KEY_PREVIOUS?.trim();
  if (previous) keys.push(parseAesKey(previous, "AES_ENCRYPTION_KEY_PREVIOUS"));
  return keys;
}

export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Accepts `v1:`-prefixed and legacy unprefixed values; tries each key in order (current, then previous). */
export function decryptWithKeys(encoded: string, keys: Buffer[]): string {
  const body = encoded.startsWith(VERSION_PREFIX) ? encoded.slice(VERSION_PREFIX.length) : encoded;
  const raw = Buffer.from(body, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  let lastErr: unknown = new Error("No AES key available to decrypt");
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Encrypts PII (PAN, Aadhaar) for storage. Output is `v1:` + base64(iv + authTag + ciphertext),
// so it fits in a single text column.
export function encryptPII(plaintext: string): string {
  return encryptWithKey(plaintext, parseAesKey(env.AES_ENCRYPTION_KEY));
}

export function decryptPII(encoded: string): string {
  return decryptWithKeys(encoded, decryptionKeys());
}

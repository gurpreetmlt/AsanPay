import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 TOTP: HMAC-SHA1, 6 digits, 30 s step. Pure helpers — no DB / env access. */
export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;
export const TOTP_WINDOW = 1;
export const TOTP_SECRET_BYTES = 20;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Accepts lower case, spaces, dashes and `=` padding (what users paste from authenticator apps). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

export function totpStepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function generateTotp(secretBase32: string, nowMs = Date.now(), digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretBase32), totpStepAt(nowMs), digits);
}

function codesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Returns the matched time step, or null. Steps at or below `lastUsedStep` are rejected so a
 * code that already signed someone in cannot be replayed inside its validity window.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { nowMs?: number; window?: number; lastUsedStep?: number | null } = {},
): number | null {
  const candidate = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(candidate)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStepAt(opts.nowMs ?? Date.now());
  const window = opts.window ?? TOTP_WINDOW;
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (step < 0) continue;
    if (opts.lastUsedStep != null && step <= opts.lastUsedStep) continue;
    if (codesEqual(hotp(secret, step), candidate)) return step;
  }
  return null;
}

export const BACKUP_CODE_COUNT = 10;
/** No 0/O/1/I so codes survive being read aloud or written down. */
const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Canonical form for hashing: upper case, no spaces or dashes. */
export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isBackupCodeShape(input: string): boolean {
  return /^[A-Z0-9]{10}$/.test(normalizeBackupCode(input));
}

export function hashBackupCode(input: string): string {
  return createHash("sha256").update(normalizeBackupCode(input)).digest("hex");
}

/** `XXXXX-XXXXX` codes; store only `hashBackupCode` of each. */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(10);
    let raw = "";
    for (const b of bytes) raw += BACKUP_ALPHABET[b % BACKUP_ALPHABET.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function buildOtpauthUrl(secretBase32: string, issuer: string, account: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

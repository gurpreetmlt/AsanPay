import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string compare for secrets (webhook tokens, shared keys). Both sides are hashed to
 * equal-length digests first, so neither the content nor the length of the expected value leaks.
 * Empty / missing values never match.
 */
export function safeEqual(got: string | null | undefined, expected: string | null | undefined): boolean {
  if (typeof got !== "string" || typeof expected !== "string" || !got || !expected) return false;
  const a = createHash("sha256").update(got, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

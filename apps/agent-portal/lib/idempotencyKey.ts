/**
 * Stable idempotency keys for money-moving API calls.
 * Reuse the same key across retries of one user attempt; mint a new key only for a new intent
 * (success, or user changed amount / closed the form).
 */

export function newIdempotencyKey(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`.slice(0, 100);
}

/** Hold one key for an in-flight attempt; clear after success or when starting a new intent. */
export function createAttemptKeyHolder(prefix: string) {
  let current: string | null = null;
  return {
    get(): string {
      if (!current) current = newIdempotencyKey(prefix);
      return current;
    },
    clear(): void {
      current = null;
    },
  };
}

/**
 * Stable idempotency keys for money-moving API calls (admin portal).
 */

export function newIdempotencyKey(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`.slice(0, 100);
}

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

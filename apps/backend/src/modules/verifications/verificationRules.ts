/** Pure rules for the admin Verifications panel (no DB) — bulk on/off planning and order validation. */

export type BulkItem = { check: string; provider: string };
export type BulkSkip = BulkItem & { reason: string };
export type CheckState = { label: string; providers: readonly string[]; disabled: readonly string[] };

/** Field-specific error when `order` is not a permutation of `allowed`, else null. */
export function orderError(
  label: string,
  allowed: readonly string[],
  order: readonly string[],
  nameOf: (provider: string) => string = (p) => p,
): string | null {
  const seen = new Set<string>();
  for (const p of order) {
    if (!allowed.includes(p)) return `${label}: ${nameOf(p)} is not an API for this check`;
    if (seen.has(p)) return `${label}: ${nameOf(p)} is listed more than once`;
    seen.add(p);
  }
  const missing = allowed.find((p) => !seen.has(p));
  if (missing) return `${label}: the order is missing ${nameOf(missing)}`;
  return null;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

/**
 * Which selected APIs actually change. Unknown pairs, repeats and APIs already in the requested
 * state are skipped with a reason instead of failing the whole batch.
 */
export function planBulkToggle(
  items: readonly BulkItem[],
  enabled: boolean,
  states: Readonly<Record<string, CheckState | undefined>>,
  nameOf: (provider: string) => string = (p) => p,
): { applied: BulkItem[]; skipped: BulkSkip[]; disabled: Record<string, string[]> } {
  const applied: BulkItem[] = [];
  const skipped: BulkSkip[] = [];
  const disabled: Record<string, string[]> = {};
  const seen = new Set<string>();

  for (const item of items) {
    const state = states[item.check];
    if (!state) {
      skipped.push({ ...item, reason: "Unknown verification check" });
      continue;
    }
    if (!state.providers.includes(item.provider)) {
      skipped.push({ ...item, reason: `${nameOf(item.provider)} has no API for ${state.label}` });
      continue;
    }
    const key = `${item.check}:${item.provider}`;
    if (seen.has(key)) {
      skipped.push({ ...item, reason: "Selected more than once — changed once" });
      continue;
    }
    seen.add(key);
    const current = disabled[item.check] ?? [...state.disabled];
    const isOn = !current.includes(item.provider);
    if (isOn === enabled) {
      skipped.push({ ...item, reason: enabled ? "Already on" : "Already off" });
      continue;
    }
    disabled[item.check] = enabled ? current.filter((p) => p !== item.provider) : [...current, item.provider];
    applied.push(item);
  }
  return { applied, skipped, disabled };
}

import { createHash } from "node:crypto";
import { db } from "../../db/postgres";
import { biometricReplayGuard } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";

// UIDAI PID XML embeds a capture timestamp, e.g. <Pid ts="2026-07-17T10:15:00" ...>. A biometric
// scan older than this is stale even if it's never been submitted before — the customer's finger
// was captured, sat around, then submitted later than a live counter transaction ever would.
const MAX_BIOMETRIC_AGE_MS = 120_000; // 2 minutes

/**
 * RD services write the device's local (IST) time without an offset, e.g. "2026-07-17T10:15:00".
 * `new Date()` would read that as server time (UTC in the container) — 5h30m off — so a bare
 * timestamp is treated as IST. Timestamps that carry Z or ±hh:mm keep their own offset.
 */
export function extractTimestamp(payload: string): Date | null {
  const m = payload.match(/\bts="([^"]+)"/);
  if (!m) return null;
  const raw = m[1]!.trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const d = new Date(hasZone ? raw : `${raw.replace(" ", "T")}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Rejects a biometric payload that's either too old or has been submitted before. Must run
 * BEFORE the payload reaches any provider call or money movement — a rejected payload never
 * gets that far, so a failed/retried transaction can only succeed with a fresh scan.
 *
 * Mock/test payloads without an embedded `ts` skip the age check (no real PID XML yet) but still
 * go through hash-uniqueness — that alone is enough to prove the fix works end-to-end, and the
 * age check activates for free the moment real PID XML starts flowing through this path.
 */
export async function assertFreshBiometric(payload: string): Promise<void> {
  // Testing escape hatch: reuse the same finger scan without the replay/age checks.
  if (env.ALLOW_BIOMETRIC_REPLAY) return;

  const ts = extractTimestamp(payload);
  if (ts) {
    const ageMs = Date.now() - ts.getTime();
    if (ageMs > MAX_BIOMETRIC_AGE_MS || ageMs < -5_000) {
      // also reject a timestamp implausibly in the future (clock skew abuse)
      throw new HttpError(
        401,
        "Fingerprint / face capture has expired — capture again to continue.",
        "STALE_BIOMETRIC_TIMESTAMP",
      );
    }
  }

  const payloadHash = createHash("sha256").update(payload).digest("hex");
  try {
    await db.insert(biometricReplayGuard).values({ payloadHash });
  } catch (err) {
    // Unique-constraint violation == this exact payload was already used for a prior attempt.
    throw new HttpError(
      401,
      "This fingerprint / face capture was already used — capture again to retry.",
      "STALE_BIOMETRIC_RETRY_REQUIRED",
    );
  }
}
